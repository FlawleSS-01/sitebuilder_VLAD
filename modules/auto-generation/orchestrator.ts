import fs from "fs";
import path from "path";
import { runExclusiveForProject } from "../build/utils/projectSettingsLock.js";
import {
  getProjectPath,
  getProjectSettings,
  saveProjectSettings,
} from "../build/utils/projectManager.js";
import {
  copyThemeToProject,
  updateIndexCSS,
  syncProjectIndexCssFromTemplate,
  getAvailableThemes,
} from "../build/utils/themeManager.js";
import { updateProjectEnv } from "../build/utils/envManager.js";
import {
  getAvailableBannerBrands,
  applyBannersToProject,
  clearProjectBanners,
  type AppliedBanners,
} from "../build/utils/bannerManager.js";
import { promptLanguageForLocale } from "../build/utils/localePresets.js";
import {
  generatePageContentCore,
  generateCustomPageContentCore,
} from "../text-generation/generateCore.js";
import {
  pickReferenceFiles,
  getReferenceCount,
  isReferenceLayerEnabled,
} from "../text-generation/referenceTexts.js";
import {
  generatePageImagesCore,
  persistPageImagesInProjectSettings,
} from "../image-generation/controller.js";
import { generateLogoAndFaviconForProject } from "../image-generation/logoCore.js";
import { shouldUseRunware } from "../image-generation/imageProvider.js";
import { ensureRunwareInitialized } from "../image-generation/runwareSetup.js";
import {
  ensureProjectDistBuilt,
  buildAndArchiveProject,
} from "../build/utils/archiveManager.js";
import { uploadDirectoryToServer } from "../build/utils/serverUpload.js";
import {
  buildAutoRandomPlan,
  mergeGlobalKeywords,
  type PagePlan,
} from "./randomizer.js";
import { persistGeneratedPages } from "./persistPages.js";
import { runQualityCheck } from "./qc.js";
import {
  startAutoRun,
  setAutoStep,
  finishAutoRun,
  failAutoRun,
  setAutoCost,
  patchAutoGeneration,
  getAutoGenerationState,
} from "./status.js";
import {
  createEmptyCost,
  addOpenAiUsageCost,
  addImageCost,
  addFaviconCost,
  roundCost,
} from "./cost.js";
import { autoGenLog, logAutoGenCost } from "./logger.js";
import {
  runWithConcurrency,
  getGenerationConcurrency,
  getImageConcurrency,
} from "./concurrency.js";
import {
  shouldSkipPageText,
  shouldSkipPageImages,
  shouldSkipFavicon,
  getPageInfo,
} from "./reuse.js";
import type {
  AutoGenerationOptions,
  AutoGenerationCost,
  AutoStepKey,
} from "./types.js";
import { AUTO_ERRORS } from "./errors.js";

const runningAuto = new Set<string>();

function persistCostSnapshot(
  projectName: string,
  cost: AutoGenerationCost,
  logLabel?: string
): void {
  const rounded = roundCost(cost);
  setAutoCost(projectName, rounded);
  if (logLabel) {
    logAutoGenCost(projectName, rounded, logLabel);
  }
}

function markStepDone(projectName: string, key: AutoStepKey): void {
  setAutoStep(projectName, key, "done");
}

function markStepRunning(projectName: string, key: AutoStepKey): void {
  setAutoStep(projectName, key, "running");
}

function validateOptions(
  settings: ReturnType<typeof getProjectSettings>,
  options: AutoGenerationOptions
): void {
  if (!settings?.domain?.trim()) {
    throw new Error(AUTO_ERRORS.missingDomain);
  }
  if (!settings?.affiliateLink?.trim()) {
    throw new Error(AUTO_ERRORS.missingAffiliate);
  }
  const s = options.server;
  if (!s?.host?.trim() || !s?.username?.trim() || !s?.password) {
    throw new Error(AUTO_ERRORS.missingServer);
  }
  if (shouldUseRunware() && !process.env.RUNWARE_API_KEY) {
    throw new Error(AUTO_ERRORS.missingRunwareKey);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error(AUTO_ERRORS.missingOpenAiKey);
  }
}

async function stepDesign(
  projectName: string,
  options: AutoGenerationOptions
): Promise<{ plan: ReturnType<typeof buildAutoRandomPlan>; cost: AutoGenerationCost }> {
  const cost = createEmptyCost();
  const projectPath = getProjectPath(projectName);
  const themes = getAvailableThemes();
  const plan = buildAutoRandomPlan({
    projectName,
    availableThemes: themes,
    customPages: options.customPages,
    themeChoice: options.themeChoice,
    availableBannerBrands: getAvailableBannerBrands(),
    bannerMode: options.bannerMode,
  });

  copyThemeToProject(projectPath, plan.themeName);
  syncProjectIndexCssFromTemplate(projectPath);
  updateIndexCSS(projectPath, plan.themeName);

  // Баннеры: пара «горизонтальный + вертикальный» из разных папок docs/.
  let appliedBanners: AppliedBanners | null = null;
  if (plan.banners) {
    appliedBanners = applyBannersToProject(projectPath, plan.banners);
    autoGenLog(
      projectName,
      `Баннеры: ${plan.banners.horizontalBrand.toUpperCase()} (гориз.) + ${plan.banners.verticalBrand.toUpperCase()} (верт.)`
    );
  } else {
    clearProjectBanners(projectPath);
    autoGenLog(projectName, "Баннеры: выключены для этого сайта");
  }

  const settings = getProjectSettings(projectName);
  if (!settings) throw new Error(AUTO_ERRORS.projectNotFound);

  saveProjectSettings(projectPath, {
    ...settings,
    heroButtons: plan.heroButtons,
    autoGeneration: {
      ...(settings as Record<string, unknown>).autoGeneration as object,
      selection: {
        themeName: plan.themeName,
        banners: plan.banners,
        pages: Object.fromEntries(
          plan.pages.map((p) => [
            p.pageType,
            { blocks: p.blocks, blockTemplates: p.blockTemplates },
          ])
        ),
      },
    },
  } as Parameters<typeof saveProjectSettings>[1]);

  updateProjectEnv(projectPath, {
    affiliateLink: settings.affiliateLink || "",
    brand: settings.brand,
    domain: settings.domain || "",
    app: settings.app?.fileName || "/go",
    button1Text: plan.heroButtons.button1Text,
    button2Text: plan.heroButtons.button2Text,
    banners: appliedBanners,
  });

  return { plan, cost };
}

async function stepPages(
  projectName: string,
  plan: ReturnType<typeof buildAutoRandomPlan>,
  globalKeywords: string | undefined,
  cost: AutoGenerationCost
): Promise<{ pages: PagePlan[] }> {
  const settings = getProjectSettings(projectName);
  if (!settings) throw new Error(AUTO_ERRORS.projectNotFound);

  const locales =
    settings.locales?.length > 0
      ? settings.locales
      : [settings.defaultLocale || "en"];

  const localizedPages: Record<string, Record<string, unknown>> = {};
  for (const loc of locales) {
    localizedPages[loc] = {};
  }

  const pagesInfo: Record<string, unknown> = {};
  const blockKeywordsGlobal = globalKeywords?.trim() || "";

  // 1) pagesInfo и метаданные — независимо от GPT-результата.
  // 2) Собираем список задач (страница × локаль), которые реально надо генерировать.
  type TextTask = {
    pagePlan: PagePlan;
    locale: string;
    keywords: Record<string, string>;
  };
  const tasks: TextTask[] = [];

  for (const pagePlan of plan.pages) {
    const keywords = mergeGlobalKeywords(pagePlan.blocks, {}, blockKeywordsGlobal);
    const existing = getPageInfo(projectName, pagePlan.pageType);
    let allLocalesSkipped = true;

    for (const locale of locales) {
      if (shouldSkipPageText(projectName, pagePlan.pageType, locale)) {
        autoGenLog(
          projectName,
          `Тексты: «${pagePlan.pageType}» (${locale}) — уже есть, пропуск GPT`
        );
        continue;
      }
      allLocalesSkipped = false;
      tasks.push({ pagePlan, locale, keywords });
    }

    if (allLocalesSkipped && existing?.generated) {
      autoGenLog(
        projectName,
        `Тексты: страница «${pagePlan.pageType}» полностью из кэша проекта`
      );
    }

    pagesInfo[pagePlan.pageType] = {
      pageType: pagePlan.pageType,
      blocks: pagePlan.blocks,
      generated: true,
      blockTemplates: pagePlan.blockTemplates,
      blockKeywords: keywords,
      ...(pagePlan.isCustom
        ? {
            isCustom: true,
            pageName: pagePlan.pageName,
            displayName: pagePlan.displayName || pagePlan.pageName,
          }
        : {}),
    };
  }

  const concurrency = getGenerationConcurrency();
  autoGenLog(
    projectName,
    `Тексты: ${tasks.length} задач (страница×локаль), параллельно по ${concurrency}`
  );

  // Референсы: на весь проект выбираем N случайных реальных текстов из
  // docs/text-reference. Для каждой страницы берётся соответствующий лист —
  // модель пишет свой оригинальный контент в их стиле/структуре.
  const referenceFiles = isReferenceLayerEnabled()
    ? pickReferenceFiles(getReferenceCount())
    : [];
  if (referenceFiles.length > 0) {
    autoGenLog(
      projectName,
      `Референсы (docs/text-reference): ${referenceFiles
        .map((f) => path.basename(f))
        .join(", ")}`
    );
  } else if (isReferenceLayerEnabled()) {
    autoGenLog(
      projectName,
      "Референсы: файлы в docs/text-reference не найдены — генерация без них"
    );
  }

  // Глобальный faq.json больше не генерируется: у каждой страницы есть свой
  // FAQ-блок (минимум 5 вопросов) — это экономит отдельный GPT-запрос.

  // Параллельная генерация всех страниц/локалей с ограничением одновременных запросов.
  const pagesPromise = runWithConcurrency(
    tasks,
    concurrency,
    async (task) => {
      const { pagePlan, locale, keywords } = task;
      const language = promptLanguageForLocale(locale);
      try {
        const result =
          pagePlan.isCustom && pagePlan.pageName
            ? await generateCustomPageContentCore({
                brand: settings.brand,
                language,
                country: settings.country,
                domain: settings.domain,
                affiliateLink: settings.affiliateLink,
                pageName: pagePlan.pageName,
                blocks: pagePlan.blocks,
                blockTemplates: pagePlan.blockTemplates,
                blockKeywords: keywords,
                projectName,
                referenceFiles,
              })
            : await generatePageContentCore({
                brand: settings.brand,
                language,
                country: settings.country,
                domain: settings.domain,
                affiliateLink: settings.affiliateLink,
                pageType: pagePlan.pageType,
                blocks: pagePlan.blocks,
                blockTemplates: pagePlan.blockTemplates,
                blockKeywords: keywords,
                projectName,
                referenceFiles,
              });
        addOpenAiUsageCost(cost, result.usage);
        localizedPages[locale][pagePlan.pageType] = result.data;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          AUTO_ERRORS.pageTextFailed(pagePlan.pageType, locale, msg)
        );
      }
    }
  );

  await pagesPromise;

  persistGeneratedPages({
    projectName,
    localizedPages,
    pagesInfo,
  });

  persistCostSnapshot(projectName, cost, "После текстов");
  return { pages: plan.pages };
}

async function stepImages(
  projectName: string,
  pages: PagePlan[],
  cost: AutoGenerationCost
): Promise<void> {
  const runwareOn = shouldUseRunware();
  if (runwareOn && !process.env.RUNWARE_API_KEY) {
    throw new Error(AUTO_ERRORS.missingRunwareKey);
  }
  if (runwareOn) {
    ensureRunwareInitialized();
  }

  const imageTasks = pages.filter((pagePlan) => {
    if (shouldSkipPageImages(projectName, pagePlan.pageType, pagePlan.imageCount)) {
      autoGenLog(
        projectName,
        `Изображения: «${pagePlan.pageType}» — уже есть (${pagePlan.imageCount}+), пропуск`
      );
      return false;
    }
    return true;
  });

  const imageConcurrency = getImageConcurrency();
  autoGenLog(
    projectName,
    `Изображения: ${imageTasks.length} страниц, параллельно по ${imageConcurrency}`
  );

  // Разные страницы пишут файлы с уникальными именами, persist под локом — параллелим безопасно.
  await runWithConcurrency(imageTasks, imageConcurrency, async (pagePlan) => {
    autoGenLog(
      projectName,
      `Изображения: страница «${pagePlan.pageType}» (${pagePlan.imageCount} шт.)…`
    );
    const { images } = await generatePageImagesCore(
      projectName,
      pagePlan.pageType,
      pagePlan.pageName,
      pagePlan.isCustom,
      runwareOn,
      pagePlan.imageCount
    );

    if (images.length === 0) {
      throw new Error(
        AUTO_ERRORS.pageImageFailed(
          pagePlan.pageType,
          "Не удалось сгенерировать ни одного изображения"
        )
      );
    }

    await persistPageImagesInProjectSettings(
      projectName,
      pagePlan.pageType,
      images
    );

    if (runwareOn) {
      addImageCost(cost, images.filter((i) => !i.placeholder).length);
    }
  });

  persistCostSnapshot(projectName, cost, "После изображений");
}

async function stepFavicon(
  projectName: string,
  cost: AutoGenerationCost
): Promise<void> {
  if (shouldSkipFavicon(projectName)) {
    autoGenLog(projectName, "Favicon — уже есть, пропуск");
    persistCostSnapshot(projectName, cost, "После favicon");
    return;
  }
  try {
    const result = await generateLogoAndFaviconForProject(projectName);
    if (!result.placeholder && shouldUseRunware()) {
      addFaviconCost(cost, 1);
    }
    persistCostSnapshot(projectName, cost, "После favicon");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(AUTO_ERRORS.faviconFailed(msg));
  }
}

async function stepBuildArchiveUpload(
  projectName: string,
  options: AutoGenerationOptions,
  cost: AutoGenerationCost
): Promise<void> {
  const projectPath = getProjectPath(projectName);
  const tempDir = path.join(process.cwd(), "temp");
  fs.mkdirSync(tempDir, { recursive: true });
  const archivePath = path.join(
    tempDir,
    `${projectName}-auto-${Date.now()}.zip`
  );

  try {
    await ensureProjectDistBuilt(projectPath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(AUTO_ERRORS.buildFailed(msg));
  }

  try {
    await buildAndArchiveProject(projectPath, archivePath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(AUTO_ERRORS.archiveFailed(msg));
  }

  patchAutoGeneration(projectName, { archivePath });

  const distPath = path.join(projectPath, "dist");
  const server = options.server;
  const settingsForUpload = getProjectSettings(projectName);
  const domainForUpload = settingsForUpload?.domain;
  let uploadedRemotePath = server.remotePath?.trim() || "/";
  try {
    const uploadResult = await uploadDirectoryToServer(
      {
        host: server.host.trim(),
        port: server.port,
        username: server.username.trim(),
        password: server.password,
        remotePath: server.remotePath?.trim() || "/",
      },
      distPath,
      { domain: domainForUpload }
    );
    uploadedRemotePath = uploadResult.remotePath;
    autoGenLog(
      projectName,
      `Загрузка завершена: ${uploadResult.filesUploaded} файлов по ${uploadResult.protocol} → ${uploadResult.remotePath}`
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(AUTO_ERRORS.uploadFailed(msg));
  }

  const settings = getProjectSettings(projectName);
  if (settings) {
    saveProjectSettings(projectPath, {
      ...settings,
      serverUpload: {
        host: server.host.trim(),
        port: server.port,
        username: server.username.trim(),
        remotePath: uploadedRemotePath,
      },
    });
  }
}

export async function runAutoGeneration(
  projectName: string,
  options: AutoGenerationOptions
): Promise<void> {
  if (runningAuto.has(projectName)) {
    throw new Error(AUTO_ERRORS.alreadyRunning);
  }
  runningAuto.add(projectName);

  const cost = createEmptyCost();
  autoGenLog(projectName, "Старт автогенерации");

  try {
    await runExclusiveForProject(projectName, async () => {
      const settings = getProjectSettings(projectName);
      validateOptions(settings, options);

      patchAutoGeneration(projectName, { options });
      startAutoRun(projectName);
      markStepDone(projectName, "creating");

      autoGenLog(projectName, "Шаг: design");
      markStepRunning(projectName, "design");
      const { plan } = await stepDesign(projectName, options);
      markStepDone(projectName, "design");

      autoGenLog(projectName, "Шаг: pages (тексты + FAQ)");
      markStepRunning(projectName, "pages");
      const { pages } = await stepPages(
        projectName,
        plan,
        options.globalKeywords,
        cost
      );
      markStepDone(projectName, "pages");

      autoGenLog(projectName, "Шаг: images");
      markStepRunning(projectName, "images");
      await stepImages(projectName, pages, cost);
      markStepDone(projectName, "images");

      autoGenLog(projectName, "Шаг: favicon");
      markStepRunning(projectName, "favicon");
      await stepFavicon(projectName, cost);
      markStepDone(projectName, "favicon");

      autoGenLog(projectName, "Шаг: qc");
      markStepRunning(projectName, "qc");
      const qc1 = runQualityCheck({ projectName });
      if (!qc1.ok) {
        throw new Error(AUTO_ERRORS.qcFailed(qc1.message || "unknown"));
      }
      markStepDone(projectName, "qc");

      autoGenLog(projectName, "Шаг: build → archive → upload");
      markStepRunning(projectName, "build");
      markStepRunning(projectName, "archive");
      markStepRunning(projectName, "upload");
      await stepBuildArchiveUpload(projectName, options, cost);
      markStepDone(projectName, "build");
      markStepDone(projectName, "archive");
      markStepDone(projectName, "upload");

      const qcFinal = runQualityCheck({
        projectName,
        requireBuild: true,
        requireArchive: true,
        requireUpload: true,
      });
      if (!qcFinal.ok) {
        throw new Error(AUTO_ERRORS.qcFailed(qcFinal.message || "unknown"));
      }

      const finalCost = roundCost(cost);
      setAutoCost(projectName, finalCost);
      // finishAutoRun помечает все шаги (включая "done") и ставит status="done".
      // Отдельный markStepDone(..., "done") здесь НЕ вызываем: setAutoStep вернул бы
      // status обратно в "running" и оверлей не закрылся бы.
      finishAutoRun(projectName, finalCost);
      logAutoGenCost(projectName, finalCost, "Итог автогенерации");
      autoGenLog(projectName, `Готово. Стоимость ≈ $${finalCost.total.toFixed(4)}`);
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    autoGenLog(projectName, `Ошибка: ${msg}`, "error");
    setAutoCost(projectName, roundCost(cost));
    logAutoGenCost(projectName, cost, "Расходы до ошибки");
    const activeStep = getAutoGenerationState(projectName)?.currentStep;
    failAutoRun(
      projectName,
      msg,
      activeStep && activeStep !== "done" ? activeStep : undefined
    );
    throw e;
  } finally {
    runningAuto.delete(projectName);
  }
}

export function isAutoGenerationRunning(projectName: string): boolean {
  return runningAuto.has(projectName);
}

import { Request, Response } from "express";
import { generateAndSaveImage } from "./index.js";
import { ensureRunwareInitialized } from "./runwareSetup.js";
import type { ImageSizeOption } from "./types.js";
import { parseImageSize } from "./types.js";
import {
  generateImagePromptAndAlt,
  type ImagePromptContext,
} from "./utils/imagePromptGenerator.js";
import {
  updateImageInJson,
  updateImageAltTitle,
} from "./utils/imagesJsonManager.js";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { shouldUseRunware } from "./imageProvider.js";
import {
  writePlaceholderWebp,
  writePlaceholderLogoWebp,
} from "./utils/placeholderImage.js";
import { runExclusiveForProject } from "../build/utils/projectSettingsLock.js";
import {
  getProjectSettings,
  saveProjectSettings,
  getProjectPath,
  projectExists,
} from "../build/utils/projectManager.js";
import { generateFavicons } from "../build/utils/faviconGenerator.js";
import { syncIndexHtmlHead } from "../build/utils/indexHtmlSync.js";

/** Favicon из logo.webp и ссылки в index.html — без падения генерации логотипа. */
async function ensureFaviconFromLogoFile(
  projectPath: string,
  logoAbsolutePath: string,
  manifestName: string
): Promise<void> {
  await generateFavicons(projectPath, logoAbsolutePath, manifestName);
  try {
    syncIndexHtmlHead(projectPath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[image-generation] syncIndexHtmlHead после favicon:", msg);
  }
}

interface GenerateImageRequest {
  prompt: string;
  size: ImageSizeOption;
  model?: string;
  pageType?: string;
  imageName?: string;
}

export const generateImage = async (req: Request, res: Response) => {
  try {
    const { prompt, size, model, pageType, imageName } =
      req.body as GenerateImageRequest;

    if (!prompt) {
      return res.status(400).json({
        error: "Missing required field: prompt",
      });
    }

    if (!size) {
      return res.status(400).json({
        error: "Missing required field: size",
      });
    }

    const projectsDir = path.join(process.cwd(), "projects");
    const fileName = imageName || `image-${Date.now()}.png`;
    const filePath = pageType
      ? path.join(projectsDir, pageType, fileName)
      : path.join(projectsDir, fileName);

    if (!shouldUseRunware()) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const webpPath = filePath.replace(/\.(png|jpg|jpeg)$/i, ".webp") || `${filePath}.webp`;
      await writePlaceholderWebp(webpPath, {
        label: "custom",
        brand: prompt.slice(0, 40),
        index: 0,
      });
      const outName = path.basename(webpPath);
      return res.json({
        success: true,
        data: {
          filePath: webpPath,
          url: `/projects/${pageType || ""}/${outName}`.replace(/\/+/g, "/"),
          placeholder: true,
        },
      });
    }

    if (!process.env.RUNWARE_API_KEY) {
      return res.status(500).json({
        error: "Runware API key is not configured",
      });
    }

    ensureRunwareInitialized();

    console.log(
      `[image-generation] Генерация изображения: ${prompt.substring(0, 50)}...`
    );

    const result = await generateAndSaveImage(prompt, size, filePath, model);

    res.json({
      success: true,
      data: {
        base64: result.base64,
        filePath: result.filePath,
        url: `/projects/${pageType || ""}/${fileName}`.replace(/\/+/g, "/"),
      },
    });
  } catch (error: any) {
    console.error("[image-generation] Ошибка:", error);
    res.status(500).json({
      error: "Failed to generate image",
      message: error.message,
    });
  }
};

interface GeneratePageImagesRequest {
  projectName: string;
  pageType: string;
  pageName?: string; // Для кастомных страниц
  isCustom?: boolean;
}

/** Совпадает со списком стандартных страниц в ProjectDetails (STANDARD_PAGES). */
const STANDARD_PAGE_TYPES_FOR_IMAGES = [
  "homepage",
  "casino",
  "slots",
  "games",
  "betting",
  "app",
  "login",
] as const;

const PAGE_JSON_MAP: Record<string, string> = {
  homepage: "main.json",
  casino: "casino.json",
  slots: "slots.json",
  games: "games.json",
  betting: "betting.json",
  app: "app.json",
  login: "login.json",
};

type GeneratedPageImage = {
  name: string;
  url: string;
  path: string;
  prompt: string;
  alt?: string;
  title?: string;
  placeholder?: boolean;
};

function pageHasRenderableJson(
  projectPath: string,
  pageType: string,
  pageInfo: Record<string, unknown> | undefined,
  defaultLocale: string
): boolean {
  if (pageInfo?.generated === true) return true;
  let rel: string | undefined;
  if (pageInfo && typeof pageInfo === "object") {
    const lf = pageInfo.localeFiles as Record<string, string> | undefined;
    rel =
      (typeof pageInfo.filePath === "string" && pageInfo.filePath) ||
      (lf && (lf[defaultLocale] || Object.values(lf)[0]));
  }
  if (rel) {
    const abs = path.join(projectPath, rel);
    if (fs.existsSync(abs)) return true;
  }
  const fn = PAGE_JSON_MAP[pageType] || `${pageType}.json`;
  const fallback = path.join(projectPath, "src", "pages", fn);
  return fs.existsSync(fallback);
}

/** Страницы с реальным JSON для сборки — включая те, что есть на диске, но не прописаны в pages. */
function collectImageGenerationJobs(
  projectPath: string,
  settings: Record<string, unknown>
): Array<{ pageType: string; pageName?: string; isCustom?: boolean }> {
  const pages = (settings.pages || {}) as Record<
    string,
    Record<string, unknown>
  >;
  const defaultLocale =
    (typeof settings.defaultLocale === "string" && settings.defaultLocale) ||
    (Array.isArray(settings.locales) && typeof settings.locales[0] === "string"
      ? settings.locales[0]
      : "en");

  const jobs: Array<{ pageType: string; pageName?: string; isCustom?: boolean }> =
    [];
  const seen = new Set<string>();

  for (const pt of STANDARD_PAGE_TYPES_FOR_IMAGES) {
    const pi = pages[pt];
    if (!pageHasRenderableJson(projectPath, pt, pi, defaultLocale)) continue;
    jobs.push({
      pageType: pt,
      pageName: typeof pi?.pageName === "string" ? pi.pageName : undefined,
      isCustom: !!pi?.isCustom,
    });
    seen.add(pt);
  }

  for (const [key, pi] of Object.entries(pages)) {
    if (seen.has(key)) continue;
    if (!pi || typeof pi !== "object") continue;
    if (
      pi.generated === true ||
      pi.isCustom === true ||
      pageHasRenderableJson(projectPath, key, pi, defaultLocale)
    ) {
      jobs.push({
        pageType: key,
        pageName: typeof pi.pageName === "string" ? pi.pageName : undefined,
        isCustom: !!pi.isCustom,
      });
      seen.add(key);
    }
  }

  return jobs;
}

export async function persistPageImagesInProjectSettings(
  projectName: string,
  pageType: string,
  images: GeneratedPageImage[]
): Promise<void> {
  await runExclusiveForProject(projectName, () => {
    const currentSettings = getProjectSettings(projectName);
    if (!currentSettings) {
      throw new Error(`Project settings not found for ${projectName}`);
    }
    const projectPath = getProjectPath(projectName);
    const existingPages = { ...(currentSettings.pages || {}) };

    if (existingPages[pageType]) {
      existingPages[pageType] = {
        ...existingPages[pageType],
        images: images || [],
        imagesGenerated: true,
      };
    } else {
      existingPages[pageType] = {
        pageType,
        blocks: [],
        generated: false,
        images: images || [],
        imagesGenerated: true,
      };
    }

    saveProjectSettings(projectPath, {
      ...currentSettings,
      pages: existingPages,
    });

    if (images && Array.isArray(images)) {
      for (const image of images) {
        if (image.name) {
          updateImageInJson(projectPath, image.name, {
            alt: image.alt || "",
            title: image.title || "",
            src: `/images/${image.name}`,
          });
        }
      }
    }
  });
}

export async function generatePageImagesCore(
  projectName: string,
  pageType: string,
  pageName: string | undefined,
  isCustom: boolean | undefined,
  runwareOn: boolean,
  imageCount = 3
): Promise<{ images: GeneratedPageImage[] }> {
  const pageFileName =
    isCustom && pageName
      ? pageName.toLowerCase().replace(/[^a-z0-9]/g, "_")
      : pageType;

  const projectPath = path.join(process.cwd(), "projects", projectName);
  const imagesDir = path.join(projectPath, "public", "images");

  fs.mkdirSync(imagesDir, { recursive: true });

  if (runwareOn) {
    ensureRunwareInitialized();
  }

  const settingsPath = path.join(projectPath, "project-settings.json");
  let country: string | undefined;
  let brand: string | undefined;
  let language: string | undefined;
  let imagePresets: Array<{
    id: string;
    name: string;
    sizes: { image1: string; image2: string; image3: string };
  }> = [];

  if (fs.existsSync(settingsPath)) {
    try {
      const settingsContent = fs.readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(settingsContent);
      country = settings.country;
      brand = settings.brand;
      language = settings.language;
      imagePresets = settings.imagePresets || [];
    } catch {
      console.warn(
        "[image-generation] Не удалось загрузить настройки проекта"
      );
    }
  }

  const defaultPreset = {
    sizes: {
      image1: "1024x1024",
      image2: "1280x704",
      image3: "1280x704",
    },
  };
  const activePreset =
    imagePresets.length > 0 ? imagePresets[0] : defaultPreset;

  const slotCount = Math.min(3, Math.max(1, imageCount));
  const generatedImages: GeneratedPageImage[] = [];

  for (let i = 1; i <= slotCount; i++) {
    const imageName =
      i === 1 ? `${pageFileName}.webp` : `${pageFileName}${i - 1}.webp`;

    const imagePath = path.join(imagesDir, imageName);

    const sizeKey = i === 1 ? "image1" : i === 2 ? "image2" : "image3";
    const sizeString = activePreset.sizes[sizeKey] || "1024x1024";
    const size = parseImageSize(sizeString, "1024x1024");

    const promptCtx: ImagePromptContext = {
      brand: brand || projectName,
      country: country || "NO COUNTRY",
      language: language || "English",
      pageType,
      pageName: isCustom ? pageName : undefined,
      imageSlot: i as 1 | 2 | 3,
      variation: `${pageType}-${i}-${Date.now()}`,
    };

    console.log(
      `[image-generation] (${pageType}) Слот ${i}/${slotCount} — генерация alt+промта по контексту: бренд=${promptCtx.brand}, страна=${promptCtx.country}`
    );

    const meta = await generateImagePromptAndAlt(promptCtx);

    console.log(
      `[image-generation] (${pageType}) Слот ${i}/${slotCount} — alt: "${meta.alt.slice(
        0,
        80
      )}...", промт: "${meta.prompt.slice(0, 80)}..."`
    );

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let promptOut = meta.prompt;
        let alt: string = meta.alt;
        let title: string = meta.title;

        if (!runwareOn) {
          await writePlaceholderWebp(imagePath, {
            label: `${pageType} · ${i}/${slotCount}`,
            brand: brand || projectName,
            index: i,
          });
          promptOut = "[placeholder]";
        } else {
          await generateAndSaveImage(meta.prompt, size, imagePath);
          console.log(
            `[image-generation] Изображение ${i}/${slotCount} успешно сгенерировано: ${imagePath}`
          );
        }

        const imageUrl = `/projects/${projectName}/public/images/${imageName}`;

        updateImageInJson(projectPath, imageName, {
          alt,
          title,
          src: `/images/${imageName}`,
        });

        generatedImages.push({
          name: imageName,
          url: imageUrl,
          path: imagePath,
          prompt: promptOut,
          alt,
          title,
          placeholder: !runwareOn,
        });
        lastError = null;
        break;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === 0) {
          console.warn(
            `[image-generation] Retry slot ${i}/${slotCount} for ${pageType}:`,
            lastError.message
          );
        }
      }
    }
    if (lastError) {
      console.error(
        `[image-generation] Ошибка при генерации изображения ${i}/${slotCount}:`,
        lastError.message
      );
    }
  }

  if (generatedImages.length === 0 && slotCount > 0) {
    const hint = runwareOn
      ? "Проверьте RUNWARE_API_KEY и логи Runware."
      : "Проверьте установку sharp (IMAGE_PROVIDER=placeholder).";
    throw new Error(`Не удалось сгенерировать ни одного изображения. ${hint}`);
  }

  return { images: generatedImages };
}

export const generatePageImages = async (req: Request, res: Response) => {
  try {
    const { projectName, pageType, pageName, isCustom } =
      req.body as GeneratePageImagesRequest;

    if (!projectName || !pageType) {
      return res.status(400).json({
        error: "Missing required fields: projectName, pageType",
      });
    }

    if (shouldUseRunware() && !process.env.RUNWARE_API_KEY) {
      return res.status(500).json({
        error: "Runware API key is not configured",
      });
    }

    const runwareOn = shouldUseRunware();
    if (runwareOn) {
      ensureRunwareInitialized();
    }

    const { images } = await generatePageImagesCore(
      projectName,
      pageType,
      pageName,
      isCustom,
      runwareOn
    );

    if (images.length === 0) {
      console.error(
        `[image-generation] Не удалось сгенерировать ни одной картинки для страницы ${pageType}`
      );
      return res.status(500).json({
        error: "Failed to generate any images",
        message: `Не удалось сгенерировать картинки для страницы ${pageType}. Проверьте логи сервера для деталей.`,
      });
    }

    res.json({
      success: true,
      data: {
        pageType,
        images,
      },
    });
  } catch (error: any) {
    console.error(
      "[image-generation] Ошибка при генерации картинок для страницы:",
      error
    );
    res.status(500).json({
      error: "Failed to generate page images",
      message: error.message,
    });
  }
};

interface GenerateAllProjectImagesRequest {
  projectName: string;
}

export function listImageGenerationJobsForProject(projectName: string): Array<{
  pageType: string;
  pageName?: string;
  isCustom?: boolean;
}> {
  const settings = getProjectSettings(projectName);
  if (!settings || typeof settings !== "object") {
    return [];
  }
  const projectPath = getProjectPath(projectName);
  return collectImageGenerationJobs(
    projectPath,
    settings as Record<string, unknown>
  );
}

export const getImageGenerationJobs = async (req: Request, res: Response) => {
  try {
    const { projectName } = req.params;

    if (!projectName) {
      return res.status(400).json({ error: "Missing projectName" });
    }
    if (!projectExists(projectName)) {
      return res.status(404).json({ error: "Project not found" });
    }

    const jobs = listImageGenerationJobsForProject(projectName);

    res.json({
      success: true,
      data: { jobs, count: jobs.length },
    });
  } catch (error: any) {
    console.error("[image-generation] image-jobs:", error);
    res.status(500).json({
      error: "Failed to list image generation jobs",
      message: error.message,
    });
  }
};

export const generateAllProjectImages = async (
  req: Request,
  res: Response
) => {
  try {
    const { projectName } = req.body as GenerateAllProjectImagesRequest;

    if (!projectName) {
      return res.status(400).json({
        error: "Missing required field: projectName",
      });
    }

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const settings = getProjectSettings(projectName);
    if (!settings || typeof settings !== "object") {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    if (shouldUseRunware() && !process.env.RUNWARE_API_KEY) {
      return res.status(500).json({
        error: "Runware API key is not configured",
        message: "Укажите RUNWARE_API_KEY в .env или IMAGE_PROVIDER=placeholder",
      });
    }

    const runwareOn = shouldUseRunware();
    if (runwareOn) {
      ensureRunwareInitialized();
    }

    const jobs = listImageGenerationJobsForProject(projectName);

    if (jobs.length === 0) {
      return res.status(400).json({
        error:
          "Нет страниц для генерации картинок (не найдены JSON страниц на диске и не отмечены как сгенерированные).",
        message:
          "Сначала сгенерируйте тексты страниц, затем повторите массовую генерацию картинок.",
      });
    }

    const results: Array<{
      pageType: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const job of jobs) {
      try {
        const { images } = await generatePageImagesCore(
          projectName,
          job.pageType,
          job.pageName,
          job.isCustom,
          runwareOn
        );

        if (images.length === 0) {
          results.push({
            pageType: job.pageType,
            success: false,
            error: "Не удалось сгенерировать ни одной картинки",
          });
          continue;
        }

        await persistPageImagesInProjectSettings(
          projectName,
          job.pageType,
          images
        );
        results.push({ pageType: job.pageType, success: true });
      } catch (err: any) {
        console.error(
          `[image-generation] generate-all: ошибка для ${job.pageType}:`,
          err
        );
        results.push({
          pageType: job.pageType,
          success: false,
          error: err.message || String(err),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    res.json({
      success: true,
      data: {
        results,
        totalGenerated: successCount,
      },
    });
  } catch (error: any) {
    console.error(
      "[image-generation] Ошибка при массовой генерации картинок:",
      error
    );
    res.status(500).json({
      error: "Failed to generate all project images",
      message: error.message,
    });
  }
};

interface GenerateSingleImageRequest {
  projectName: string;
  pageType: string;
  pageName?: string;
  isCustom?: boolean;
  imageIndex: number;
  existingImageName?: string;
  customPrompt?: string;
}

export const generateSingleImage = async (req: Request, res: Response) => {
  try {
    const {
      projectName,
      pageType,
      pageName,
      isCustom,
      imageIndex,
      existingImageName,
      customPrompt,
    } = req.body as GenerateSingleImageRequest;

    if (!projectName || !pageType || imageIndex === undefined) {
      return res.status(400).json({
        error: "Missing required fields: projectName, pageType, imageIndex",
      });
    }

    if (shouldUseRunware() && !process.env.RUNWARE_API_KEY) {
      return res.status(500).json({
        error: "Runware API key is not configured",
      });
    }

    const runwareOn = shouldUseRunware();
    if (runwareOn) {
      ensureRunwareInitialized();
    }

    // Определяем название страницы для имен файлов
    const pageFileName =
      isCustom && pageName
        ? pageName.toLowerCase().replace(/[^a-z0-9]/g, "_")
        : pageType;

    // Путь к папке images в проекте
    const projectPath = path.join(process.cwd(), "projects", projectName);
    const imagesDir = path.join(projectPath, "public", "images");

    // Создаем директорию если её нет
    fs.mkdirSync(imagesDir, { recursive: true });

    // Определяем имя файла (используем существующее или создаем новое)
    const imageName =
      existingImageName ||
      (imageIndex === 0
        ? `${pageFileName}.webp`
        : `${pageFileName}${imageIndex}.webp`);

    const imagePath = path.join(imagesDir, imageName);

    // Загружаем настройки проекта для получения страны, бренда, языка и пресетов
    const settingsPath = path.join(projectPath, "project-settings.json");
    let country: string | undefined;
    let brand: string | undefined;
    let language: string | undefined;
    let imagePresets: Array<{
      id: string;
      name: string;
      sizes: { image1: string; image2: string; image3: string };
    }> = [];

    if (fs.existsSync(settingsPath)) {
      try {
        const settingsContent = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(settingsContent);
        country = settings.country;
        brand = settings.brand;
        language = settings.language;
        imagePresets = settings.imagePresets || [];
      } catch (err) {
        console.warn(
          "[image-generation] Не удалось загрузить настройки проекта"
        );
      }
    }

    // Используем первый пресет или дефолтные размеры
    const defaultPreset = {
      sizes: {
        image1: "1024x1024",
        image2: "1280x704",
        image3: "1280x704",
      },
    };
    const activePreset =
      imagePresets.length > 0 ? imagePresets[0] : defaultPreset;

    // Определяем размер из пресета в зависимости от индекса
    const sizeKey =
      imageIndex === 0 ? "image1" : imageIndex === 1 ? "image2" : "image3";
    const sizeString = activePreset.sizes[sizeKey] || "1024x1024";
    const size = parseImageSize(sizeString, "1024x1024");

    // ИИ генерирует alt + title + промт изображения от контекста.
    // Кастомный пользовательский промт, если задан, переопределяет
    // только промт картинки (alt/title всё равно остаются содержательными).
    const slot = (imageIndex === 0 ? 1 : imageIndex === 1 ? 2 : 3) as 1 | 2 | 3;
    const promptCtx: ImagePromptContext = {
      brand: brand || projectName,
      country: country || "NO COUNTRY",
      language: language || "English",
      pageType,
      pageName: isCustom ? pageName : undefined,
      imageSlot: slot,
      variation: `${pageType}-${imageIndex}-${Date.now()}`,
    };

    const meta = await generateImagePromptAndAlt(promptCtx);
    const finalPrompt =
      customPrompt && customPrompt.trim() ? customPrompt.trim() : meta.prompt;

    console.log(
      `[image-generation] Перегенерация изображения ${imageIndex} для страницы ${pageType}: ${imageName}`
    );
    console.log(
      `[image-generation] Промт (${customPrompt ? "пользовательский" : "ИИ"}): "${finalPrompt.slice(
        0,
        80
      )}..."`
    );

    let alt: string = meta.alt;
    let title: string = meta.title;
    let promptOut = finalPrompt;

    if (!runwareOn) {
      await writePlaceholderWebp(imagePath, {
        label: `${pageType} · img ${imageIndex + 1}`,
        brand: brand || projectName,
        index: imageIndex + 1,
      });
      promptOut = "[placeholder]";
    } else {
      await generateAndSaveImage(finalPrompt, size, imagePath);
    }

    // URL для доступа к картинке
    const imageUrl = `/projects/${projectName}/public/images/${imageName}`;

    // Обновляем images.json
    updateImageInJson(projectPath, imageName, {
      alt,
      title,
      src: `/images/${imageName}`,
    });

    res.json({
      success: true,
      data: {
        image: {
          name: imageName,
          url: imageUrl,
          path: imagePath,
          prompt: promptOut,
          alt: alt,
          title: title,
          placeholder: !runwareOn,
        },
      },
    });
  } catch (error: any) {
    console.error(
      "[image-generation] Ошибка при перегенерации картинки:",
      error
    );
    res.status(500).json({
      error: "Failed to generate single image",
      message: error.message,
    });
  }
};

export const uploadImage = async (req: Request, res: Response) => {
  try {
    const {
      projectName,
      pageType,
      pageName,
      isCustom,
      imageIndex,
      existingImageName,
    } = req.body;

    if (!projectName || !pageType || imageIndex === undefined) {
      return res.status(400).json({
        error: "Missing required fields: projectName, pageType, imageIndex",
      });
    }

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({
        error: "No image file provided",
      });
    }

    // Путь к папке images в проекте
    const projectPath = path.join(process.cwd(), "projects", projectName);
    const imagesDir = path.join(projectPath, "public", "images");

    // Создаем директорию если её нет
    fs.mkdirSync(imagesDir, { recursive: true });

    // Определяем имя файла (всегда .webp)
    let imageName: string;
    if (existingImageName) {
      // Если указано существующее имя, заменяем расширение на .webp
      const nameWithoutExt = path.parse(existingImageName).name;
      imageName = `${nameWithoutExt}.webp`;
    } else {
      // Если имя не указано, используем имя страницы с индексом
      const pageFileName =
        isCustom && pageName
          ? pageName.toLowerCase().replace(/[^a-z0-9]/g, "_")
          : pageType;
      imageName =
        imageIndex === 0
          ? `${pageFileName}.webp`
          : `${pageFileName}${imageIndex}.webp`;
    }

    const imagePath = path.join(imagesDir, imageName);

    // Конвертируем изображение в WebP и сохраняем
    try {
      await sharp(file.buffer)
        .webp({ quality: 90 }) // Качество WebP (0-100)
        .toFile(imagePath);

      console.log(
        `[image-generation] Загружена и сконвертирована картинка для страницы ${pageType}: ${imageName} (исходный формат: ${
          path.extname(file.originalname) || "неизвестен"
        })`
      );
    } catch (conversionError: any) {
      console.error(
        "[image-generation] Ошибка при конвертации изображения:",
        conversionError
      );
      // Если конвертация не удалась, пробуем сохранить как есть
      fs.writeFileSync(imagePath, file.buffer);
      console.warn(
        `[image-generation] Изображение сохранено без конвертации: ${imageName}`
      );
    }

    // URL для доступа к картинке
    const imageUrl = `/projects/${projectName}/public/images/${imageName}`;

    // Обновляем images.json (для загруженных картинок alt/title будут пустыми или из существующих данных)
    // Загружаем существующие данные если есть
    const settingsPath = path.join(projectPath, "project-settings.json");
    let existingAlt: string | undefined;
    let existingTitle: string | undefined;

    if (fs.existsSync(settingsPath)) {
      try {
        const settingsContent = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(settingsContent);
        const pageInfo = settings.pages?.[pageType];
        if (pageInfo?.images?.[imageIndex]) {
          existingAlt = pageInfo.images[imageIndex].alt;
          existingTitle = pageInfo.images[imageIndex].title;
        }
      } catch (err) {
        // Игнорируем ошибки
      }
    }

    updateImageInJson(projectPath, imageName, {
      alt: existingAlt || "",
      title: existingTitle || "",
      src: `/images/${imageName}`,
    });

    res.json({
      success: true,
      data: {
        image: {
          name: imageName,
          url: imageUrl,
          path: imagePath,
          prompt: null, // Для загруженных картинок промта нет
          alt: existingAlt,
          title: existingTitle,
        },
      },
    });
  } catch (error: any) {
    console.error("[image-generation] Ошибка при загрузке картинки:", error);
    res.status(500).json({
      error: "Failed to upload image",
      message: error.message,
    });
  }
};

/** Логотип через Runware → PNG → sharp → public/images/logo.webp */
export const generateLogo = async (req: Request, res: Response) => {
  try {
    const { projectName } = req.body as { projectName?: string };

    if (!projectName) {
      return res.status(400).json({
        error: "Missing required field: projectName",
      });
    }

    const projectPath = path.join(process.cwd(), "projects", projectName);
    const settingsPath = path.join(projectPath, "project-settings.json");

    if (!fs.existsSync(settingsPath)) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    let brand = "Casino";
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const b = (settings.brand || "").trim();
      if (b) brand = b;
    } catch {
      /* use default */
    }

    const logoWebp = path.join(projectPath, "public", "images", "logo.webp");

    const manifestName =
      brand.replace(/[\r\n\x00-\x1f]/g, " ").trim().slice(0, 128) ||
      "Casino";

    if (!shouldUseRunware()) {
      console.log(
        `[image-generation] Плейсхолдер логотипа для ${projectName}, бренд: ${brand}`
      );
      await writePlaceholderLogoWebp(projectPath, brand);
      await ensureFaviconFromLogoFile(projectPath, logoWebp, manifestName);
      return res.json({
        success: true,
        data: {
          logo: {
            name: "logo.webp",
            url: `/projects/${projectName}/public/images/logo.webp`,
            path: logoWebp,
            placeholder: true,
          },
          faviconGenerated: true,
        },
      });
    }

    if (!process.env.RUNWARE_API_KEY) {
      return res.status(500).json({
        error: "Runware API key is not configured",
      });
    }

    ensureRunwareInitialized();

    const brandSafe = brand
      .replace(/[\r\n\x00-\x1f]/g, " ")
      .trim()
      .slice(0, 64);
    const brandForPrompt = brandSafe || "Casino";

    // Wordmark: только название бренда как яркая типографика (глобальный negative Runware запрещает текст).
    const prompt = `Horizontal casino wordmark logo banner. The ONLY readable text in the image must spell exactly: "${brandForPrompt}". Use one line of bold display typography — saturated color gradient on the letters (gold, electric blue, magenta neon, emerald accents), soft chromatic glow, subtle 3D bevel, luxury iGaming aesthetic, razor-sharp edges, centered, generous margins, dark navy-to-black background, high contrast, professional branding asset for website header. Do not add any other words, slogans, URLs, or symbols except those letters that form the brand name "${brandForPrompt}".`;

    const logoNegativePrompt =
      "watermark, stock watermark, QR code, illegible text, gibberish letters, misspelled words, wrong typography, extra random words, long slogan, tagline, subtitle, second line of marketing copy, duplicate overlapping text, cropped incomplete letters, busy cluttered background, low resolution, blurry, jpeg artifacts, deformed letters, mascot character, cartoon animal, photograph, realistic human face, clipart emblem with no readable brand text";

    const imagesDir = path.join(projectPath, "public", "images");
    fs.mkdirSync(imagesDir, { recursive: true });

    const tempPng = path.join(imagesDir, `logo-gen-${Date.now()}.png`);

    console.log(
      `[image-generation] Генерация логотипа (wordmark) для ${projectName}, бренд: ${brandForPrompt}`
    );
    await generateAndSaveImage(
      prompt,
      "1536x512",
      tempPng,
      undefined,
      logoNegativePrompt
    );

    await sharp(tempPng).webp({ quality: 90 }).toFile(logoWebp);
    try {
      fs.unlinkSync(tempPng);
    } catch {
      /* ignore */
    }

    const imageUrl = `/projects/${projectName}/public/images/logo.webp`;

    await ensureFaviconFromLogoFile(projectPath, logoWebp, manifestName);

    res.json({
      success: true,
      data: {
        logo: {
          name: "logo.webp",
          url: imageUrl,
          path: logoWebp,
        },
        faviconGenerated: true,
      },
    });
  } catch (error: any) {
    console.error("[image-generation] Ошибка при генерации логотипа:", error);
    res.status(500).json({
      error: "Failed to generate logo",
      message: error.message,
    });
  }
};

export const uploadLogo = async (req: Request, res: Response) => {
  try {
    const { projectName } = req.body;

    if (!projectName) {
      return res.status(400).json({
        error: "Missing required field: projectName",
      });
    }

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({
        error: "No image file provided",
      });
    }

    // Путь к папке images в проекте
    const projectPath = path.join(process.cwd(), "projects", projectName);
    const imagesDir = path.join(projectPath, "public", "images");

    // Создаем директорию если её нет
    fs.mkdirSync(imagesDir, { recursive: true });

    // Всегда сохраняем как logo.webp
    const imageName = "logo.webp";
    const imagePath = path.join(imagesDir, imageName);

    // Конвертируем изображение в WebP и сохраняем
    try {
      await sharp(file.buffer)
        .webp({ quality: 90 }) // Качество WebP (0-100)
        .toFile(imagePath);

      console.log(
        `[image-generation] Загружен и сконвертирован логотип для проекта ${projectName}: ${imageName} (исходный формат: ${
          path.extname(file.originalname) || "неизвестен"
        })`
      );
    } catch (conversionError: any) {
      console.error(
        "[image-generation] Ошибка при конвертации логотипа:",
        conversionError
      );
      // Если конвертация не удалась, пробуем сохранить как есть
      fs.writeFileSync(imagePath, file.buffer);
      console.warn(
        `[image-generation] Логотип сохранен без конвертации: ${imageName}`
      );
    }

    // URL для доступа к логотипу
    const imageUrl = `/projects/${projectName}/public/images/${imageName}`;

    const settingsPathUpload = path.join(projectPath, "project-settings.json");
    let manifestNameUpload = "Casino";
    if (fs.existsSync(settingsPathUpload)) {
      try {
        const s = JSON.parse(fs.readFileSync(settingsPathUpload, "utf-8"));
        const b = (s.brand || "").trim();
        if (b) manifestNameUpload = b;
      } catch {
        /* ignore */
      }
    }
    const manifestShort =
      manifestNameUpload.replace(/[\r\n\x00-\x1f]/g, " ").trim().slice(0, 128) ||
      "Casino";
    await ensureFaviconFromLogoFile(projectPath, imagePath, manifestShort);

    res.json({
      success: true,
      data: {
        logo: {
          name: imageName,
          url: imageUrl,
          path: imagePath,
        },
        faviconGenerated: true,
      },
    });
  } catch (error: any) {
    console.error("[image-generation] Ошибка при загрузке логотипа:", error);
    res.status(500).json({
      error: "Failed to upload logo",
      message: error.message,
    });
  }
};

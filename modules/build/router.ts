import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import {
  createProject,
  savePagesToProject,
  saveFAQToProject,
  saveProjectSettings,
  getAllProjects,
  getProjectSettings,
  projectExists,
  deleteProject,
  updateProjectSettings,
  updateProjectIndexHtmlLang,
  getProjectPath,
} from "./utils/projectManager.js";
import {
  getLocalePresetForCountry,
  getGeoPresetsForApi,
  matchGeoFromCountryInput,
  findGeoByCode,
  LANGUAGE_OPTIONS_FOR_UI,
} from "./utils/localePresets.js";
import {
  updateImageInJson,
  updateImageAltTitle,
} from "../image-generation/utils/imagesJsonManager.js";
import { updateProjectEnv, readProjectEnv } from "./utils/envManager.js";
import { generateFavicons } from "./utils/faviconGenerator.js";
import {
  getCurrentTheme,
  saveCustomTheme,
  copyThemeToProject,
  updateIndexCSS,
  syncProjectIndexCssFromTemplate,
  getAvailableThemes,
} from "./utils/themeManager.js";
import { getThemesCatalog } from "./utils/themeCatalog.js";
import { generatePagesData } from "./utils/pagesDataGenerator.js";
import { syncIndexHtmlHead } from "./utils/indexHtmlSync.js";
import { buildSeoEntityConfig } from "./utils/seoEntity.js";
import {
  createProjectArchive,
  buildAndArchiveProject,
  ensureProjectDistBuilt,
} from "./utils/archiveManager.js";
import { uploadDirectoryToServer } from "./utils/serverUpload.js";
import {
  createInitialAutoGenerationState,
  normalizeAutoCustomPages,
  type AutoGenerationOptions,
} from "../auto-generation/types.js";
import { runAutoGeneration, isAutoGenerationRunning } from "../auto-generation/orchestrator.js";
import { getAutoGenerationState } from "../auto-generation/status.js";
import {
  listDeployServers,
  upsertDeployServer,
} from "../auto-generation/deployServers.js";
import { runExclusiveForProject } from "./utils/projectSettingsLock.js";
// Настройка multer для загрузки файлов
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

const appUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});

const googleHtmlUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 512 * 1024, // 512KB на файл
    files: 20,
  },
  fileFilter: (_req, file, cb) => {
    const name = path.basename(file.originalname || "").toLowerCase();
    if (name.endsWith(".html")) {
      cb(null, true);
    } else {
      cb(new Error("Only .html files are allowed"));
    }
  },
});

const router = Router();

const parseJsonBody = (value: any, fieldName: string) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "object") {
    return value;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      const parseError: any = new Error(`Invalid JSON in field: ${fieldName}`);
      parseError.status = 400;
      throw parseError;
    }
  }
  return value;
};

// Пресеты GEO / языков для Create Project
router.get("/geo-presets", async (req, res) => {
  try {
    res.json({
      success: true,
      data: getGeoPresetsForApi(),
      languageOptions: LANGUAGE_OPTIONS_FOR_UI,
    });
  } catch (error: any) {
    console.error("[build] geo-presets:", error);
    res.status(500).json({
      error: "Failed to get geo presets",
      message: error.message,
    });
  }
});

// Получение списка доступных шаблонов
router.get("/templates", async (req, res) => {
  try {
    const { getAvailableTemplates } = await import("./utils/projectManager.js");
    const templates = getAvailableTemplates();

    res.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    console.error("[build] Ошибка при получении списка шаблонов:", error);
    res.status(500).json({
      error: "Failed to get templates",
      message: error.message,
    });
  }
});

// Создание проекта
router.post("/create-project", appUpload.single("apk"), async (req, res) => {
  try {
    const projectName = req.body.projectName;
    const templateName = req.body.templateName;
    const metadata = parseJsonBody(req.body.metadata, "metadata");
    const pages = parseJsonBody(req.body.pages, "pages");
    const pagesInfo = parseJsonBody(req.body.pagesInfo, "pagesInfo");

    if (!projectName) {
      return res.status(400).json({
        error: "Missing required field: projectName",
      });
    }

    if (!metadata) {
      return res.status(400).json({
        error: "Missing required field: metadata",
      });
    }

    const projectPath = createProject(
      projectName,
      templateName || "default-template"
    );
    let appFileName = "/go";
    const uploadedApp = (req as any).file;

    if (uploadedApp) {
      const originalName = path.basename(uploadedApp.originalname || "");
      const ext = path.extname(originalName).toLowerCase();

      if (ext !== ".apk") {
        return res.status(400).json({
          error: "Invalid file type. Only .apk files are allowed.",
        });
      }

      const baseName = path
        .basename(originalName, ext)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const safeFileName = `${baseName || "app"}${ext}`;
      const publicDir = path.join(projectPath, "public");
      const targetPath = path.join(publicDir, safeFileName);

      fs.mkdirSync(publicDir, { recursive: true });
      fs.writeFileSync(targetPath, uploadedApp.buffer);
      appFileName = safeFileName;
    }

    // Сохраняем страницы если они переданы
    let filePaths: Record<string, string> = {};
    if (pages && typeof pages === "object") {
      filePaths = savePagesToProject(projectPath, pages, pagesInfo);
    }

    // Дефолтный пресет для картинок
    const defaultImagePreset = {
      id: "default",
      name: "По умолчанию",
      sizes: {
        image1: "1024x1024",
        image2: "1280x704",
        image3: "1280x704",
      },
    };

    // Генерируем варианты стилей один раз для всего проекта
    const { generatePageVariants } = await import(
      "../text-generation/utils/variantGenerator.js"
    );
    const projectVariants = generatePageVariants();

    // Добавляем пути к файлам в pagesInfo
    const pagesWithFilePaths: Record<string, any> = {};
    if (pagesInfo) {
      for (const [key, value] of Object.entries(pagesInfo)) {
        pagesWithFilePaths[key] = {
          ...(typeof value === "object" && value !== null
            ? (value as Record<string, unknown>)
            : {}),
          ...(filePaths[key] ? { filePath: filePaths[key] } : {}),
        };
      }
    }

    const m = metadata as Record<string, any>;

    let primaryLanguage: string;
    let secondaryLanguages: string[];
    let locales: string[];
    let defaultLocale: string;

    const hasExplicit =
      Array.isArray(m.locales) &&
      m.locales.length > 0 &&
      typeof m.primaryLanguage === "string" &&
      typeof m.defaultLocale === "string";

    if (hasExplicit) {
      primaryLanguage = m.primaryLanguage;
      secondaryLanguages = Array.isArray(m.secondaryLanguages)
        ? m.secondaryLanguages
        : [];
      locales = [
        ...new Set(
          (m.locales as string[]).map((x: string) =>
            String(x).toLowerCase().replace(/_/g, "-")
          )
        ),
      ];
      defaultLocale = String(m.defaultLocale)
        .toLowerCase()
        .replace(/_/g, "-");
    } else {
      const langMap: Record<string, string> = {
        English: "en",
        Russian: "ru",
        German: "de",
        Spanish: "es",
        French: "fr",
        Italian: "it",
        Portuguese: "pt",
        Bengali: "bn",
        Urdu: "ur",
        Hindi: "hi",
      };
      const htmlLangHint =
        langMap[metadata.language] ||
        metadata.language?.toLowerCase().slice(0, 2) ||
        "en";
      const localePreset = getLocalePresetForCountry(metadata.country || "", {
        primaryLanguageHint: metadata.language,
        htmlLangHint,
      });
      primaryLanguage = localePreset.primaryLanguage;
      secondaryLanguages = localePreset.secondaryLanguages;
      locales = localePreset.locales;
      defaultLocale = localePreset.defaultLocale;
    }

    let geoCode: string | null =
      typeof m.geoCode === "string" &&
      m.geoCode &&
      m.geoCode !== "__CUSTOM__"
        ? m.geoCode.toUpperCase()
        : null;
    if (!geoCode && m.country) {
      geoCode = matchGeoFromCountryInput(String(m.country))?.geoCode ?? null;
    }

    const geoGuess =
      (geoCode && findGeoByCode(geoCode)) ||
      matchGeoFromCountryInput(String(m.country || "")) ||
      matchGeoFromCountryInput(String(m.geoLabel || ""));

    const geoLabel =
      typeof m.geoLabel === "string" && m.geoLabel.trim()
        ? m.geoLabel.trim()
        : geoGuess?.geoLabel || String(metadata.country || "");

    const country =
      typeof m.country === "string" && m.country.trim()
        ? m.country.trim()
        : geoLabel;

    const languagePresetSource:
      | "geo"
      | "user"
      | "manual" =
      m.languagePresetSource === "manual"
        ? "manual"
        : m.languagePresetSource === "user"
          ? "user"
          : "geo";

    updateProjectIndexHtmlLang(projectPath, defaultLocale);

    const generationMode =
      m.generationMode === "auto" ? ("auto" as const) : ("manual" as const);
    const autoGeneration = createInitialAutoGenerationState(generationMode);
    if (generationMode === "auto") {
      autoGeneration.options = {
        globalKeywords:
          typeof m.globalKeywords === "string" ? m.globalKeywords : undefined,
        customPages: normalizeAutoCustomPages(m.customPages),
        server: m.autoGenerationOptions?.server as AutoGenerationOptions["server"],
      };
    }

    const seoEntity = buildSeoEntityConfig({
      brand: metadata.brand,
      domain: metadata.domain,
      geoLabel,
      country,
      countryCode: geoCode || undefined,
      locales,
      htmlLang: defaultLocale,
      projectPath,
      overrides:
        m.seoEntity && typeof m.seoEntity === "object"
          ? (m.seoEntity as Record<string, unknown>)
          : undefined,
    });

    saveProjectSettings(projectPath, {
      brand: metadata.brand,
      language: primaryLanguage,
      primaryLanguage,
      secondaryLanguages,
      locales,
      defaultLocale,
      languageCount: locales.length,
      languagePresetSource,
      geoCode,
      geoLabel,
      htmlLang: defaultLocale,
      country,
      domain: metadata.domain,
      affiliateLink: metadata.affiliateLink,
      projectName: projectName,
      createdAt: new Date().toISOString(),
      pages: pagesWithFilePaths,
      imagePresets: [defaultImagePreset],
      variants: projectVariants,
      previewApproved: false,
      previewViewedAt: null,
      alwaysOpenPreviewAfterGeneration:
        m.alwaysOpenPreviewAfterGeneration === true,
      askBeforeBuild: m.askBeforeBuild !== false,
      autoGeneration,
      customPages: normalizeAutoCustomPages(m.customPages),
      seoEntity,
      app: {
        hasApp: appFileName !== "/go",
        fileName: appFileName !== "/go" ? appFileName : null,
        link: null,
      },
    });

    // Создаем .env файл
    const currentSettings = getProjectSettings(projectName);
    updateProjectEnv(projectPath, {
      affiliateLink: metadata.affiliateLink || "",
      brand: metadata.brand,
      domain: metadata.domain || "",
      app: appFileName,
      button1Text: currentSettings?.heroButtons?.button1Text,
      button2Text: currentSettings?.heroButtons?.button2Text,
    });

    try {
      syncIndexHtmlHead(projectPath);
    } catch (e: any) {
      console.warn("[build] syncIndexHtmlHead (create-project):", e?.message || e);
    }

    res.json({
      success: true,
      projectPath,
      projectName,
      message: `Проект ${projectName} создан`,
    });
  } catch (error: any) {
    console.error("[build] Ошибка:", error);
    res.status(error.status || 500).json({
      error: "Failed to create project",
      message: error.message,
    });
  }
});

// Загрузка или удаление APK для проекта
router.post("/project/:projectName/app", appUpload.single("apk"), async (req, res) => {
  try {
    const { projectName } = req.params;
    const action = req.body?.action;

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

    const projectPath = getProjectPath(projectName);
    const currentSettings = getProjectSettings(projectName);

    if (!currentSettings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    const currentAppInfo = currentSettings.app || {
      hasApp: false,
      fileName: null,
    };

    if (action === "remove") {
      if (currentAppInfo?.fileName) {
        const existingPath = path.join(projectPath, "public", currentAppInfo.fileName);
        if (fs.existsSync(existingPath)) {
          fs.unlinkSync(existingPath);
        }
      }

      const existingEnv = readProjectEnv(projectPath);
      updateProjectEnv(projectPath, {
        affiliateLink: currentSettings.affiliateLink || "",
        brand: currentSettings.brand || "",
        domain: currentSettings.domain || "",
        app: "/go",
        button1Text: currentSettings.heroButtons?.button1Text,
        button2Text: currentSettings.heroButtons?.button2Text,
      });

      saveProjectSettings(projectPath, {
        ...currentSettings,
        app: {
          hasApp: false,
          fileName: null,
          link: null,
        },
      });

      return res.json({
        success: true,
        message: "Приложение удалено",
      });
    }

    if (action === "link") {
      const link = (req.body?.link || "").toString().trim();
      if (!link) {
        return res.status(400).json({
          error: "Link is required",
        });
      }
      if (!/^https?:\/\//i.test(link)) {
        return res.status(400).json({
          error: "Link must start with http:// or https://",
        });
      }

      if (currentAppInfo?.fileName) {
        const existingPath = path.join(projectPath, "public", currentAppInfo.fileName);
        if (fs.existsSync(existingPath)) {
          fs.unlinkSync(existingPath);
        }
      }

      const existingEnv = readProjectEnv(projectPath);
      updateProjectEnv(projectPath, {
        affiliateLink: currentSettings.affiliateLink || "",
        brand: currentSettings.brand || "",
        domain: currentSettings.domain || "",
        app: link,
        button1Text: currentSettings.heroButtons?.button1Text,
        button2Text: currentSettings.heroButtons?.button2Text,
      });

      saveProjectSettings(projectPath, {
        ...currentSettings,
        app: {
          hasApp: true,
          fileName: null,
          link,
        },
      });

      return res.json({
        success: true,
        message: "Ссылка на приложение сохранена",
        app: {
          hasApp: true,
          fileName: null,
          link,
        },
      });
    }

    const uploadedApp = (req as any).file;
    if (!uploadedApp) {
      return res.status(400).json({
        error: "No APK file provided",
      });
    }

    const originalName = path.basename(uploadedApp.originalname || "");
    const ext = path.extname(originalName).toLowerCase();

    if (ext !== ".apk") {
      return res.status(400).json({
        error: "Invalid file type. Only .apk files are allowed.",
      });
    }

    const baseName = path
      .basename(originalName, ext)
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const safeFileName = `${baseName || "app"}${ext}`;
    const publicDir = path.join(projectPath, "public");
    const targetPath = path.join(publicDir, safeFileName);

    fs.mkdirSync(publicDir, { recursive: true });

    if (currentAppInfo?.fileName && currentAppInfo.fileName !== safeFileName) {
      const existingPath = path.join(projectPath, "public", currentAppInfo.fileName);
      if (fs.existsSync(existingPath)) {
        fs.unlinkSync(existingPath);
      }
    }

    fs.writeFileSync(targetPath, uploadedApp.buffer);

    const existingEnv = readProjectEnv(projectPath);
    updateProjectEnv(projectPath, {
      affiliateLink: currentSettings.affiliateLink || "",
      brand: currentSettings.brand || "",
      domain: currentSettings.domain || "",
      app: safeFileName,
      button1Text: currentSettings.heroButtons?.button1Text,
      button2Text: currentSettings.heroButtons?.button2Text,
    });

    saveProjectSettings(projectPath, {
      ...currentSettings,
      app: {
        hasApp: true,
        fileName: safeFileName,
        link: null,
      },
    });

    res.json({
      success: true,
      message: "Приложение загружено",
      app: {
        hasApp: true,
        fileName: safeFileName,
      },
    });
  } catch (error: any) {
    console.error("[build] Ошибка при работе с APK:", error);
    res.status(error.status || 500).json({
      error: "Failed to update APK",
      message: error.message,
    });
  }
});

// Получение списка всех проектов
router.get("/projects", async (req, res) => {
  try {
    const projects = getAllProjects();
    res.json({
      success: true,
      projects: projects.map((p) => {
        try {
          return {
            name: p.name,
            brand: p.metadata?.brand || p.name.split("-")[0],
            language: p.metadata?.language || "Unknown",
            country: p.metadata?.country || "Unknown",
            domain: p.metadata?.domain || "",
            createdAt: p.createdAt?.toISOString() || new Date().toISOString(),
            pages: p.metadata?.pages || {},
          };
        } catch (err: any) {
          console.warn(`[build] Ошибка при обработке проекта ${p.name}:`, err);
          // Возвращаем базовую информацию даже если есть ошибка
          return {
            name: p.name,
            brand: p.name.split("-")[0],
            language: "Unknown",
            country: "Unknown",
            domain: "",
            createdAt: new Date().toISOString(),
            pages: {},
          };
        }
      }),
    });
  } catch (error: any) {
    console.error("[build] Ошибка при получении списка проектов:", error);
    res.status(500).json({
      error: "Failed to get projects list",
      message: error.message,
    });
  }
});

// Удаление проекта
router.delete("/projects/:projectName", async (req, res) => {
  try {
    const { projectName } = req.params;

    if (!projectName) {
      return res.status(400).json({
        error: "Project name is required",
      });
    }

    await deleteProject(projectName);

    res.json({
      success: true,
      message: `Проект "${projectName}" успешно удалён`,
    });
  } catch (error: any) {
    console.error("[build] Ошибка при удалении проекта:", error);

    if (error.message?.includes("не найден")) {
      return res.status(404).json({
        error: "Project not found",
        message: error.message,
      });
    }

    if (error.message?.includes("Недопустимое")) {
      return res.status(400).json({
        error: "Invalid project name",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "Failed to delete project",
      message: error.message,
    });
  }
});

// Получение информации о конкретном проекте
router.get("/project/:projectName", async (req, res) => {
  try {
    const { projectName } = req.params;

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const settings = getProjectSettings(projectName);

    if (!settings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    res.json({
      success: true,
      project: settings,
    });
  } catch (error: any) {
    console.error("[build] Ошибка при получении проекта:", error);
    res.status(500).json({
      error: "Failed to get project",
      message: error.message,
    });
  }
});

// Статус preview: просмотр / подтверждение
router.post("/project/:projectName/preview-workflow", async (req, res) => {
  try {
    const { projectName } = req.params;
    const { action } = req.body as { action?: string };

    if (!projectName || !projectExists(projectName)) {
      return res.status(404).json({ error: "Project not found" });
    }

    const projectPath = getProjectPath(projectName);
    const cur = getProjectSettings(projectName);
    if (!cur) {
      return res.status(404).json({ error: "Project settings not found" });
    }

    /**
     * action: "viewed" | "approved" | "reset"
     */
    if (action === "viewed") {
      saveProjectSettings(projectPath, {
        ...cur,
        previewViewedAt: new Date().toISOString(),
      });
    } else if (action === "approved") {
      saveProjectSettings(projectPath, {
        ...cur,
        previewApproved: true,
        previewViewedAt: cur.previewViewedAt || new Date().toISOString(),
      });
    } else if (action === "reset") {
      saveProjectSettings(projectPath, {
        ...cur,
        previewApproved: false,
        previewViewedAt: null,
      });
    } else {
      return res.status(400).json({
        error: "Invalid action. Use viewed | approved | reset",
      });
    }

    const next = getProjectSettings(projectName);
    res.json({
      success: true,
      project: next,
    });
  } catch (error: any) {
    console.error("[build] preview-workflow:", error);
    res.status(500).json({
      error: "Failed to update preview workflow",
      message: error.message,
    });
  }
});

// Настройки workflow: preview после генерации, подтверждение перед build
router.put("/project/:projectName/workflow-settings", async (req, res) => {
  try {
    const { projectName } = req.params;
    const {
      alwaysOpenPreviewAfterGeneration,
      askBeforeBuild,
    } = req.body as {
      alwaysOpenPreviewAfterGeneration?: boolean;
      askBeforeBuild?: boolean;
    };

    if (!projectName || !projectExists(projectName)) {
      return res.status(404).json({ error: "Project not found" });
    }

    const projectPath = getProjectPath(projectName);
    const cur = getProjectSettings(projectName);
    if (!cur) {
      return res.status(404).json({ error: "Project settings not found" });
    }

    saveProjectSettings(projectPath, {
      ...cur,
      ...(typeof alwaysOpenPreviewAfterGeneration === "boolean"
        ? { alwaysOpenPreviewAfterGeneration }
        : {}),
      ...(typeof askBeforeBuild === "boolean" ? { askBeforeBuild } : {}),
    });

    const next = getProjectSettings(projectName);
    res.json({ success: true, project: next });
  } catch (error: any) {
    console.error("[build] workflow-settings:", error);
    res.status(500).json({
      error: "Failed to save workflow settings",
      message: error.message,
    });
  }
});

function collectTrackedGoogleHtmlNames(gh: any): string[] {
  if (!gh || typeof gh !== "object") return [];
  if (Array.isArray(gh.fileNames) && gh.fileNames.length > 0) {
    return gh.fileNames.filter((f: unknown) => typeof f === "string" && f);
  }
  if (typeof gh.fileName === "string" && gh.fileName) {
    return [gh.fileName];
  }
  return [];
}

// Загрузка HTML верификации с диска пользователя → public проекта
router.post(
  "/project/:projectName/google-html",
  googleHtmlUpload.array("files", 20),
  async (req, res) => {
    try {
      const { projectName } = req.params;
      const uploaded = (req as { files?: Express.Multer.File[] }).files;

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

      if (!uploaded?.length) {
        return res.status(400).json({
          error: "No .html files provided",
        });
      }

      const projectPath = getProjectPath(projectName);
      const projectPublicDir = path.join(projectPath, "public");
      fs.mkdirSync(projectPublicDir, { recursive: true });

      const currentSettings = getProjectSettings(projectName);
      if (!currentSettings) {
        return res.status(404).json({
          error: "Project settings not found",
        });
      }

      const savedNames: string[] = [];
      for (const file of uploaded) {
        const safeName = path.basename(file.originalname || "");
        if (!safeName.toLowerCase().endsWith(".html")) {
          continue;
        }
        fs.writeFileSync(path.join(projectPublicDir, safeName), file.buffer);
        savedNames.push(safeName);
      }

      if (savedNames.length === 0) {
        return res.status(400).json({
          error: "No valid .html files in upload",
        });
      }

      const prevTracked = collectTrackedGoogleHtmlNames(currentSettings.googleHtml);
      const fileNames = [...new Set([...prevTracked, ...savedNames])].sort();

      const updatedSettings = {
        ...currentSettings,
        googleHtml: {
          fileNames,
        },
      };

      saveProjectSettings(projectPath, updatedSettings);

      res.json({
        success: true,
        message: `Загружено файлов: ${savedNames.length}`,
        googleHtml: {
          fileNames,
        },
      });
    } catch (error: any) {
      console.error("[build] Ошибка при загрузке HTML файла:", error);
      res.status(500).json({
        error: "Failed to upload HTML file",
        message: error.message,
      });
    }
  }
);

// Сохранение страниц в проект (опционально localizedPages: { en: { homepage: ... }, bn: { ... } })
router.post("/save-pages", async (req, res) => {
  try {
    const { projectName, pages, pagesInfo, faq, localizedPages } = req.body;

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

    const projectPath = getProjectPath(projectName);
    let filePaths: Record<string, string> = {};

    if (
      localizedPages &&
      typeof localizedPages === "object" &&
      !Array.isArray(localizedPages)
    ) {
      const currentSettings = getProjectSettings(projectName);
      const defaultLocale =
        currentSettings?.defaultLocale ||
        currentSettings?.locales?.[0] ||
        "en";
      const projectLocales =
        currentSettings?.locales?.length > 0
          ? currentSettings.locales
          : [defaultLocale];

      const mergedPagesInfo =
        pagesInfo && typeof pagesInfo === "object" ? pagesInfo : {};
      const localeFileAccumulator: Record<string, Record<string, string>> = {};

      for (const [locale, pagesObj] of Object.entries(localizedPages)) {
        if (!pagesObj || typeof pagesObj !== "object") continue;
        const fps = savePagesToProject(
          projectPath,
          pagesObj as Record<string, any>,
          mergedPagesInfo,
          {
            locale,
            defaultLocale,
            projectLocales,
          }
        );
        for (const [pageType, relPath] of Object.entries(fps)) {
          filePaths[`${pageType}@${locale}`] = relPath;
          if (!localeFileAccumulator[pageType]) {
            localeFileAccumulator[pageType] = {};
          }
          localeFileAccumulator[pageType][locale] = relPath;
        }
      }

      if (faq && typeof faq === "object") {
        saveFAQToProject(projectPath, faq);
      }

      if (currentSettings && Object.keys(mergedPagesInfo).length > 0) {
        const existingPages = currentSettings.pages || {};
        const updatedPages: Record<string, any> = {};
        for (const [key, value] of Object.entries(existingPages)) {
          updatedPages[key] = {
            ...(typeof value === "object" && value !== null
              ? (value as Record<string, unknown>)
              : {}),
          };
        }

        const touched = new Set([
          ...Object.keys(mergedPagesInfo),
          ...Object.keys(localeFileAccumulator),
        ]);

        for (const pageType of touched) {
          const incoming = mergedPagesInfo[pageType] || {};
          const prev = updatedPages[pageType] || {};
          const locFiles = {
            ...(prev.localeFiles || {}),
            ...(localeFileAccumulator[pageType] || {}),
          };
          const generatedLocales = { ...(prev.generatedLocales || {}) };
          for (const loc of Object.keys(localeFileAccumulator[pageType] || {})) {
            generatedLocales[loc] = true;
          }
          const defaultPath =
            locFiles[defaultLocale] ||
            locFiles[projectLocales[0]] ||
            prev.filePath;

          updatedPages[pageType] = {
            ...prev,
            ...incoming,
            generated: true,
            localeFiles: locFiles,
            generatedLocales,
            ...(defaultPath ? { filePath: defaultPath } : {}),
          };
        }

        saveProjectSettings(projectPath, {
          ...currentSettings,
          pages: updatedPages,
        });
      }

      generatePagesData(projectPath);
      return res.json({
        success: true,
        message: "Страницы сохранены",
        filePaths,
      });
    }

    if (pages && typeof pages === "object") {
      filePaths = savePagesToProject(projectPath, pages, pagesInfo);
    }

    if (faq && typeof faq === "object") {
      saveFAQToProject(projectPath, faq);
    }

    if (pagesInfo) {
      const currentSettings = getProjectSettings(projectName);
      if (currentSettings) {
        const existingPages = currentSettings.pages || {};
        const updatedPages: Record<string, any> = {};

        for (const [key, value] of Object.entries(existingPages)) {
          updatedPages[key] = {
            ...(typeof value === "object" && value !== null
              ? (value as Record<string, unknown>)
              : {}),
          };
        }

        for (const [key, value] of Object.entries(pagesInfo)) {
          updatedPages[key] = {
            ...(updatedPages[key] || {}),
            ...(typeof value === "object" && value !== null
              ? (value as Record<string, unknown>)
              : {}),
            ...(filePaths[key] ? { filePath: filePaths[key] } : {}),
          };
        }

        saveProjectSettings(projectPath, {
          ...currentSettings,
          pages: updatedPages,
        });
      }
    }

    generatePagesData(projectPath);

    res.json({
      success: true,
      message: "Страницы сохранены",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при сохранении страниц:", error);
    res.status(500).json({
      error: "Failed to save pages",
      message: error.message,
    });
  }
});

// Обновление порядка блоков страницы
router.post("/update-blocks-order", async (req, res) => {
  try {
    const { projectName, pageType, blocks, blockTemplates, blockKeywords } =
      req.body;

    if (!projectName || !pageType || !blocks) {
      return res.status(400).json({
        error: "Missing required fields: projectName, pageType, blocks",
      });
    }

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const currentSettings = getProjectSettings(projectName);
    if (!currentSettings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    const projectPath = getProjectPath(projectName);
    const existingPages = currentSettings.pages || {};

    // Очищаем blockKeywords: убираем записи для блоков, которых уже
    // нет в порядке (например, пользователь удалил кастомный блок),
    // и нормализуем пустые строки.
    const normalizeBlockKeywords = (
      incoming: Record<string, unknown> | undefined,
      activeBlocks: string[]
    ): Record<string, string> | undefined => {
      if (!incoming || typeof incoming !== "object") return undefined;
      const cleaned: Record<string, string> = {};
      for (const block of activeBlocks) {
        const value = (incoming as Record<string, unknown>)[block];
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed) cleaned[block] = trimmed;
        }
      }
      return cleaned;
    };

    // Обновляем порядок блоков и шаблоны для страницы
    if (existingPages[pageType]) {
      const previousKeywords =
        existingPages[pageType].blockKeywords &&
        typeof existingPages[pageType].blockKeywords === "object"
          ? existingPages[pageType].blockKeywords
          : {};
      // Если фронт прислал blockKeywords — берём его (с очисткой по
      // активным блокам); иначе оставляем то, что уже сохранено, но
      // тоже фильтруем по актуальному списку блоков, чтобы не висели
      // записи под удалённые блоки.
      const mergedKeywords =
        blockKeywords !== undefined
          ? normalizeBlockKeywords(blockKeywords, blocks) || {}
          : normalizeBlockKeywords(previousKeywords, blocks) || {};
      existingPages[pageType] = {
        ...existingPages[pageType],
        blocks: blocks,
        blockTemplates:
          blockTemplates || existingPages[pageType].blockTemplates,
        blockKeywords: mergedKeywords,
      };
    } else {
      existingPages[pageType] = {
        pageType,
        blocks: blocks,
        generated: false,
        blockTemplates: blockTemplates || {},
        blockKeywords: normalizeBlockKeywords(blockKeywords, blocks) || {},
      };
    }

    saveProjectSettings(projectPath, {
      ...currentSettings,
      pages: existingPages,
    });

    res.json({
      success: true,
      message: "Порядок блоков сохранен",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при обновлении порядка блоков:", error);
    res.status(500).json({
      error: "Failed to update blocks order",
      message: error.message,
    });
  }
});

// Удаление блока из страницы с переносом изображений/кнопок
router.post("/delete-block", async (req, res) => {
  try {
    const { projectName, pageType, blockIndex, blockType, pageName, isCustom } =
      req.body;

    if (!projectName || !pageType || (blockIndex === undefined && !blockType)) {
      return res.status(400).json({
        error:
          "Missing required fields: projectName, pageType, and either blockIndex or blockType",
      });
    }

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const settings = getProjectSettings(projectName);
    if (!settings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    const pageInfo = settings.pages?.[pageType];
    // Когда страница ещё ни разу не генерировалась, JSON-файла нет, но
    // в settings.pages всё равно может быть запись с массивом blocks
    // (пользователь только что выбрал блоки в модалке). В этой
    // ситуации удалять реально нечего — отвечаем мягким "noop", а
    // фронтенд просто обновит свой стейт и settings.pages через
    // /update-blocks-order. Возвращать 404 с алертом "Page not found"
    // нельзя — пользователь видит его как ошибку, хотя её нет.
    if (!pageInfo || !pageInfo.filePath) {
      return res.json({
        success: true,
        noop: true,
        reason: "page-not-generated-yet",
        message:
          "Страница ещё не сгенерирована — удалять блок из JSON не требуется",
      });
    }

    const projectPath = getProjectPath(projectName);
    const fullPath = path.join(projectPath, pageInfo.filePath);

    if (!fs.existsSync(fullPath)) {
      return res.json({
        success: true,
        noop: true,
        reason: "page-file-missing",
        message:
          "JSON-файла страницы ещё нет на диске — удалять блок не требуется",
      });
    }

    // Читаем JSON страницы
    const fileContent = fs.readFileSync(fullPath, "utf-8");
    const pageData = JSON.parse(fileContent);

    if (!pageData.blocks || !Array.isArray(pageData.blocks)) {
      return res.status(400).json({
        error: "Invalid page structure",
      });
    }

    // Определяем реальный индекс блока
    let actualBlockIndex: number;
    if (blockType !== undefined) {
      // Ищем блок по blockType
      actualBlockIndex = pageData.blocks.findIndex(
        (block: any) => block.blockType === blockType
      );
      if (actualBlockIndex === -1) {
        // Блок добавили в UI, но он ни разу не генерировался — в JSON
        // его попросту нет. Это нормальная ситуация, не ошибка.
        return res.json({
          success: true,
          noop: true,
          reason: "block-not-in-json",
          message:
            "Блок отсутствует в JSON страницы (вероятно, не был сгенерирован) — удалять нечего",
        });
      }
    } else {
      // Используем переданный индекс
      actualBlockIndex = blockIndex;
      if (actualBlockIndex >= pageData.blocks.length || actualBlockIndex < 0) {
        return res.status(400).json({
          error: "Invalid block index",
        });
      }
    }

    const imgBase =
      isCustom && pageName
        ? pageName.toLowerCase().replace(/[^a-z0-9]/g, "_")
        : pageType;

    const isFirstBlock = actualBlockIndex === 0;
    const isLastBlock = actualBlockIndex === pageData.blocks.length - 1;
    const blockToDelete = pageData.blocks[actualBlockIndex];

    // Извлекаем image и button элементы из удаляемого блока
    const imageElements =
      blockToDelete.elements?.filter((el: any) => el.type === "image") || [];
    const buttonElements =
      blockToDelete.elements?.filter((el: any) => el.type === "button") || [];

    // Удаляем блок из массива
    pageData.blocks.splice(actualBlockIndex, 1);

    // Если удалили первый блок и есть новый первый блок
    if (isFirstBlock && pageData.blocks.length > 0) {
      const newFirstBlock = pageData.blocks[0];
      // Удаляем старые image и button из нового первого блока
      newFirstBlock.elements = newFirstBlock.elements.filter(
        (el: any) => el.type !== "image" && el.type !== "button"
      );
      // Добавляем image к новому первому блоку (используем первую картинку или создаем новую)
      const firstImage =
        imageElements.length > 0
          ? imageElements[0]
          : { type: "image", src: imgBase + "1" };
      newFirstBlock.elements.push(firstImage);
    }

    // Если удалили последний блок и есть новый последний блок
    if (isLastBlock && pageData.blocks.length > 0) {
      const newLastBlock = pageData.blocks[pageData.blocks.length - 1];
      // Удаляем старые image и button из нового последнего блока
      newLastBlock.elements = newLastBlock.elements.filter(
        (el: any) => el.type !== "image" && el.type !== "button"
      );
      // Добавляем image + button к новому последнему блоку
      const lastImage =
        imageElements.length > 0
          ? imageElements[imageElements.length - 1]
          : { type: "image", src: imgBase + "2" };
      const lastButton =
        buttonElements.length > 0
          ? buttonElements[0]
          : { type: "button", text: "Play Now" };
      newLastBlock.elements.push(lastImage, lastButton);
    }

    // Если удалили единственный блок, страница становится пустой
    if (pageData.blocks.length === 0) {
      // Очищаем h1Image если был
      delete pageData.h1Image;
    }

    // Сохраняем обновленный JSON
    fs.writeFileSync(fullPath, JSON.stringify(pageData, null, 2), "utf-8");

    // Обновляем pagesData.js
    generatePagesData(projectPath);

    res.json({
      success: true,
      message: "Блок успешно удален",
      data: {
        blocksCount: pageData.blocks.length,
      },
    });
  } catch (error: any) {
    console.error("[build] Ошибка при удалении блока:", error);
    res.status(500).json({
      error: "Failed to delete block",
      message: error.message,
    });
  }
});

// Обновление настроек проекта
router.post("/save-images", async (req, res) => {
  try {
    const { projectName, pageType, images } = req.body;

    if (!projectName || !pageType) {
      return res.status(400).json({
        error: "Missing required fields: projectName, pageType",
      });
    }

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    await runExclusiveForProject(projectName, () => {
      const currentSettings = getProjectSettings(projectName);
      if (!currentSettings) {
        throw new Error("Project settings not found");
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

    res.json({
      success: true,
      message: "Изображения сохранены",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при сохранении изображений:", error);
    const status =
      error.message === "Project settings not found" ? 404 : 500;
    res.status(status).json({
      error: "Failed to save images",
      message: error.message,
    });
  }
});

// Сохранение пресетов для картинок
router.post("/save-image-presets", async (req, res) => {
  try {
    const { projectName, presets } = req.body;

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

    const currentSettings = getProjectSettings(projectName);
    if (!currentSettings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    const projectPath = getProjectPath(projectName);

    // Обновляем настройки проекта с пресетами
    saveProjectSettings(projectPath, {
      ...currentSettings,
      imagePresets: presets || [],
    });

    res.json({
      success: true,
      message: "Пресеты сохранены",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при сохранении пресетов:", error);
    res.status(500).json({
      error: "Failed to save image presets",
      message: error.message,
    });
  }
});

router.put("/project/:projectName", async (req, res) => {
  try {
    const { projectName } = req.params;
    const {
      brand,
      language,
      country,
      domain,
      affiliateLink,
      geoCode,
      geoLabel,
      seoEntity: seoEntityBody,
    } = req.body;

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    // Валидация
    if (domain && (domain.includes("http://") || domain.includes("https://"))) {
      return res.status(400).json({
        error: "Domain should not include http:// or https://",
      });
    }

    if (affiliateLink && !affiliateLink.startsWith("https://")) {
      return res.status(400).json({
        error: "Affiliate link must start with https://",
      });
    }

    const cur = getProjectSettings(projectName);
    const projectPathForSeo = getProjectPath(projectName);

    let seoEntityPatch: ReturnType<typeof buildSeoEntityConfig> | undefined;
    if (seoEntityBody && typeof seoEntityBody === "object") {
      seoEntityPatch = buildSeoEntityConfig({
        brand: brand ?? cur?.brand ?? "Site",
        domain: domain ?? cur?.domain,
        geoLabel: geoLabel ?? cur?.geoLabel ?? cur?.country,
        country: country ?? cur?.country,
        countryCode: geoCode ?? cur?.geoCode ?? undefined,
        locales: cur?.locales,
        htmlLang: cur?.htmlLang,
        projectPath: projectPathForSeo,
        overrides: seoEntityBody as Record<string, unknown>,
      });
    } else if (cur && (brand || domain || geoLabel || country)) {
      seoEntityPatch = buildSeoEntityConfig({
        brand: brand ?? cur.brand,
        domain: domain ?? cur.domain,
        geoLabel: geoLabel ?? cur.geoLabel ?? cur.country,
        country: country ?? cur.country,
        countryCode: geoCode ?? cur.geoCode ?? undefined,
        locales: cur.locales,
        htmlLang: cur.htmlLang,
        projectPath: projectPathForSeo,
        overrides: (cur as Record<string, unknown>).seoEntity as
          | Record<string, unknown>
          | undefined,
      });
    }

    updateProjectSettings(projectName, {
      brand,
      language,
      country,
      domain,
      affiliateLink,
      ...(geoCode !== undefined ? { geoCode: geoCode || null } : {}),
      ...(geoLabel !== undefined ? { geoLabel } : {}),
      ...(seoEntityPatch ? { seoEntity: seoEntityPatch } : {}),
    });

    const updatedSettings = getProjectSettings(projectName);

    // Обновляем .env файл
    if (updatedSettings) {
      const projectPath = getProjectPath(projectName);
      const existingEnv = readProjectEnv(projectPath);
      updateProjectEnv(projectPath, {
        affiliateLink: updatedSettings.affiliateLink || "",
        brand: updatedSettings.brand || "",
        domain: updatedSettings.domain || "",
        app: existingEnv.VITE_APP || "/go",
        button1Text: updatedSettings.heroButtons?.button1Text,
        button2Text: updatedSettings.heroButtons?.button2Text,
      });

      try {
        syncIndexHtmlHead(projectPath);
      } catch (e: any) {
        console.warn("[build] syncIndexHtmlHead (update-project):", e?.message || e);
      }
    }

    res.json({
      success: true,
      project: updatedSettings,
      message: "Настройки проекта обновлены",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при обновлении проекта:", error);
    res.status(500).json({
      error: "Failed to update project",
      message: error.message,
    });
  }
});

// Обновление lang в index.html проекта
router.put("/project/:projectName/html-lang", async (req, res) => {
  try {
    const { projectName } = req.params;
    const { lang } = req.body;

    if (!projectName || !lang || typeof lang !== "string") {
      return res.status(400).json({
        error: "Missing required field: lang (string, e.g. en, ru, de)",
      });
    }

    const trimmedLang = lang.trim();
    if (!trimmedLang) {
      return res.status(400).json({
        error: "lang cannot be empty",
      });
    }

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const projectPath = getProjectPath(projectName);
    updateProjectIndexHtmlLang(projectPath, trimmedLang);
    updateProjectSettings(projectName, { htmlLang: trimmedLang });

    try {
      syncIndexHtmlHead(projectPath);
    } catch (e: any) {
      console.warn("[build] syncIndexHtmlHead (html-lang):", e?.message || e);
    }

    const updatedSettings = getProjectSettings(projectName);

    res.json({
      success: true,
      project: updatedSettings,
      message: `Lang "${trimmedLang}" применен в index.html`,
    });
  } catch (error: any) {
    console.error("[build] Ошибка при обновлении html-lang:", error);
    res.status(500).json({
      error: "Failed to update html-lang",
      message: error.message,
    });
  }
});

// Получение текста страницы для редактирования
router.get("/project/:projectName/page/:pageType", async (req, res) => {
  try {
    const { projectName, pageType } = req.params;

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const settings = getProjectSettings(projectName);
    if (!settings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    const pageInfo = settings.pages?.[pageType];
    if (!pageInfo) {
      return res.status(404).json({
        error: "Page not found",
      });
    }

    const localeQ =
      typeof req.query.locale === "string" ? req.query.locale.trim() : "";
    let filePath = pageInfo.filePath as string | undefined;
    if (
      localeQ &&
      pageInfo.localeFiles &&
      (pageInfo.localeFiles as Record<string, string>)[localeQ]
    ) {
      filePath = (pageInfo.localeFiles as Record<string, string>)[localeQ];
    }

    if (!filePath) {
      return res.status(404).json({
        error: "Page file path not found",
      });
    }

    const projectPath = getProjectPath(projectName);
    const fullPath = path.join(projectPath, filePath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        error: "Page file not found",
      });
    }

    const fileContent = fs.readFileSync(fullPath, "utf-8");
    const pageData = JSON.parse(fileContent);

    // Загружаем FAQ если это главная страница
    let faqData = null;
    if (pageType === "homepage" || pageType === "main") {
      const faqPath = path.join(projectPath, "src", "pages", "faq.json");
      if (fs.existsSync(faqPath)) {
        try {
          const faqContent = fs.readFileSync(faqPath, "utf-8");
          const parsedFaq = JSON.parse(faqContent);
          if (parsedFaq.faq && parsedFaq.faq.items && parsedFaq.faq.items.length > 0) {
            faqData = parsedFaq.faq;
          }
        } catch (err) {
          console.warn("[build] Не удалось загрузить FAQ:", err);
        }
      }
    }

    res.json({
      success: true,
      data: {
        pageType,
        pageData,
        filePath,
        pageInfo: {
          displayName: pageInfo.displayName,
          pageName: pageInfo.pageName,
          isCustom: pageInfo.isCustom,
          localeFiles: pageInfo.localeFiles,
          activeLocale: localeQ || null,
        },
        faq: faqData,
      },
    });
  } catch (error: any) {
    console.error("[build] Ошибка при получении страницы:", error);
    res.status(500).json({
      error: "Failed to get page",
      message: error.message,
    });
  }
});

// Сохранение отредактированного текста страницы
router.put("/project/:projectName/page/:pageType", async (req, res) => {
  try {
    const { projectName, pageType } = req.params;
    const { pageData, locale } = req.body;

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const settings = getProjectSettings(projectName);
    if (!settings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    const pageInfo = settings.pages?.[pageType];
    if (!pageInfo) {
      return res.status(404).json({
        error: "Page not found",
      });
    }

    const loc =
      typeof locale === "string" && locale.trim()
        ? locale.trim()
        : undefined;
    let filePath = pageInfo.filePath as string | undefined;
    if (loc && pageInfo.localeFiles && pageInfo.localeFiles[loc]) {
      filePath = pageInfo.localeFiles[loc];
    }

    if (!filePath) {
      return res.status(404).json({
        error: "Page file path not found",
      });
    }

    const projectPath = getProjectPath(projectName);
    const fullPath = path.join(projectPath, filePath);

    // Сохраняем отредактированные данные
    fs.writeFileSync(fullPath, JSON.stringify(pageData, null, 2), "utf-8");

    // Обновляем pagesData.js (на случай если это новая страница)
    generatePagesData(projectPath);

    res.json({
      success: true,
      message: "Страница успешно сохранена",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при сохранении страницы:", error);
    res.status(500).json({
      error: "Failed to save page",
      message: error.message,
    });
  }
});

// Обновление displayName страницы (название в меню)
router.put("/project/:projectName/page/:pageType/display-name", async (req, res) => {
  try {
    const { projectName, pageType } = req.params;
    const { displayName } = req.body;

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
      return res.status(400).json({
        error: "displayName is required and must be a non-empty string",
      });
    }

    const settings = getProjectSettings(projectName);
    if (!settings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    const pageInfo = settings.pages?.[pageType];
    if (!pageInfo) {
      return res.status(404).json({
        error: "Page not found",
      });
    }

    const projectPath = getProjectPath(projectName);

    // Обновляем displayName в настройках страницы
    settings.pages[pageType] = {
      ...pageInfo,
      displayName: displayName.trim(),
    };

    // Сохраняем обновленные настройки
    saveProjectSettings(projectPath, settings);

    // Регенерируем pageMetadata.js
    generatePagesData(projectPath);

    res.json({
      success: true,
      message: "Название страницы успешно обновлено",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при обновлении displayName:", error);
    res.status(500).json({
      error: "Failed to update display name",
      message: error.message,
    });
  }
});

// Обновление метаданных страницы (slug и displayName)
router.put("/project/:projectName/page/:pageType/metadata", async (req, res) => {
  try {
    const { projectName, pageType } = req.params;
    const { pageName, displayName } = req.body;

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const settings = getProjectSettings(projectName);
    if (!settings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    const pageInfo = settings.pages?.[pageType];
    if (!pageInfo) {
      return res.status(404).json({
        error: "Page not found",
      });
    }

    const projectPath = getProjectPath(projectName);

    // Обновляем метаданные страницы
    const updatedPageInfo: any = { ...pageInfo };
    
    if (pageName !== undefined) {
      // Нормализуем slug: только строчные буквы, цифры и тире
      const normalizedSlug = pageName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      updatedPageInfo.pageName = normalizedSlug || undefined;
    }
    
    if (displayName !== undefined) {
      updatedPageInfo.displayName = displayName.trim() || undefined;
    }

    settings.pages[pageType] = updatedPageInfo;

    // Сохраняем обновленные настройки
    saveProjectSettings(projectPath, settings);

    // Регенерируем pageMetadata.js и pagesData.js
    generatePagesData(projectPath);

    res.json({
      success: true,
      message: "Метаданные страницы успешно обновлены",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при обновлении метаданных страницы:", error);
    res.status(500).json({
      error: "Failed to update page metadata",
      message: error.message,
    });
  }
});

// Обновление текстов кнопок Hero Section
router.put("/project/:projectName/hero-buttons", async (req, res) => {
  try {
    const { projectName } = req.params;
    const { button1Text, button2Text } = req.body;

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const settings = getProjectSettings(projectName);
    if (!settings) {
      return res.status(404).json({
        error: "Project settings not found",
      });
    }

    const projectPath = getProjectPath(projectName);

    // Обновляем heroButtons в настройках проекта
    settings.heroButtons = {
      button1Text: button1Text || undefined,
      button2Text: button2Text || undefined,
    };

    // Сохраняем обновленные настройки
    saveProjectSettings(projectPath, settings);

    // Обновляем .env файл
    const existingEnv = readProjectEnv(projectPath);
    updateProjectEnv(projectPath, {
      affiliateLink: settings.affiliateLink || "",
      brand: settings.brand || "",
      domain: settings.domain || "",
      app: existingEnv.VITE_APP || "/go",
      button1Text: settings.heroButtons?.button1Text,
      button2Text: settings.heroButtons?.button2Text,
    });

    res.json({
      success: true,
      message: "Тексты кнопок успешно обновлены",
      heroButtons: settings.heroButtons,
    });
  } catch (error: any) {
    console.error("[build] Ошибка при обновлении текстов кнопок:", error);
    res.status(500).json({
      error: "Failed to update hero buttons",
      message: error.message,
    });
  }
});

// Сохранение FAQ
router.put("/project/:projectName/faq", async (req, res) => {
  try {
    const { projectName } = req.params;
    const { faq } = req.body;

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    if (!faq || !faq.faq) {
      return res.status(400).json({
        error: "FAQ data is required",
      });
    }

    const projectPath = getProjectPath(projectName);

    // Сохраняем FAQ
    saveFAQToProject(projectPath, faq);

    res.json({
      success: true,
      message: "FAQ успешно сохранен",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при сохранении FAQ:", error);
    res.status(500).json({
      error: "Failed to save FAQ",
      message: error.message,
    });
  }
});

// Генерация favicon
router.post("/generate-favicon", upload.single("file"), async (req, res) => {
  try {
    const { projectName, source, brand } = req.body;

    if (!projectName || !source || !brand) {
      return res.status(400).json({
        error: "Missing required fields: projectName, source, brand",
      });
    }

    const projectPath = getProjectPath(projectName);
    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    let sourceImagePath: string;

    if (source === "upload") {
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({
          error: "No file provided for upload source",
        });
      }

      // Сохраняем загруженный файл временно
      const tempDir = path.join(projectPath, "temp");
      fs.mkdirSync(tempDir, { recursive: true });
      sourceImagePath = path.join(
        tempDir,
        `favicon-source-${Date.now()}.${
          path.extname(file.originalname) || "png"
        }`
      );
      fs.writeFileSync(sourceImagePath, file.buffer);
    } else if (source === "logo") {
      sourceImagePath = path.join(projectPath, "public", "images", "logo.webp");
      if (!fs.existsSync(sourceImagePath)) {
        return res.status(404).json({
          error: "logo.webp not found. Please upload a logo first.",
        });
      }
    } else if (source === "homepage") {
      sourceImagePath = path.join(
        projectPath,
        "public",
        "images",
        "homepage.webp"
      );
      if (!fs.existsSync(sourceImagePath)) {
        return res.status(404).json({
          error:
            "homepage.webp not found. Please generate homepage images first.",
        });
      }
    } else {
      return res.status(400).json({
        error: "Invalid source. Must be 'upload', 'logo', or 'homepage'",
      });
    }

    // Генерируем favicon
    await generateFavicons(projectPath, sourceImagePath, brand);

    try {
      syncIndexHtmlHead(projectPath);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[build] syncIndexHtmlHead после generate-favicon:", msg);
    }

    // Удаляем временный файл если использовали upload
    if (source === "upload" && fs.existsSync(sourceImagePath)) {
      fs.unlinkSync(sourceImagePath);
    }

    res.json({
      success: true,
      message: "Favicon generated successfully",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при генерации favicon:", error);
    res.status(500).json({
      error: "Failed to generate favicon",
      message: error.message,
    });
  }
});

// Получить текущую тему проекта
router.get("/project/:projectName/theme", async (req, res) => {
  try {
    const { projectName } = req.params;

    if (!projectName) {
      return res.status(400).json({
        error: "Missing required field: projectName",
      });
    }

    const projectPath = getProjectPath(projectName);

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const themeInfo = getCurrentTheme(projectPath);

    res.json(themeInfo);
  } catch (error: any) {
    console.error("[build] Ошибка при получении темы:", error);
    res.status(500).json({
      error: "Failed to get theme",
      message: error.message,
    });
  }
});

// Сохранить тему проекта
router.post("/project/:projectName/theme", async (req, res) => {
  try {
    const { projectName } = req.params;
    const { mode, theme, colors } = req.body;

    if (!projectName) {
      return res.status(400).json({
        error: "Missing required field: projectName",
      });
    }

    if (!mode || (mode !== "preset" && mode !== "custom")) {
      return res.status(400).json({
        error: "Invalid mode. Must be 'preset' or 'custom'",
      });
    }

    const projectPath = getProjectPath(projectName);

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    if (mode === "preset") {
      if (!theme) {
        return res.status(400).json({
          error: "Missing required field: theme",
        });
      }

      copyThemeToProject(projectPath, theme);
      syncProjectIndexCssFromTemplate(projectPath);
      updateIndexCSS(projectPath, theme);
    } else {
      // Кастомная тема
      if (!colors || !Array.isArray(colors) || colors.length !== 7) {
        return res.status(400).json({
          error: "Invalid colors array. Must contain 7 color values",
        });
      }

      // Сохраняем кастомную тему
      saveCustomTheme(projectPath, colors);

      syncProjectIndexCssFromTemplate(projectPath);
      updateIndexCSS(projectPath, "castom");
    }

    res.json({
      success: true,
      message: "Theme saved successfully",
    });
  } catch (error: any) {
    console.error("[build] Ошибка при сохранении темы:", error);
    res.status(500).json({
      error: "Failed to save theme",
      message: error.message,
    });
  }
});

// Получить список доступных тем
router.get("/themes", async (req, res) => {
  try {
    res.json({ themes: getThemesCatalog() });
  } catch (error: any) {
    console.error("[build] Ошибка при получении списка тем:", error);
    res.status(500).json({
      error: "Failed to get themes",
      message: error.message,
    });
  }
});

// Загрузка production-сборки (dist) на сервер по SFTP / FTP
router.post("/project/:projectName/upload-to-server", async (req, res) => {
  try {
    const { projectName } = req.params;
    const { host, port, username, password, remotePath } = req.body as {
      host?: string;
      port?: number | string;
      username?: string;
      password?: string;
      remotePath?: string;
    };

    if (!projectName) {
      return res.status(400).json({ error: "Missing required field: projectName" });
    }

    if (!projectExists(projectName)) {
      return res.status(404).json({ error: "Project not found" });
    }

    const hostTrim = typeof host === "string" ? host.trim() : "";
    const userTrim = typeof username === "string" ? username.trim() : "";
    const pass = typeof password === "string" ? password : "";

    if (!hostTrim) {
      return res.status(400).json({ error: "Укажите хост сервера" });
    }
    if (!userTrim) {
      return res.status(400).json({ error: "Укажите имя пользователя" });
    }
    if (!pass) {
      return res.status(400).json({ error: "Укажите пароль" });
    }

    const portNum = Number(port);
    const resolvedPort =
      Number.isFinite(portNum) && portNum > 0 && portNum <= 65535
        ? Math.floor(portNum)
        : 22;

    const projectPath = getProjectPath(projectName);
    const currentSettings = getProjectSettings(projectName);
    if (!currentSettings) {
      return res.status(404).json({ error: "Project settings not found" });
    }

    console.log(
      `[build] Сборка dist перед загрузкой на сервер: ${projectName} → ${hostTrim}:${resolvedPort}`
    );
    const distPath = await ensureProjectDistBuilt(projectPath);

    const effectiveRemotePath =
      typeof remotePath === "string" && remotePath.trim()
        ? remotePath.trim()
        : "/";

    const { filesUploaded, protocol, remotePath: resolvedRemotePath } =
      await uploadDirectoryToServer(
        {
          host: hostTrim,
          port: resolvedPort,
          username: userTrim,
          password: pass,
          remotePath: effectiveRemotePath,
        },
        distPath,
        { domain: currentSettings.domain }
      );

    const autoDetected =
      (!remotePath || effectiveRemotePath === "/") &&
      resolvedRemotePath !== "/" &&
      resolvedRemotePath !== effectiveRemotePath;

    saveProjectSettings(projectPath, {
      ...currentSettings,
      serverUpload: {
        host: hostTrim,
        port: resolvedPort,
        username: userTrim,
        remotePath: resolvedRemotePath,
      },
    });

    res.json({
      success: true,
      message:
        `Загружено файлов: ${filesUploaded} (${protocol.toUpperCase()}) → ${resolvedRemotePath}. ` +
        (autoDetected
          ? `Путь определён автоматически (корень сайта домена). `
          : "") +
        `Откройте на сервере этот каталог и убедитесь, что он совпадает с тем, что отдаёт веб‑сервер по IP или домену (document root nginx/apache, public_html у хостинг‑панели). ` +
        `Если совпадает, а вы всё равно видите старый сайт — сбросьте кеш браузера (Ctrl+F5) или CDN. ` +
        `Перезагрузка веб‑сервера не выполняется — это нужно делать только если ваш хостинг так требует.`,
      filesUploaded,
      protocol,
      remotePath: resolvedRemotePath,
    });
  } catch (error: any) {
    console.error("[build] Ошибка загрузки на сервер:", error);
    res.status(500).json({
      error: "Failed to upload to server",
      message: error.message || String(error),
    });
  }
});

// ZIP исходников проекта (без node_modules и без папки dist — не путать с produktion-сборкой)
router.get("/download-dist/:projectName", async (req, res) => {
  try {
    const { projectName } = req.params;

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

    const projectPath = getProjectPath(projectName);
    const tempDir = path.join(process.cwd(), "temp");
    fs.mkdirSync(tempDir, { recursive: true });

    const archivePath = path.join(
      tempDir,
      `${projectName}-dist-${Date.now()}.zip`
    );

    console.log(`[build] Архив исходников (без dist) для проекта: ${projectName}`);
    await createProjectArchive(projectPath, archivePath);

    // Отправляем файл на скачивание
    res.download(archivePath, `${projectName}-dist.zip`, (err) => {
      // Удаляем временный файл после отправки
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
      if (err) {
        console.error("[build] Ошибка при отправке архива:", err);
      }
    });
  } catch (error: any) {
    console.error("[build] Ошибка при создании архива dist:", error);
    res.status(500).json({
      error: "Failed to create dist archive",
      message: error.message,
    });
  }
});

// ZIP папки dist (при отсутствии dist сначала npm run build)
router.get("/download-build/:projectName", async (req, res) => {
  try {
    const { projectName } = req.params;

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

    const projectPath = getProjectPath(projectName);
    const tempDir = path.join(process.cwd(), "temp");
    fs.mkdirSync(tempDir, { recursive: true });

    const archivePath = path.join(
      tempDir,
      `${projectName}-build-${Date.now()}.zip`
    );

    console.log(
      `[build] Архив production dist для проекта: ${projectName}`
    );
    await buildAndArchiveProject(projectPath, archivePath);

    // Отправляем файл на скачивание
    res.download(archivePath, `${projectName}-build.zip`, (err) => {
      // Удаляем временный файл после отправки
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
      if (err) {
        console.error("[build] Ошибка при отправке архива:", err);
      }
    });
  } catch (error: any) {
    console.error("[build] Ошибка при создании архива build:", error);
    res.status(500).json({
      error: "Failed to create build archive",
      message: error.message,
    });
  }
});

// Saved deploy servers (password never stored)
router.get("/deploy-servers", (_req, res) => {
  try {
    res.json({ success: true, servers: listDeployServers() });
  } catch (error: any) {
    res.status(500).json({
      error: "Failed to list deploy servers",
      message: error.message,
    });
  }
});

router.post("/deploy-servers", (req, res) => {
  try {
    const { id, label, host, port, username, remotePath } = req.body as {
      id?: string;
      label?: string;
      host?: string;
      port?: number | string;
      username?: string;
      remotePath?: string;
    };
    if (!host?.trim() || !username?.trim()) {
      return res.status(400).json({
        error: "Укажите host и username",
      });
    }
    const portNum = Number(port);
    const resolvedPort =
      Number.isFinite(portNum) && portNum > 0 && portNum <= 65535
        ? Math.floor(portNum)
        : 22;
    const server = upsertDeployServer({
      id,
      label: label || host.trim(),
      host: host.trim(),
      port: resolvedPort,
      username: username.trim(),
      remotePath: remotePath?.trim() || "/",
    });
    res.json({ success: true, server });
  } catch (error: any) {
    res.status(500).json({
      error: "Failed to save deploy server",
      message: error.message,
    });
  }
});

// Auto-generation status (polling)
router.get("/project/:projectName/auto-status", (req, res) => {
  try {
    const { projectName } = req.params;
    if (!projectName || !projectExists(projectName)) {
      return res.status(404).json({ error: "Project not found" });
    }
    const state = getAutoGenerationState(projectName);
    res.json({
      success: true,
      running: isAutoGenerationRunning(projectName),
      autoGeneration: state,
    });
  } catch (error: any) {
    res.status(500).json({
      error: "Failed to get auto-generation status",
      message: error.message,
    });
  }
});

// Kick off full auto-generation pipeline (background)
router.post("/project/:projectName/auto-generate", async (req, res) => {
  try {
    const { projectName } = req.params;
    const body = req.body as {
      server?: {
        host?: string;
        port?: number | string;
        username?: string;
        password?: string;
        remotePath?: string;
        savedServerId?: string;
      };
      globalKeywords?: string;
      customPages?: Array<{ name: string; slug?: string; blocks?: string[] }>;
    };

    if (!projectName || !projectExists(projectName)) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (isAutoGenerationRunning(projectName)) {
      return res.status(409).json({
        error: "Auto-generation already running",
        message: "Автогенерация уже выполняется для этого проекта",
      });
    }

    const settings = getProjectSettings(projectName);
    const stored = (settings as Record<string, unknown> | null)?.autoGeneration as
      | { options?: AutoGenerationOptions }
      | undefined;

    let server = body.server || stored?.options?.server;
    if (!server?.host || !server?.username || !server?.password) {
      return res.status(400).json({
        error: "Missing server credentials",
        message: "Укажите хост, пользователя и пароль сервера для деплоя",
      });
    }

    const portNum = Number(server.port);
    const options: AutoGenerationOptions = {
      server: {
        host: server.host.trim(),
        port:
          Number.isFinite(portNum) && portNum > 0 && portNum <= 65535
            ? Math.floor(portNum)
            : 22,
        username: server.username.trim(),
        password: server.password,
        remotePath: server.remotePath?.trim() || "/",
        savedServerId: server.savedServerId,
      },
      globalKeywords: body.globalKeywords?.trim() || stored?.options?.globalKeywords,
      customPages:
        normalizeAutoCustomPages(body.customPages) ||
        normalizeAutoCustomPages(
          (settings as Record<string, unknown> | null)?.customPages
        ) ||
        stored?.options?.customPages,
    };

    res.json({
      success: true,
      message: "Автогенерация запущена",
      projectName,
    });

    runAutoGeneration(projectName, options).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[auto-generation] ${projectName} failed:`, msg);
    });
  } catch (error: any) {
    console.error("[build] auto-generate:", error);
    res.status(500).json({
      error: "Failed to start auto-generation",
      message: error.message,
    });
  }
});

export default router;

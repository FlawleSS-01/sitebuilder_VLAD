import { Request, Response } from "express";
import { initImageGeneration, generateAndSaveImage } from "./index.js";
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
import {
  getProjectSettings,
  saveProjectSettings,
  getProjectPath,
  projectExists,
} from "../build/utils/projectManager.js";

interface GenerateImageRequest {
  prompt: string;
  size: ImageSizeOption;
  model?: string;
  pageType?: string;
  imageName?: string;
}

// Инициализация Runware клиента (будет вызвана при первом использовании)
let runwareInitialized = false;

const ensureRunwareInitialized = () => {
  if (!runwareInitialized && process.env.RUNWARE_API_KEY) {
    initImageGeneration({
      runwareApiKey: process.env.RUNWARE_API_KEY,
      runwareApiUrl: process.env.RUNWARE_API_URL,
      runwareModel: process.env.RUNWARE_MODEL || "flux.2",
      runwareGuidance: process.env.RUNWARE_GUIDANCE
        ? parseInt(process.env.RUNWARE_GUIDANCE)
        : undefined,
      runwareSteps: process.env.RUNWARE_STEPS
        ? parseInt(process.env.RUNWARE_STEPS)
        : undefined,
    });
    runwareInitialized = true;
  }
};

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

function persistPageImagesInProjectSettings(
  projectName: string,
  pageType: string,
  images: GeneratedPageImage[]
): void {
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
}

async function generatePageImagesCore(
  projectName: string,
  pageType: string,
  pageName: string | undefined,
  isCustom: boolean | undefined,
  runwareOn: boolean
): Promise<{ images: GeneratedPageImage[] }> {
  const pageFileName =
    isCustom && pageName
      ? pageName.toLowerCase().replace(/[^a-z0-9]/g, "_")
      : pageType;

  const projectPath = path.join(process.cwd(), "projects", projectName);
  const imagesDir = path.join(projectPath, "public", "images");

  fs.mkdirSync(imagesDir, { recursive: true });

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

  const generatedImages: GeneratedPageImage[] = [];

  for (let i = 1; i <= 3; i++) {
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
      `[image-generation] (${pageType}) Слот ${i}/3 — генерация alt+промта по контексту: бренд=${promptCtx.brand}, страна=${promptCtx.country}`
    );

    const meta = await generateImagePromptAndAlt(promptCtx);

    console.log(
      `[image-generation] (${pageType}) Слот ${i}/3 — alt: "${meta.alt.slice(
        0,
        80
      )}...", промт: "${meta.prompt.slice(0, 80)}..."`
    );

    try {
      let promptOut = meta.prompt;
      let alt: string = meta.alt;
      let title: string = meta.title;

      if (!runwareOn) {
        await writePlaceholderWebp(imagePath, {
          label: `${pageType} · ${i}/3`,
          brand: brand || projectName,
          index: i,
        });
        promptOut = "[placeholder]";
      } else {
        await generateAndSaveImage(meta.prompt, size, imagePath);
        console.log(
          `[image-generation] Изображение ${i}/3 успешно сгенерировано: ${imagePath}`
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
    } catch (error: any) {
      console.error(
        `[image-generation] Ошибка при генерации изображения ${i}/3:`,
        error.message || error,
        error.stack
      );
    }
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
      });
    }

    const runwareOn = shouldUseRunware();
    if (runwareOn) {
      ensureRunwareInitialized();
    }

    const projectPath = getProjectPath(projectName);
    const jobs = collectImageGenerationJobs(
      projectPath,
      settings as Record<string, unknown>
    );

    if (jobs.length === 0) {
      return res.status(400).json({
        error:
          "Нет страниц для генерации картинок (не найдены JSON страниц на диске и не отмечены как сгенерированные).",
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

        persistPageImagesInProjectSettings(
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

    if (!shouldUseRunware()) {
      console.log(
        `[image-generation] Плейсхолдер логотипа для ${projectName}, бренд: ${brand}`
      );
      await writePlaceholderLogoWebp(projectPath, brand);
      return res.json({
        success: true,
        data: {
          logo: {
            name: "logo.webp",
            url: `/projects/${projectName}/public/images/logo.webp`,
            path: logoWebp,
            placeholder: true,
          },
        },
      });
    }

    if (!process.env.RUNWARE_API_KEY) {
      return res.status(500).json({
        error: "Runware API key is not configured",
      });
    }

    ensureRunwareInitialized();

    // Логотип печатает сам сайт текстом поверх — модельке просим сделать
    // только графическую эмблему (иконку), без текста, на прозрачно-тёмном фоне.
    // Так же запрещаем буквы в негативном промте Runware.
    const prompt = `Premium online casino emblem icon, centered minimalist mark, glowing neon casino motifs (a chip, a stylised crown, a card suit, or a star), gold and deep purple gradient with electric blue rim-light, glossy metallic finish, dramatic studio lighting, ultra-clean composition on a dark abstract background, suitable for a website header. No text, no letters, no words, no typography, no logos other than the central emblem.`;

    const imagesDir = path.join(projectPath, "public", "images");
    fs.mkdirSync(imagesDir, { recursive: true });

    const tempPng = path.join(imagesDir, `logo-gen-${Date.now()}.png`);

    console.log(
      `[image-generation] Генерация логотипа для ${projectName}, бренд: ${brand}`
    );
    await generateAndSaveImage(prompt, "1536x512", tempPng);

    await sharp(tempPng).webp({ quality: 90 }).toFile(logoWebp);
    try {
      fs.unlinkSync(tempPng);
    } catch {
      /* ignore */
    }

    const imageUrl = `/projects/${projectName}/public/images/logo.webp`;

    res.json({
      success: true,
      data: {
        logo: {
          name: "logo.webp",
          url: imageUrl,
          path: logoWebp,
        },
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

    res.json({
      success: true,
      data: {
        logo: {
          name: imageName,
          url: imageUrl,
          path: imagePath,
        },
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

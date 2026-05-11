import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");

const NON_TEMPLATE_SOURCE_DIRS = new Set([
  "theme-presets",
  "placeholder-assets",
]);

// Маппинг типов страниц на имена файлов
const PAGE_FILE_MAP: Record<string, string> = {
  homepage: "main.json",
  casino: "casino.json",
  slots: "slots.json",
  games: "games.json",
  betting: "betting.json",
  app: "app.json",
  login: "login.json",
};

/**
 * Получает имя файла для страницы
 */
const getPageFileName = (
  pageType: string,
  pageName?: string,
  isCustom?: boolean
): string => {
  // Стандартные страницы
  if (PAGE_FILE_MAP[pageType]) {
    return PAGE_FILE_MAP[pageType];
  }
  // Кастомные страницы - используем название страницы как имя файла
  if (isCustom && pageName) {
    // Нормализуем имя: приводим к нижнему регистру и заменяем пробелы/спецсимволы на тире
    const normalizedName = pageName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    return `${normalizedName}.json`;
  }
  // Другие страницы - используем pageType как имя файла
  return `${pageType}.json`;
};

export type SavePagesLocaleOptions = {
  locale: string;
  defaultLocale: string;
  projectLocales: string[];
};

const withLocaleSuffix = (
  fileName: string,
  locale: string,
  defaultLocale: string,
  projectLocales: string[]
): string => {
  if (!projectLocales || projectLocales.length <= 1) {
    return fileName;
  }
  if (locale === defaultLocale) {
    return fileName;
  }
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  return `${base}.${locale}${ext}`;
};

/**
 * Копирует placeholder-ассеты в public/images (если файлов ещё нет)
 */
export const ensurePlaceholderAssets = (projectPath: string): void => {
  const placeholderDir = path.join(
    APP_ROOT,
    "modules",
    "source",
    "placeholder-assets"
  );
  const publicImages = path.join(projectPath, "public", "images");
  fs.mkdirSync(publicImages, { recursive: true });

  for (const name of ["logo.svg", "hero-placeholder.svg"]) {
    const src = path.join(placeholderDir, name);
    const dest = path.join(publicImages, name);
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
};

/**
 * Копирует директорию рекурсивно
 */
const copyDirectory = (src: string, dest: string): void => {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  // Создаем целевую директорию
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Игнорируем node_modules и другие служебные папки
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "dist"
      ) {
        continue;
      }
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

/**
 * Получает список доступных шаблонов из modules/source
 */
export const getAvailableTemplates = (): string[] => {
  const rootDir = APP_ROOT;
  const sourceDir = path.join(rootDir, "modules/source");

  if (!fs.existsSync(sourceDir)) {
    return [];
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const templates: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && !NON_TEMPLATE_SOURCE_DIRS.has(entry.name)) {
      templates.push(entry.name);
    }
  }

  return templates.sort();
};

/**
 * Создает новый проект, копируя указанный шаблон из modules/source
 */
export const createProject = (
  projectName: string,
  templateName: string = "default-template"
): string => {
  // Путь к шаблону относительно корня проекта
  const rootDir = APP_ROOT;
  const sourceTemplatePath = path.join(rootDir, "modules/source", templateName);
  const projectsDir = path.join(rootDir, "projects");
  const projectPath = path.join(projectsDir, projectName);

  // Проверяем существование шаблона
  if (!fs.existsSync(sourceTemplatePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }

  // Удаляем проект если он уже существует
  if (fs.existsSync(projectPath)) {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }

  // Создаем директорию проектов если её нет
  fs.mkdirSync(projectsDir, { recursive: true });

  // Копируем шаблон в projects/{projectName}
  console.log(
    `[build] Копирование проекта из ${sourceTemplatePath} в ${projectPath}`
  );
  copyDirectory(sourceTemplatePath, projectPath);
  ensurePlaceholderAssets(projectPath);

  console.log(`[build] Проект создан: ${projectPath}`);
  return projectPath;
};

/**
 * Сохраняет JSON страницы в проект
 * Возвращает маппинг pageType -> filePath
 */
export const savePagesToProject = (
  projectPath: string,
  pages: Record<string, any>,
  pagesInfo?: Record<string, any>,
  localeOpts?: SavePagesLocaleOptions
): Record<string, string> => {
  const pagesDir = path.join(projectPath, "src", "pages");

  // Создаем директорию pages если её нет
  fs.mkdirSync(pagesDir, { recursive: true });

  const filePaths: Record<string, string> = {};

  // Сохраняем каждую страницу
  for (const [pageType, pageData] of Object.entries(pages)) {
    // Получаем информацию о странице из pagesInfo если она есть
    const pageInfo = pagesInfo?.[pageType];
    const isCustom = pageInfo?.isCustom || false;
    const pageName = pageInfo?.pageName;

    let fileName = getPageFileName(pageType, pageName, isCustom);
    if (localeOpts) {
      fileName = withLocaleSuffix(
        fileName,
        localeOpts.locale,
        localeOpts.defaultLocale,
        localeOpts.projectLocales
      );
    }
    const filePath = path.join(pagesDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(pageData, null, 2), "utf-8");
    // Сохраняем относительный путь от корня проекта
    filePaths[pageType] = `src/pages/${fileName}`;
    console.log(`[build] Сохранена страница: ${fileName}`);
  }

  return filePaths;
};

/**
 * Сохраняет FAQ в faq.json
 * faqData может быть объектом с FAQ по страницам или единым объектом FAQ
 */
export const saveFAQToProject = (projectPath: string, faqData: any): string => {
  const pagesDir = path.join(projectPath, "src", "pages");

  // Создаем директорию pages если её нет
  fs.mkdirSync(pagesDir, { recursive: true });

  // FAQ должен приходить уже в правильной структуре: { faq: { h2, text, items: [...] } }
  // Просто сохраняем как есть
  const finalFaqData = faqData;

  const faqPath = path.join(pagesDir, "faq.json");
  fs.writeFileSync(faqPath, JSON.stringify(finalFaqData, null, 2), "utf-8");
  console.log(`[build] Сохранен FAQ: faq.json`);

  return "src/pages/faq.json";
};

/**
 * Сохраняет настройки проекта в project-settings.json
 */
export const saveProjectSettings = (
  projectPath: string,
  settings: {
    brand: string;
    language: string;
    country: string;
    domain: string;
    affiliateLink: string;
    projectName: string;
    createdAt: string;
    pages?: Record<
      string,
      {
        pageType: string;
        blocks: string[];
        generated: boolean;
        pageName?: string; // Кастомный slug для страницы
        displayName?: string; // Название в меню/хэдере
        isCustom?: boolean;
        blockTemplates?: Record<string, string>; // Шаблоны для блоков
        filePath?: string; // Путь к JSON файлу страницы (defaultLocale)
        localeFiles?: Record<string, string>; // locale code -> относительный путь
        generatedLocales?: Record<string, boolean>;
      }
    >;
    imagePresets?: Array<{
      id: string;
      name: string;
      sizes: { image1: string; image2: string; image3: string };
    }>;
    variants?: {
      mainBlock: number; // 0-5
      cardsList: number; // 0-5
      glossaryList: number; // 0-5
      faqBlock: number; // 0-5
    };
    app?: {
      hasApp: boolean;
      fileName?: string | null;
      link?: string | null;
    };
    googleHtml?: {
      accountName: string;
      /** Все загруженные в проект .html (новый формат) */
      fileNames?: string[];
      /** @deprecated см. fileNames — оставлено для старых project-settings.json */
      fileName?: string;
    };
    heroButtons?: {
      button1Text?: string;
      button2Text?: string;
    };
    htmlLang?: string;
    primaryLanguage?: string;
    secondaryLanguages?: string[];
    locales?: string[];
    defaultLocale?: string;
    geoCode?: string | null;
    geoLabel?: string | null;
    languageCount?: number;
    languagePresetSource?: string;
    previewApproved?: boolean;
    previewViewedAt?: string | null;
    alwaysOpenPreviewAfterGeneration?: boolean;
    askBeforeBuild?: boolean;
  }
): void => {
  const settingsPath = path.join(projectPath, "project-settings.json");
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  console.log(`[build] Сохранены настройки проекта в project-settings.json`);
};

/**
 * Получает список всех проектов
 */
export const getAllProjects = (): Array<{
  name: string;
  path: string;
  metadata: any;
  createdAt: Date | null;
}> => {
  const rootDir = APP_ROOT;
  const projectsDir = path.join(rootDir, "projects");

  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  const projects: Array<{
    name: string;
    path: string;
    metadata: any;
    createdAt: Date | null;
  }> = [];

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const projectPath = path.join(projectsDir, entry.name);
        const settingsPath = path.join(projectPath, "project-settings.json");

        let settings = null;
        let createdAt: Date | null = null;

        // Получаем дату изменения папки как fallback
        try {
          createdAt = fs.statSync(projectPath).mtime;
        } catch (statErr: any) {
          console.warn(
            `[build] Не удалось получить дату для проекта ${entry.name}:`,
            statErr.message
          );
          createdAt = new Date();
        }

        // Читаем настройки проекта если они есть
        if (fs.existsSync(settingsPath)) {
          try {
            const settingsContent = fs.readFileSync(settingsPath, "utf-8");
            if (settingsContent.trim()) {
              settings = JSON.parse(settingsContent);
              if (settings?.createdAt) {
                try {
                  createdAt = new Date(settings.createdAt);
                } catch (dateErr) {
                  // Если дата невалидна, используем дату изменения папки
                  console.warn(
                    `[build] Невалидная дата createdAt для проекта ${entry.name}`
                  );
                }
              }
            } else {
              // Пустой файл
              console.warn(
                `[build] Файл настроек пуст для проекта ${entry.name}`
              );
            }
          } catch (err: any) {
            console.warn(
              `[build] Не удалось прочитать настройки для проекта ${entry.name}:`,
              err.message
            );
            settings = null;
          }
        }

        projects.push({
          name: entry.name,
          path: projectPath,
          metadata: settings || {},
          createdAt,
        });
      } catch (projectErr: any) {
        console.error(
          `[build] Ошибка при обработке проекта ${entry.name}:`,
          projectErr.message
        );
        // Пропускаем проблемный проект и продолжаем
        continue;
      }
    }
  }

  // Сортируем по дате создания (новые сверху)
  projects.sort((a, b) => {
    const dateA = a.createdAt?.getTime() || 0;
    const dateB = b.createdAt?.getTime() || 0;
    return dateB - dateA;
  });

  return projects;
};

/**
 * Получает путь к проекту
 */
export const getProjectPath = (projectName: string): string => {
  const rootDir = APP_ROOT;
  const projectsDir = path.join(rootDir, "projects");
  return path.join(projectsDir, projectName);
};

/**
 * Удаляет проект (папку с проектом)
 * Работает на любой ОС, включая Ubuntu
 */
export const deleteProject = (projectName: string): void => {
  // Защита от path traversal
  if (!projectName || projectName.includes("..") || projectName.includes(path.sep)) {
    throw new Error("Недопустимое имя проекта");
  }

  const projectPath = getProjectPath(projectName);

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Проект "${projectName}" не найден`);
  }

  fs.rmSync(projectPath, { recursive: true });
  console.log(`[build] Проект "${projectName}" удалён`);
};

/**
 * Проверяет существование проекта
 */
export const projectExists = (projectName: string): boolean => {
  const projectPath = getProjectPath(projectName);
  return fs.existsSync(projectPath);
};

/** Нормализует googleHtml: миграция с legacy fileName на fileNames */
export function normalizeGoogleHtml(raw: any): {
  accountName: string;
  fileNames: string[];
  fileName?: string;
} | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const accountName = raw.accountName;
  if (typeof accountName !== "string" || !accountName.trim()) return undefined;

  let fileNames: string[] = Array.isArray(raw.fileNames)
    ? raw.fileNames.filter((f: unknown) => typeof f === "string" && f)
    : [];
  if (
    fileNames.length === 0 &&
    typeof raw.fileName === "string" &&
    raw.fileName
  ) {
    fileNames = [raw.fileName];
  }

  const out: {
    accountName: string;
    fileNames: string[];
    fileName?: string;
  } = { accountName, fileNames };
  if (typeof raw.fileName === "string" && raw.fileName) {
    out.fileName = raw.fileName;
  }
  return out;
}

function applyGoogleHtmlNormalization(settings: any): void {
  if (!settings?.googleHtml) return;
  const n = normalizeGoogleHtml(settings.googleHtml);
  if (n) settings.googleHtml = n;
}

/**
 * Получает настройки конкретного проекта
 */
export const getProjectSettings = (projectName: string): any | null => {
  const projectPath = getProjectPath(projectName);
  const settingsPath = path.join(projectPath, "project-settings.json");

  if (!fs.existsSync(projectPath)) {
    return null;
  }

  if (!fs.existsSync(settingsPath)) {
    return null;
  }

  try {
    const settingsContent = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);
    applyGoogleHtmlNormalization(settings);
    return settings;
  } catch (err) {
    console.error(
      `[build] Ошибка при чтении настроек проекта ${projectName}:`,
      err
    );
    return null;
  }
};

/**
 * Обновляет lang в index.html проекта
 */
export const updateProjectIndexHtmlLang = (
  projectPath: string,
  lang: string
): void => {
  const indexHtmlPath = path.join(projectPath, "index.html");
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(`index.html not found in project`);
  }

  let content = fs.readFileSync(indexHtmlPath, "utf-8");
  // Заменяем lang="..." на новое значение
  if (/lang\s*=\s*["'][^"']*["']/i.test(content)) {
    content = content.replace(
      /lang\s*=\s*["'][^"']*["']/i,
      `lang="${lang}"`
    );
  } else {
    // Если атрибут lang отсутствует, добавляем после <html
    content = content.replace(/<html\s*/i, `<html lang="${lang}" `);
  }
  fs.writeFileSync(indexHtmlPath, content, "utf-8");
  console.log(`[build] Обновлен lang="${lang}" в index.html`);
};

/**
 * Обновляет настройки проекта
 */
export const updateProjectSettings = (
  projectName: string,
  updates: {
    brand?: string;
    language?: string;
    country?: string;
    domain?: string;
    affiliateLink?: string;
    htmlLang?: string;
    app?: {
      hasApp: boolean;
      fileName?: string | null;
      link?: string | null;
    };
    heroButtons?: {
      button1Text?: string;
      button2Text?: string;
    };
    alwaysOpenPreviewAfterGeneration?: boolean;
    askBeforeBuild?: boolean;
    previewApproved?: boolean;
    previewViewedAt?: string | null;
    primaryLanguage?: string;
    secondaryLanguages?: string[];
    locales?: string[];
    defaultLocale?: string;
    geoCode?: string | null;
    geoLabel?: string | null;
    languageCount?: number;
    languagePresetSource?: string;
  }
): void => {
  const projectPath = getProjectPath(projectName);
  const settingsPath = path.join(projectPath, "project-settings.json");

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project ${projectName} does not exist`);
  }

  if (!fs.existsSync(settingsPath)) {
    throw new Error(`Project settings not found for ${projectName}`);
  }

  try {
    // Читаем текущие настройки
    const currentSettings = getProjectSettings(projectName);
    if (!currentSettings) {
      throw new Error(`Failed to read current settings for ${projectName}`);
    }

    // Обновляем только переданные поля
    const updatedSettings = {
      ...currentSettings,
      ...updates,
    };

    // Сохраняем обновленные настройки
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(updatedSettings, null, 2),
      "utf-8"
    );
    console.log(`[build] Обновлены настройки проекта ${projectName}`);
  } catch (err: any) {
    console.error(
      `[build] Ошибка при обновлении настроек проекта ${projectName}:`,
      err
    );
    throw err;
  }
};

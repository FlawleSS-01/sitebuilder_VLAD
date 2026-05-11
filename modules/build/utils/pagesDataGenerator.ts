import fs from "fs";
import path from "path";
import { syncIndexHtmlHead } from "./indexHtmlSync.js";

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

/**
 * Получает ключ для pagesData (ключ для импорта)
 */
const getPageDataKey = (
  pageType: string,
  pageName?: string,
  isCustom?: boolean
): string => {
  // Если задан кастомный slug (pageName), используем его для всех страниц
  if (pageName && pageName.trim()) {
    // Нормализуем slug: только строчные буквы, цифры и тире
    const normalizedSlug = pageName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    // Убираем множественные тире
    return normalizedSlug.replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  
  // Стандартные страницы без кастомного slug
  if (pageType === "homepage") {
    return "main";
  }
  if (PAGE_FILE_MAP[pageType]) {
    return pageType;
  }
  // Другие страницы
  return pageType;
};

/**
 * Получает имя переменной для импорта
 */
const getImportVariableName = (key: string): string => {
  // Преобразуем ключ в валидное имя переменной (camelCase)
  // Разбиваем по тире и обрабатываем каждую часть
  // Например: "casino-1123" -> "casino1123", "okww-casino" -> "okwwCasino"
  const parts = key.split("-");
  
  if (parts.length === 1) {
    // Нет тире, возвращаем как есть (но проверяем на валидность)
    let result = parts[0].replace(/[^a-zA-Z0-9_]/g, "");
    if (/^[0-9]/.test(result)) {
      result = `page${result}`;
    }
    return result;
  }
  
  // Первая часть всегда с маленькой буквы
  let result = parts[0].replace(/[^a-zA-Z0-9_]/g, "");
  
  // Обрабатываем остальные части
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].replace(/[^a-zA-Z0-9_]/g, "");
    if (part.length === 0) continue;
    
    // Если часть начинается с цифры, просто добавляем её
    if (/^[0-9]/.test(part)) {
      result += part;
    } else {
      // Если часть начинается с буквы, делаем первую букву заглавной
      result += part.charAt(0).toUpperCase() + part.slice(1);
    }
  }
  
  // Убеждаемся, что имя начинается с буквы
  if (/^[0-9]/.test(result)) {
    result = `page${result}`;
  }
  
  return result;
};

function normalizeLocaleId(l: string): string {
  return String(l || "en")
    .toLowerCase()
    .replace(/_/g, "-");
}

function generateSiteConfigJs(projectPath: string, settings: any): void {
  const raw =
    Array.isArray(settings.locales) && settings.locales.length > 0
      ? settings.locales
      : ["en"];
  const locales = raw.map((x: string) => normalizeLocaleId(x));
  const defaultLocale = normalizeLocaleId(
    settings.defaultLocale || locales[0] || "en"
  );
  const outPath = path.join(projectPath, "src", "data", "siteConfig.js");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `// Авто-генерация site builder
export const SITE_LOCALES = ${JSON.stringify(locales)};
export const DEFAULT_LOCALE = ${JSON.stringify(defaultLocale)};
`,
    "utf-8"
  );
  console.log(`[build] Сгенерирован siteConfig.js`);
}

function resolvePageJsonRelativeForLocale(
  pageType: string,
  pageInfo: any,
  locale: string,
  defaultLocale: string
): string | null {
  const loc = normalizeLocaleId(locale);
  const def = normalizeLocaleId(defaultLocale);
  const lf = pageInfo.localeFiles as Record<string, string> | undefined;
  if (lf && typeof lf === "object") {
    const entry = Object.entries(lf).find(
      ([k]) => normalizeLocaleId(k) === loc
    );
    const direct =
      lf[loc] ||
      lf[locale] ||
      entry?.[1];
    if (direct) return direct;
  }
  if (loc === def && typeof pageInfo.filePath === "string") {
    return pageInfo.filePath;
  }
  const fileName = getPageFileName(
    pageType,
    pageInfo.pageName,
    pageInfo.isCustom
  );
  if (loc === def) {
    return `src/pages/${fileName}`;
  }
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  return `src/pages/${base}.${loc}${ext}`;
}

function generatePagesByLocaleJs(projectPath: string, settings: any): void {
  const raw =
    Array.isArray(settings.locales) && settings.locales.length > 0
      ? settings.locales
      : ["en"];
  const locales = raw.map((x: string) => normalizeLocaleId(x));
  const defaultLocale = normalizeLocaleId(
    settings.defaultLocale || locales[0] || "en"
  );
  const outPath = path.join(projectPath, "src", "data", "pagesByLocale.js");

  if (!settings.pages || Object.keys(settings.pages).length === 0) {
    const lines = locales
      .map((l) => `  ${JSON.stringify(l)}: {},`)
      .join("\n");
    fs.writeFileSync(
      outPath,
      `export const pagesByLocale = {
${lines}
};
`,
      "utf-8"
    );
    console.log(`[build] Сгенерирован pagesByLocale.js (пустой проект)`);
    return;
  }

  if (locales.length === 1) {
    fs.writeFileSync(
      outPath,
      `import { pagesData } from "./pagesData.js";
import { DEFAULT_LOCALE } from "./siteConfig.js";

export const pagesByLocale = {
  [DEFAULT_LOCALE]: pagesData,
};
`,
      "utf-8"
    );
    console.log(`[build] Сгенерирован pagesByLocale.js (одна локаль)`);
    return;
  }

  const importMap = new Map<string, string>();
  const importLines: string[] = [];
  let importIdx = 0;

  function ensureImport(relProjectPath: string): string {
    const norm = relProjectPath.replace(/\\/g, "/");
    if (importMap.has(norm)) return importMap.get(norm)!;
    const varName = `_${importIdx++}`;
    importMap.set(norm, varName);
    const fromRoot = norm.startsWith("src/") ? norm.slice(4) : norm;
    importLines.push(
      `import ${varName} from "../${fromRoot.replace(/^\/+/, "")}";`
    );
    return varName;
  }

  const outer: string[] = ["export const pagesByLocale = {"];

  for (const loc of locales) {
    const innerPairs: string[] = [];
    for (const [pageType, pageInfo] of Object.entries(settings.pages)) {
      const pi = pageInfo as any;
      if (!pi.generated) continue;
      const key = getPageDataKey(pageType, pi.pageName, pi.isCustom);
      let rel = resolvePageJsonRelativeForLocale(
        pageType,
        pi,
        loc,
        defaultLocale
      );
      let abs = rel ? path.join(projectPath, rel) : "";
      if (!rel || !fs.existsSync(abs)) {
        rel = resolvePageJsonRelativeForLocale(
          pageType,
          pi,
          defaultLocale,
          defaultLocale
        );
        abs = rel ? path.join(projectPath, rel) : "";
      }
      if (!rel || !fs.existsSync(abs)) continue;
      const kq = key.includes("-") || /^\d/.test(key) ? `"${key}"` : key;
      innerPairs.push(`    ${kq}: ${ensureImport(rel)}`);
    }
    outer.push(`  ${JSON.stringify(loc)}: {`);
    outer.push(innerPairs.join(",\n"));
    outer.push(`  },`);
  }
  outer.push("};");

  const content = `${importLines.join("\n")}\n\n${outer.join("\n")}\n`;
  fs.writeFileSync(outPath, content, "utf-8");
  console.log(
    `[build] Сгенерирован pagesByLocale.js (${locales.length} локалей)`
  );
}

/**
 * Генерирует pagesData.js на основе страниц из project-settings.json
 */
export const generatePagesData = (projectPath: string): void => {
  const settingsPath = path.join(projectPath, "project-settings.json");
  const pagesDataPath = path.join(projectPath, "src", "data", "pagesData.js");
  const pagesDir = path.join(projectPath, "src", "pages");

  if (!fs.existsSync(settingsPath)) {
    console.log(
      `[build] project-settings.json не найден, пропускаем генерацию pagesData.js`
    );
    return;
  }

  // Читаем настройки проекта
  const settingsContent = fs.readFileSync(settingsPath, "utf-8");
  const settings = JSON.parse(settingsContent);

  generateSiteConfigJs(projectPath, settings);

  if (!settings.pages || Object.keys(settings.pages).length === 0) {
    console.log(
      `[build] Нет страниц в project-settings.json, пропускаем генерацию pagesData.js`
    );
    generatePagesByLocaleJs(projectPath, settings);
    try {
      syncIndexHtmlHead(projectPath);
    } catch (e: any) {
      console.warn("[build] syncIndexHtmlHead:", e?.message || e);
    }
    return;
  }

  // Создаем директорию data если её нет
  const dataDir = path.dirname(pagesDataPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Собираем информацию о страницах
  const imports: string[] = [];
  const pageEntries: string[] = [];

  // Обрабатываем все страницы из settings.pages
  for (const [pageType, pageInfo] of Object.entries(settings.pages)) {
    const pageData = pageInfo as any;

    // Пропускаем страницы, которые не сгенерированы
    if (!pageData.generated) {
      continue;
    }

    // Определяем имя файла и ключ
    const fileName = getPageFileName(
      pageType,
      pageData.pageName,
      pageData.isCustom
    );
    const filePath = path.join(pagesDir, fileName);

    // Проверяем, что файл существует
    if (!fs.existsSync(filePath)) {
      console.log(`[build] Файл страницы не найден: ${fileName}, пропускаем`);
      continue;
    }

    // Получаем ключ страницы (используем кастомный slug если задан)
    const key = getPageDataKey(pageType, pageData.pageName, pageData.isCustom);
    const importVar = getImportVariableName(key);

    // Проверяем, что не добавляем дубликаты
    if (imports.some((imp) => imp.includes(`import ${importVar}Data`))) {
      continue;
    }

    imports.push(`import ${importVar}Data from "../pages/${fileName}";`);
    // Оборачиваем ключ в кавычки, если он содержит тире или другие спецсимволы
    const keyWithQuotes = key.includes("-") ? `"${key}"` : key;
    pageEntries.push(`  ${keyWithQuotes}: ${importVar}Data,`);
  }

  // Генерируем содержимое файла
  const content = `${imports.join("\n")}

export const pagesData = {
${pageEntries.join("\n")}
};
`;

  // Сохраняем файл
  fs.writeFileSync(pagesDataPath, content, "utf-8");
  console.log(
    `[build] Сгенерирован pagesData.js с ${pageEntries.length} страницами`
  );

  // Генерируем pageMetadata.js с метаданными страниц (displayName)
  generatePageMetadata(projectPath, settings);

  generatePagesByLocaleJs(projectPath, settings);

  try {
    syncIndexHtmlHead(projectPath);
  } catch (e: any) {
    console.warn("[build] syncIndexHtmlHead:", e?.message || e);
  }
};

/**
 * Генерирует pageMetadata.js с метаданными страниц (displayName для меню)
 */
const generatePageMetadata = (projectPath: string, settings: any): void => {
  const pageMetadataPath = path.join(projectPath, "src", "data", "pageMetadata.js");
  const dataDir = path.dirname(pageMetadataPath);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const PAGE_LABELS: Record<string, string> = {
    main: "Main",
    casino: "Casino",
    slots: "Slots",
    betting: "Bets",
    login: "Login",
    games: "Games",
    app: "App",
  };

  const metadataEntries: string[] = [];

  // Обрабатываем все страницы из settings.pages
  for (const [pageType, pageInfo] of Object.entries(settings.pages || {})) {
    const pageData = pageInfo as any;

    // Пропускаем страницы, которые не сгенерированы
    if (!pageData.generated) {
      continue;
    }

    // Определяем ключ страницы (используем кастомный slug если задан)
    const key = getPageDataKey(pageType, pageData.pageName, pageData.isCustom);

    // Получаем displayName: сначала из pageData.displayName, потом из PAGE_LABELS, потом генерируем
    let displayName = pageData.displayName;
    
    if (!displayName) {
      // Используем стандартное название или генерируем из ключа
      if (PAGE_LABELS[key]) {
        displayName = PAGE_LABELS[key];
      } else {
        // Генерируем из ключа: заменяем тире на пробелы и капитализируем
        displayName = key
          .replace(/[-_]/g, " ")
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
      }
    }

    // Оборачиваем ключ в кавычки, если он содержит тире
    const keyWithQuotes = key.includes("-") ? `"${key}"` : key;
    // Экранируем кавычки в displayName
    const escapedDisplayName = displayName.replace(/"/g, '\\"');
    metadataEntries.push(`  ${keyWithQuotes}: "${escapedDisplayName}",`);
  }

  // Генерируем содержимое файла
  const metadataContent = `// Метаданные страниц для отображения в меню и хэдере
export const pageMetadata = {
${metadataEntries.join("\n")}
};
`;

  // Сохраняем файл
  fs.writeFileSync(pageMetadataPath, metadataContent, "utf-8");
  console.log(
    `[build] Сгенерирован pageMetadata.js с ${metadataEntries.length} страницами`
  );
};

/**
 * Генерирует список маршрутов для sitemap на основе pagesData.js
 */
export const getRoutesForSitemap = (projectPath: string): string[] => {
  const pagesDataPath = path.join(projectPath, "src", "data", "pagesData.js");

  if (!fs.existsSync(pagesDataPath)) {
    return ["/"]; // Только главная страница
  }

  const routes: string[] = ["/"]; // Всегда добавляем главную

  // Читаем pagesData.js и извлекаем ключи
  const content = fs.readFileSync(pagesDataPath, "utf-8");

  // Ищем все ключи в объекте pagesData
  const pagesDataMatch = content.match(/export const pagesData = \{([^}]+)\}/s);
  if (pagesDataMatch) {
    const entries = pagesDataMatch[1];
    // Ищем все ключи: поддерживаем как обычные ключи (main:), так и ключи в кавычках ("okww-casino":)
    // Паттерн: "ключ": или ключ: (где ключ может содержать буквы, цифры, тире и подчеркивания)
    const keyMatches = entries.matchAll(/(?:"([^"]+)"|(\w+)):/g);
    for (const match of keyMatches) {
      // match[1] - ключ в кавычках, match[2] - ключ без кавычек
      const key = match[1] || match[2];
      if (key === "main") {
        continue; // Уже добавили "/"
      }
      routes.push(`/${key}`);
    }
  }

  return routes;
};

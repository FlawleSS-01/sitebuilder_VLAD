import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");

const THEMES_DIR = "themes";
const CUSTOM_THEME_FILE = "castom.css";
const INDEX_CSS_FILE = "index.css";

const THEME_PRESETS_DIR = path.join(APP_ROOT, "modules", "source", "theme-presets");
const DEFAULT_TEMPLATE_THEMES = path.join(
  APP_ROOT,
  "modules",
  "source",
  "default-template",
  "src",
  THEMES_DIR
);
const LEGACY_SOURCE_THEMES = path.join(
  APP_ROOT,
  "modules",
  "source",
  "app",
  "src",
  THEMES_DIR
);

function resolveBundledThemePath(themeName: string): string | null {
  const candidates = [
    path.join(THEME_PRESETS_DIR, `${themeName}.css`),
    path.join(DEFAULT_TEMPLATE_THEMES, `${themeName}.css`),
    path.join(LEGACY_SOURCE_THEMES, `${themeName}.css`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Получает список доступных тем (bundled presets + legacy paths)
 */
export function getAvailableThemes(): string[] {
  const names = new Set<string>();

  if (fs.existsSync(THEME_PRESETS_DIR)) {
    for (const file of fs.readdirSync(THEME_PRESETS_DIR)) {
      if (file.endsWith(".css") && file !== CUSTOM_THEME_FILE) {
        names.add(file.replace(/\.css$/, ""));
      }
    }
  }

  if (fs.existsSync(DEFAULT_TEMPLATE_THEMES)) {
    for (const file of fs.readdirSync(DEFAULT_TEMPLATE_THEMES)) {
      if (file.endsWith(".css") && file !== CUSTOM_THEME_FILE) {
        names.add(file.replace(/\.css$/, ""));
      }
    }
  }

  return Array.from(names).sort();
}

/**
 * Читает содержимое темы из bundled источников
 */
export function readThemeFile(themeName: string): string | null {
  const resolved = resolveBundledThemePath(themeName);
  if (!resolved) {
    return null;
  }
  return fs.readFileSync(resolved, "utf-8");
}

/**
 * Генерирует CSS файл кастомной темы на основе массива цветов
 */
export function generateCustomThemeCSS(colors: string[]): string {
  const hexToRgb = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "";
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `${r}, ${g}, ${b}`;
  };

  const color1 = colors[0] || "#10383A";
  const color2 = colors[1] || "#7F9275";
  const color3 = colors[2] || "#656E51";
  const color4 = colors[3] || "#fff";
  const color5 = colors[4] || "#fff";
  const color6 = colors[5] || "#DAA112";
  const color7 = colors[6] || "#000";
  const color6Rgb = hexToRgb(color6);

  return `:root {
  --bg: ${color2};
  --text: ${color4};
  --accent: ${color6};
  /* main */
  --main-color: ${color1};
  --main-section-background: ${color2};
  --bg-color: ${color3};
  --main-border-radius: 4px;

  --text-color: ${color4};
  --hero-color: ${color5};

  /* header / footer */
  --footer-text: ${color4};
  --title-color: ${color4};
  --title-color-hover: ${color6};

  /* cards */
  --card-background: ${color6};
  --glossary-background: ${color6};
  --glossary-border-color: ${color6};
  --icon-background: ${color6};
  --icon-background-hover: ${color6};
  --card-color: ${color7};

  --footer-special-background: rgba(23, 54, 55, 0.6);

  /* button */
  --mainBtn-background: ${color6};
  --mainBtn-border: none;
  --mainBtn-color: ${color7};

  --mainBtnSpecial-background: ${color6};
  --mainBtnSpecial-border: ${color6};

  --pulse-color-first: ${color6};
  --pulse-color-second: ${color6};
  --pulse-box-shadow: ${color6Rgb};

  /* faq */
  --faq-color: ${color4};
  --faq-border: 1px solid var(--faq-color-active);
  --faq-color-active: ${color6};

}

body {
  background: var(--bg);
  color: var(--text);
}

a {
  color: var(--accent);
}
`;
}

/**
 * Сохраняет кастомную тему в проект
 */
export function saveCustomTheme(projectPath: string, colors: string[]): void {
  const themesDir = path.join(projectPath, "src", THEMES_DIR);
  if (!fs.existsSync(themesDir)) {
    fs.mkdirSync(themesDir, { recursive: true });
  }

  const customThemePath = path.join(themesDir, CUSTOM_THEME_FILE);
  const cssContent = generateCustomThemeCSS(colors);
  fs.writeFileSync(customThemePath, cssContent, "utf-8");
}

/**
 * Копирует тему из bundled presets в целевой проект
 */
export function copyThemeToProject(
  projectPath: string,
  themeName: string
): void {
  const sourceThemePath = resolveBundledThemePath(themeName);

  if (!sourceThemePath) {
    throw new Error(
      `Theme "${themeName}" not found. Add modules/source/theme-presets/${themeName}.css`
    );
  }

  const themesDir = path.join(projectPath, "src", THEMES_DIR);
  if (!fs.existsSync(themesDir)) {
    fs.mkdirSync(themesDir, { recursive: true });
  }

  const targetThemePath = path.join(themesDir, `${themeName}.css`);
  fs.copyFileSync(sourceThemePath, targetThemePath);
}

/**
 * Обновляет index.css для импорта выбранной темы
 */
export function updateIndexCSS(projectPath: string, themeName: string): void {
  const indexCssPath = path.join(projectPath, "src", INDEX_CSS_FILE);

  if (!fs.existsSync(indexCssPath)) {
    throw new Error(`index.css not found in project: ${projectPath}`);
  }

  let content = fs.readFileSync(indexCssPath, "utf-8");

  content = content.replace(
    /@import\s+["']\.\/themes\/[^"']+\.css["'];?\s*/g,
    ""
  );

  const importStatement = `@import "./themes/${themeName}.css";\n\n`;
  content = importStatement + content.trimStart();

  fs.writeFileSync(indexCssPath, content, "utf-8");
}

/**
 * Получает текущую тему проекта из index.css
 */
export function getCurrentTheme(projectPath: string): {
  mode: "preset" | "custom";
  theme?: string;
  colors?: string[];
} {
  const indexCssPath = path.join(projectPath, "src", INDEX_CSS_FILE);

  if (!fs.existsSync(indexCssPath)) {
    return { mode: "preset", theme: "default" };
  }

  const content = fs.readFileSync(indexCssPath, "utf-8");
  const themeMatch = content.match(
    /@import\s+["']\.\/themes\/([^"']+)\.css["']/
  );

  if (!themeMatch) {
    return { mode: "preset", theme: "default" };
  }

  const themeName = themeMatch[1];

  if (themeName === "castom") {
    const customThemePath = path.join(
      projectPath,
      "src",
      THEMES_DIR,
      CUSTOM_THEME_FILE
    );

    if (fs.existsSync(customThemePath)) {
      const themeContent = fs.readFileSync(customThemePath, "utf-8");
      const colors = extractColorsFromTheme(themeContent);
      return { mode: "custom", colors };
    }
  }

  return { mode: "preset", theme: themeName };
}

function extractColorsFromTheme(cssContent: string): string[] {
  const colors: string[] = Array(7).fill("");

  const color1Match = cssContent.match(/--main-color:\s*([^;]+);/);
  const color2Match = cssContent.match(/--main-section-background:\s*([^;]+);/);
  const color3Match = cssContent.match(/--bg-color:\s*([^;]+);/);
  const color4Match = cssContent.match(/--text-color:\s*([^;]+);/);
  const color5Match = cssContent.match(/--hero-color:\s*([^;]+);/);
  const color6Match = cssContent.match(/--title-color-hover:\s*([^;]+);/);
  const color7Match = cssContent.match(/--card-color:\s*([^;]+);/);

  if (color1Match) colors[0] = color1Match[1].trim();
  if (color2Match) colors[1] = color2Match[1].trim();
  if (color3Match) colors[2] = color3Match[1].trim();
  if (color4Match) colors[3] = color4Match[1].trim();
  if (color5Match) colors[4] = color5Match[1].trim();
  if (color6Match) colors[5] = color6Match[1].trim();
  if (color7Match) colors[6] = color7Match[1].trim();

  return colors;
}

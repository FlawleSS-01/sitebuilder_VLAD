import fs from "fs";
import path from "path";

/**
 * Слой референсных текстов: реальные тексты конкурентных казино-сайтов
 * (docs/text-reference/*.txt — TSV-экспорт xlsx). Для каждой генерации
 * выбираются N случайных референсов; для нужной страницы берётся
 * соответствующий лист (Главная/Казино/Ставки/...) и подаётся модели как
 * образец стиля, глубины и структуры. Модель пишет СВОЙ оригинальный текст.
 */

const REFERENCE_DIR = path.join(process.cwd(), "docs", "text-reference");

/** Маппинг нашего pageType → приоритетный список листов (русские названия). */
const SHEET_ALIASES: Record<string, string[]> = {
  homepage: ["Главная"],
  casino: ["Казино", "Главная"],
  slots: ["Слоты", "Казино", "Главная"],
  games: ["Игры", "Казино", "Главная"],
  betting: ["Ставки", "Главная"],
  app: ["Приложение", "Главная"],
  login: ["Логин", "Главная"],
  faq: ["Glossary FAQ", "Главная"],
  bonus: ["Бонус", "Главная"],
};

/** Маркеры структурных полей в колонке A (их подписываем, остальное — контент). */
const FIELD_MARKERS = new Set([
  "title",
  "description",
  "h1",
  "h1_description",
  "h2",
  "h3",
  "welcome",
  "features",
  "category",
  "security",
  "bonuses",
  "popular_games",
  "faq",
  "glossary",
  "intro",
  "start",
  "about",
  "payments",
  "support",
  "promotions",
]);

function envFlag(name: string, def: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return def;
  return !(raw === "false" || raw === "0" || raw === "no" || raw === "off");
}

function envInt(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= min && n <= max) return n;
  return def;
}

export function isReferenceLayerEnabled(): boolean {
  return envFlag("SITEBUILDER_USE_REFERENCE_TEXTS", true);
}

export function getReferenceCount(): number {
  return envInt("SITEBUILDER_REFERENCE_COUNT", 3, 1, 6);
}

function getMaxCharsPerSample(): number {
  return envInt("SITEBUILDER_REFERENCE_MAX_CHARS", 1100, 300, 4000);
}

/** Небольшой детерминированный PRNG (mulberry32) — без зависимостей от других модулей. */
function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 343291835);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

let cachedFileList: string[] | null = null;
const parsedSheetsCache = new Map<string, Map<string, string>>();

/** Список реальных референс-файлов (без шаблонов/списков). */
export function listReferenceFiles(): string[] {
  if (cachedFileList) return cachedFileList;
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(REFERENCE_DIR)
      .filter((f) => f.toLowerCase().endsWith(".txt"))
      .filter((f) => !/шаблон|список|template|readme/i.test(f))
      .map((f) => path.join(REFERENCE_DIR, f));
  } catch {
    files = [];
  }
  cachedFileList = files;
  return files;
}

/** Выбирает N референс-файлов (случайно или детерминированно по seed). */
export function pickReferenceFiles(count: number, seed?: string): string[] {
  const all = listReferenceFiles();
  if (all.length === 0) return [];
  const pool = [...all];
  const rng = seed ? seededRng(seed) : Math.random;
  const out: string[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return out;
}

/** Разбивает сырой файл на листы: имя листа → очищенный текст. */
function parseSheets(raw: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = raw.split(/\r?\n/);
  let currentSheet: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentSheet && buffer.length > 0) {
      result.set(currentSheet, buffer.join("\n"));
    }
    buffer = [];
  };

  for (const line of lines) {
    const sheetMatch = line.match(/^---\s*SHEET:\s*(.+?)\s*---\s*$/);
    if (sheetMatch) {
      flush();
      currentSheet = sheetMatch[1]!.trim();
      continue;
    }
    if (!currentSheet) continue;

    const parts = line
      .split("\t")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;

    if (parts.length === 1) {
      buffer.push(parts[0]!);
    } else if (FIELD_MARKERS.has(parts[0]!.toLowerCase())) {
      buffer.push(`${parts[0]}: ${parts.slice(1).join(" — ")}`);
    } else {
      buffer.push(parts.join(" — "));
    }
  }
  flush();
  return result;
}

function getParsedSheets(file: string): Map<string, string> {
  const cached = parsedSheetsCache.get(file);
  if (cached) return cached;
  let parsed = new Map<string, string>();
  try {
    parsed = parseSheets(fs.readFileSync(file, "utf-8"));
  } catch {
    parsed = new Map();
  }
  parsedSheetsCache.set(file, parsed);
  return parsed;
}

/** Возвращает текст листа для pageType из файла (с учётом fallback-цепочки). */
function sheetTextForPage(file: string, pageType: string): string | null {
  const sheets = getParsedSheets(file);
  if (sheets.size === 0) return null;
  const aliases = SHEET_ALIASES[pageType] || ["Главная", "Казино"];
  for (const alias of aliases) {
    const text = sheets.get(alias);
    if (text && text.trim().length > 40) return text.trim();
  }
  // последний шанс — любой непустой лист
  for (const text of sheets.values()) {
    if (text && text.trim().length > 40) return text.trim();
  }
  return null;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastBreak = cut.lastIndexOf("\n");
  return (lastBreak > maxChars * 0.5 ? cut.slice(0, lastBreak) : cut).trim() + " …";
}

/**
 * Собирает блок-подсказку для user-промпта на основе референсов.
 * Если referenceFiles не переданы — выбирает случайные.
 * Возвращает пустую строку, если слой выключен или нет данных.
 */
export function buildReferenceGuidance(
  pageType: string,
  referenceFiles?: string[]
): string {
  if (!isReferenceLayerEnabled()) return "";

  const files =
    referenceFiles && referenceFiles.length > 0
      ? referenceFiles
      : pickReferenceFiles(getReferenceCount());
  if (files.length === 0) return "";

  const maxChars = getMaxCharsPerSample();
  const samples: string[] = [];
  for (const file of files) {
    const text = sheetTextForPage(file, pageType);
    if (text) samples.push(truncate(text, maxChars));
  }
  if (samples.length === 0) return "";

  const blocks = samples
    .map((s, i) => `--- Reference ${i + 1} ---\n${s}`)
    .join("\n\n");

  return `\nReference examples — REAL competitor casino "${pageType}" pages (use ONLY as inspiration for tone, depth, structure, and which topics/sections to cover). STRICT rules:
- DO NOT copy any sentence or phrase verbatim — write 100% original text.
- Replace ANY other brand names found below with the current brand.
- Match the professional depth, length and topical coverage shown here.
- Keep the same kind of sections (intro, how-to, why-choose, payments, games, support, etc.) where they fit the requested blocks.

${blocks}

Now write fresh, unique content in the requested structure, inspired by the above but entirely your own.`;
}

/** Seeded PRNG (mulberry32) for reproducible auto-generation choices. */
export function createSeededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 343291835);
    h = (h << 13) | (h >>> 19);
  }
  return function mulberry32() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function pickOne<T>(rng: () => number, items: T[]): T {
  if (items.length === 0) {
    throw new Error("pickOne: empty array");
  }
  return items[Math.floor(rng() * items.length)]!;
}

export function pickManyUnique<T>(rng: () => number, items: T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return out;
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const INTRO_BLOCKS = new Set(["welcome", "start", "hero", "intro"]);

/** Intro/welcome blocks stay at the top of the page. */
export function orderBlocksIntroFirst(blocks: string[]): string[] {
  const intro: string[] = [];
  const rest: string[] = [];
  for (const b of blocks) {
    if (INTRO_BLOCKS.has(b)) intro.push(b);
    else rest.push(b);
  }
  return [...intro, ...rest];
}

export type StandardPageType =
  | "homepage"
  | "casino"
  | "betting"
  | "app"
  | "login";

export const REQUIRED_PAGE_TYPES: StandardPageType[] = [
  "homepage",
  "casino",
  "betting",
  "app",
  "login",
];

const PAGE_POOLS: Record<StandardPageType, string[]> = {
  homepage: [
    "start",
    "welcome",
    "features",
    "popular_games",
    "category",
    "glossary",
    "games_universe",
    "security",
  ],
  casino: ["welcome", "features", "casino_games", "bonuses", "live_casino"],
  betting: ["welcome", "features", "start", "sports", "other"],
  app: ["welcome", "features", "download", "other"],
  login: ["security", "features", "forgot"],
};

const DEFAULT_BLOCK_TEMPLATES: Record<string, string> = {
  start: "h2_4p",
  welcome: "h2_3p",
  features: "h2_list-large",
  popular_games: "h2_list-large",
  category: "h2_p_list",
  glossary: "h2_p_glossary",
  games_universe: "h2_4p",
  security: "h2_4p",
  casino_games: "h2_list",
  bonuses: "h2_3p",
  live_casino: "h2_3p",
  sports: "h2_list",
  download: "h2_2p",
  other: "h2_2p",
  forgot: "h2_2p",
  tips: "h2_3p",
  powered: "h2_2p",
  faq: "faq_block",
  // Дополнительные текстовые (прозовые) блоки — больше контента, без перечислений.
  about: "h2_4p",
  why_us: "h2_3p",
  payments: "h2_3p",
  support: "h2_2p",
  promotions: "h2_3p",
  getting_started: "h2_4p",
  responsible_gaming: "h2_2p",
  experience: "h2_3p",
  overview: "h2_4p",
};

/** Структуры, которые рендерятся как перечисления (списки). */
const LIST_TEMPLATE_IDS = new Set([
  "h2_list",
  "h2_list-large",
  "h2_p_list",
  "h2_p_glossary",
]);

/** Общие прозовые блоки, которые подходят почти любой странице казино. */
const EXTRA_PROSE_BLOCKS = [
  "about",
  "why_us",
  "payments",
  "support",
  "promotions",
  "getting_started",
  "experience",
  "overview",
  "responsible_gaming",
];

/** Блок-перечисление? (faq не считается — это отдельный аккордеон). */
function isListBlock(block: string): boolean {
  if (block === "faq") return false;
  const tpl = DEFAULT_BLOCK_TEMPLATES[block] || "h2_2p";
  return LIST_TEMPLATE_IDS.has(tpl);
}

function uniqueBlocks(blocks: string[]): string[] {
  return Array.from(new Set(blocks));
}

/** Гарантирует наличие блока FAQ в конце страницы (для автогенерации FAQ ≥5 вопросов). */
function ensureFaqLast(blocks: string[]): string[] {
  const withoutFaq = blocks.filter((b) => b !== "faq");
  return [...withoutFaq, "faq"];
}

const CUSTOM_BLOCK_POOL = [
  "welcome",
  "features",
  "category",
  "popular_games",
  "security",
  "bonuses",
  "download",
  "other",
  "faq",
];

export function slugFromPageName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface PagePlan {
  pageType: string;
  blocks: string[];
  blockTemplates: Record<string, string>;
  isCustom?: boolean;
  pageName?: string;
  displayName?: string;
  imageCount: number;
}

/** Выбранная пара баннеров: горизонтальный и вертикальный из РАЗНЫХ папок. */
export interface BannerPlan {
  horizontalBrand: string;
  verticalBrand: string;
}

export type BannerMode = "random" | "on" | "off";

export interface AutoRandomPlan {
  themeName: string;
  heroButtons: { button1Text: string; button2Text: string };
  faqCount: number;
  pages: PagePlan[];
  /** null → баннеры выключены для этого сайта. */
  banners: BannerPlan | null;
}

/**
 * Подбирает пару баннеров: горизонтальный и вертикальный ОБЯЗАТЕЛЬНО из разных
 * брендов (папок). Требуется минимум 2 доступных бренда.
 */
export function pickBannerPair(
  rng: () => number,
  brands: string[]
): BannerPlan | null {
  if (brands.length < 2) return null;
  const [first, second] = pickManyUnique(rng, brands, 2);
  // Случайно решаем, какой из двух брендов даёт горизонтальный креатив.
  const horizontalFirst = rng() < 0.5;
  return horizontalFirst
    ? { horizontalBrand: first!, verticalBrand: second! }
    : { horizontalBrand: second!, verticalBrand: first! };
}

const CTA_PAIRS: Array<{ button1Text: string; button2Text: string }> = [
  { button1Text: "Play Now", button2Text: "Get Bonus" },
  { button1Text: "Join Now", button2Text: "Sign Up" },
  { button1Text: "Start Playing", button2Text: "Claim Offer" },
  { button1Text: "Register", button2Text: "Play Free" },
  { button1Text: "Bet Now", button2Text: "Download App" },
];

function imageCountForPage(pageType: string, isCustom: boolean): number {
  if (pageType === "login") return 2;
  if (isCustom) return 2;
  if (pageType === "homepage" || pageType === "casino") return 3;
  return 2;
}

/**
 * Подбирает блоки страницы:
 *  - больше текстовых (прозовых) блоков (4–6);
 *  - максимум один блок-перечисление (список) и не на каждой странице (~50%);
 *  - вступительные блоки идут первыми.
 */
function pickBlocksForPage(
  rng: () => number,
  pool: string[],
  _minCount = 3
): string[] {
  const listPool = pool.filter(isListBlock);
  const prosePoolBase = pool.filter((b) => !isListBlock(b) && b !== "faq");
  const prosePool = uniqueBlocks([...prosePoolBase, ...EXTRA_PROSE_BLOCKS]);

  const proseCount = Math.min(prosePool.length, randInt(rng, 4, 6));
  const proseBlocks = pickManyUnique(rng, prosePool, proseCount);

  // ~50% страниц получают ровно один блок-перечисление.
  const includeList = listPool.length > 0 && rng() < 0.5;
  const listBlocks = includeList ? [pickOne(rng, listPool)] : [];

  return orderBlocksIntroFirst([...proseBlocks, ...listBlocks]);
}

function templatesForBlocks(blocks: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of blocks) {
    out[b] = DEFAULT_BLOCK_TEMPLATES[b] || "h2_2p";
  }
  return out;
}

export function buildAutoRandomPlan(input: {
  projectName: string;
  availableThemes: string[];
  customPages?: Array<{ name: string; slug?: string; blocks?: string[] }>;
  /** Конкретная тема или "random"/undefined — тогда выбирается случайно. */
  themeChoice?: string;
  /** Доступные бренды баннеров (папки docs/ с полной парой креативов). */
  availableBannerBrands?: string[];
  /** on → всегда с баннерами, off → без, random/undefined → 50/50. */
  bannerMode?: BannerMode;
}): AutoRandomPlan {
  const rng = createSeededRng(`${input.projectName}-${Date.now()}`);
  const themeName = resolveThemeName(
    rng,
    input.availableThemes,
    input.themeChoice
  );
  const heroButtons = pickOne(rng, CTA_PAIRS);
  const faqCount = randInt(rng, 4, 7);

  const banners = resolveBannerPlan(
    rng,
    input.availableBannerBrands || [],
    input.bannerMode
  );

  const pages: PagePlan[] = [];

  for (const pageType of REQUIRED_PAGE_TYPES) {
    const pool = PAGE_POOLS[pageType];
    const blocks = ensureFaqLast(pickBlocksForPage(rng, pool, 3));
    pages.push({
      pageType,
      blocks,
      blockTemplates: templatesForBlocks(blocks),
      imageCount: imageCountForPage(pageType, false),
    });
  }

  for (const cp of input.customPages || []) {
    const slug = cp.slug?.trim() || slugFromPageName(cp.name);
    let blocks =
      cp.blocks && cp.blocks.length >= 3
        ? orderBlocksIntroFirst(cp.blocks)
        : pickBlocksForPage(rng, CUSTOM_BLOCK_POOL, 3);
    if (blocks.length < 3) {
      blocks = pickBlocksForPage(rng, CUSTOM_BLOCK_POOL, 3);
    }
    blocks = ensureFaqLast(blocks);
    pages.push({
      pageType: slug,
      pageName: cp.name.trim(),
      displayName: cp.name.trim(),
      isCustom: true,
      blocks,
      blockTemplates: templatesForBlocks(blocks),
      imageCount: imageCountForPage(slug, true),
    });
  }

  return {
    themeName,
    heroButtons,
    faqCount,
    pages,
    banners,
  };
}

/** Тема: конкретная (если задана и доступна) либо случайная. */
function resolveThemeName(
  rng: () => number,
  availableThemes: string[],
  themeChoice?: string
): string {
  const choice = themeChoice?.trim();
  if (choice && choice !== "random" && availableThemes.includes(choice)) {
    return choice;
  }
  return availableThemes.length > 0 ? pickOne(rng, availableThemes) : "default";
}

/** Решает, включать ли баннеры, и подбирает пару из разных папок. */
function resolveBannerPlan(
  rng: () => number,
  availableBannerBrands: string[],
  bannerMode?: BannerMode
): BannerPlan | null {
  const mode: BannerMode = bannerMode || "random";
  if (mode === "off") return null;
  const enabled = mode === "on" ? true : rng() < 0.5;
  if (!enabled) return null;
  return pickBannerPair(rng, availableBannerBrands);
}

export function mergeGlobalKeywords(
  blocks: string[],
  perBlock: Record<string, string> | undefined,
  globalRaw: string | undefined
): Record<string, string> {
  const globalTrim = (globalRaw || "").trim();
  const out: Record<string, string> = {};
  for (const block of blocks) {
    const per = perBlock?.[block]?.trim() || "";
    let merged = "";
    if (per && globalTrim) merged = `${per}, ${globalTrim}`;
    else merged = per || globalTrim;
    if (merged) out[block] = merged;
  }
  return out;
}

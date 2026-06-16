import fs from "fs";
import path from "path";
import {
  buildJsonLdGraph,
  normalizeSiteOrigin,
  summaryFromPageJson,
  type PageSeoSummary,
  type FaqItem,
} from "./jsonLdBuilder.js";
import { parseSeoEntityFromSettings } from "./seoEntity.js";
import { writeSeoArtifacts } from "./seoArtifacts.js";
import { titleWithBrandLeading } from "../../source/page-title-brand-first.js";

const PAGE_FILE_MAP: Record<string, string> = {
  homepage: "main.json",
  casino: "casino.json",
  slots: "slots.json",
  games: "games.json",
  betting: "betting.json",
  app: "app.json",
  login: "login.json",
};

const INJECT_START = "<!-- SITE_BUILDER_HEAD_INJECT:start -->";
const INJECT_END = "<!-- SITE_BUILDER_HEAD_INJECT:end -->";

function getPageFileName(
  pageType: string,
  pageName?: string,
  isCustom?: boolean
): string {
  if (PAGE_FILE_MAP[pageType]) return PAGE_FILE_MAP[pageType];
  if (isCustom && pageName) {
    const normalizedName = pageName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    return `${normalizedName}.json`;
  }
  return `${pageType}.json`;
}

function getPageDataKey(
  pageType: string,
  pageName?: string,
  isCustom?: boolean
): string {
  if (pageName && pageName.trim()) {
    const normalizedSlug = pageName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    return normalizedSlug.replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  if (pageType === "homepage") return "main";
  if (PAGE_FILE_MAP[pageType]) return pageType;
  return pageType;
}

function routePathForKey(key: string): string {
  return key === "main" ? "/" : `/${key}`;
}

/**
 * Разрешает путь к JSON страницы для дефолтной локали (или единственного файла).
 */
function resolvePageJsonPath(
  projectPath: string,
  pageType: string,
  pageInfo: Record<string, unknown>,
  defaultLocale: string,
  projectLocales: string[]
): string | null {
  const pagesDir = path.join(projectPath, "src", "pages");
  const pageName = pageInfo.pageName as string | undefined;
  const isCustom = !!pageInfo.isCustom;

  const localeFiles = pageInfo.localeFiles as Record<string, string> | undefined;
  if (localeFiles && typeof localeFiles === "object") {
    const rel =
      localeFiles[defaultLocale] ||
      localeFiles[projectLocales[0]] ||
      Object.values(localeFiles)[0];
    if (rel) return path.join(projectPath, rel);
  }

  const singleFile = pageInfo.filePath as string | undefined;
  if (singleFile && typeof singleFile === "string") {
    const abs = path.join(projectPath, singleFile);
    if (fs.existsSync(abs)) return abs;
  }

  const fileName = getPageFileName(pageType, pageName, isCustom);
  const direct = path.join(pagesDir, fileName);
  if (fs.existsSync(direct)) return direct;

  return null;
}

function readJsonSafe(filePath: string): unknown | null {
  try {
    const t = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/**
 * Собирает SEO-сводку по маршрутам из project-settings и файлов страниц.
 */
function readFaqItems(projectPath: string): FaqItem[] {
  const faqPath = path.join(projectPath, "src", "pages", "faq.json");
  if (!fs.existsSync(faqPath)) return [];
  const data = readJsonSafe(faqPath) as
    | { faq?: { items?: unknown[] }; items?: unknown[] }
    | null;
  const rawItems = data?.faq?.items ?? data?.items;
  if (!Array.isArray(rawItems)) return [];
  const out: FaqItem[] = [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const question = typeof o.question === "string" ? o.question.trim() : "";
    const answer = typeof o.answer === "string" ? o.answer.trim() : "";
    if (question && answer) out.push({ question, answer });
  }
  return out;
}

function pageHasFaqBlock(pageInfo: Record<string, unknown>): boolean {
  const blocks = pageInfo.blocks;
  if (!Array.isArray(blocks)) return false;
  return blocks.some((b) => String(b).toLowerCase().includes("faq"));
}

/**
 * Извлекает реальные вопросы/ответы из FAQ-блока самой страницы (page JSON),
 * чтобы JSON-LD FAQPage совпадал с видимым на странице FAQ.
 */
function extractFaqFromPageJson(data: unknown): FaqItem[] {
  if (!data || typeof data !== "object") return [];
  const blocks = (data as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return [];
  const out: FaqItem[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const elements = (block as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) continue;
    for (const el of elements) {
      if (!el || typeof el !== "object") continue;
      if (String((el as { type?: unknown }).type).toLowerCase() !== "faq")
        continue;
      const items = (el as { items?: unknown }).items;
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const o = it as Record<string, unknown>;
        const question = typeof o.title === "string" ? o.title.trim() : "";
        const answer =
          typeof o.description === "string" ? o.description.trim() : "";
        if (question && answer) out.push({ question, answer });
      }
    }
  }
  return out;
}

export function collectPageSeoSummaries(
  projectPath: string,
  settings: Record<string, unknown>
): PageSeoSummary[] {
  const pages = settings.pages as Record<string, Record<string, unknown>> | undefined;
  if (!pages) return [];

  const defaultLocale =
    (settings.defaultLocale as string) ||
    (Array.isArray(settings.locales) && settings.locales.length
      ? (settings.locales as string[])[0]
      : "en");
  const projectLocales: string[] = Array.isArray(settings.locales)
    ? (settings.locales as string[])
    : [defaultLocale];

  const faqItems = readFaqItems(projectPath);
  const summaries: PageSeoSummary[] = [];

  for (const [pageType, pageInfo] of Object.entries(pages)) {
    if (!pageInfo?.generated) continue;

    const isCustom = !!pageInfo.isCustom;
    const key = getPageDataKey(
      pageType,
      pageInfo.pageName as string | undefined,
      isCustom
    );
    const pathRoute = routePathForKey(key);
    const isHome = pathRoute === "/";

    const jsonPath = resolvePageJsonPath(
      projectPath,
      pageType,
      pageInfo,
      defaultLocale,
      projectLocales
    );
    let name = (pageInfo.displayName as string) || "";
    let description = "";
    let pageFaqItems: FaqItem[] = [];

    if (jsonPath) {
      const data = readJsonSafe(jsonPath);
      const s = summaryFromPageJson(data);
      if (!name) name = s.name;
      description = s.description;
      pageFaqItems = extractFaqFromPageJson(data);
    }
    if (!name) {
      name = isHome ? "Home" : pathRoute.replace(/^\//, "");
    }

    // Приоритет: FAQ из самого page JSON (совпадает с видимым контентом),
    // иначе — глобальный faq.json (главная страница / старые проекты).
    const resolvedFaqItems =
      pageFaqItems.length > 0
        ? pageFaqItems
        : pageHasFaqBlock(pageInfo) || isHome
          ? faqItems
          : [];

    // FAQPage только если на странице реально есть вопросы/ответы.
    const hasFaq = resolvedFaqItems.length > 0;

    summaries.push({
      path: pathRoute,
      name,
      description,
      pageKey: key,
      pageType: isCustom ? "custom" : pageType,
      isCustom,
      hasFaq,
      faqItems: hasFaq ? resolvedFaqItems : undefined,
    });
  }

  if (!summaries.some((s) => s.path === "/")) {
    summaries.unshift({
      path: "/",
      name: (settings.brand as string) || "Home",
      description: "",
      pageKey: "main",
      pageType: "homepage",
      hasFaq: false,
    });
  }

  return summaries;
}

/**
 * Обновляет index.html: meta description, title (если задан), JSON-LD, лёгкие performance-meta.
 */
export function syncIndexHtmlHead(projectPath: string): void {
  const settingsPath = path.join(projectPath, "project-settings.json");
  const indexHtmlPath = path.join(projectPath, "index.html");

  if (!fs.existsSync(indexHtmlPath)) {
    console.warn(`[build] index.html не найден: ${indexHtmlPath}`);
    return;
  }

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      settings = {};
    }
  }

  const brand = (settings.brand as string) || "Site";
  const domain = settings.domain as string | undefined;
  const origin = normalizeSiteOrigin(domain);
  const inLanguage =
    (settings.htmlLang as string) ||
    (settings.defaultLocale as string) ||
    "en";

  const projectLocales: string[] = Array.isArray(settings.locales)
    ? (settings.locales as string[])
    : [inLanguage];
  const defaultLocale =
    (settings.defaultLocale as string) || projectLocales[0] || inLanguage;
  const multiLocale = projectLocales.length > 1;

  const pageSummaries = collectPageSeoSummaries(projectPath, settings);
  const home = pageSummaries.find((s) => s.path === "/");
  const metaDescription = truncateMeta(
    home?.description || `Official site — ${brand}.`
  );
  const homeDisplayName = home?.name || brand;
  const homeTitleForMeta = titleWithBrandLeading(brand, homeDisplayName);

  const seoEntity = parseSeoEntityFromSettings(
    settings,
    projectPath,
    home?.description || metaDescription
  );

  const graph = buildJsonLdGraph({
    origin,
    inLanguage,
    brand,
    entity: seoEntity,
    pages:
      pageSummaries.length > 0
        ? pageSummaries
        : [{ path: "/", name: brand, description: metaDescription, pageKey: "main" }],
  });

  const jsonStr = JSON.stringify(graph).replace(/</g, "\\u003c");

  // Hreflang anchors — only meaningful for multi-locale projects. The
  // default-template SPA serves every locale at the same URL (locale is
  // chosen via context, not URL), so href is identical for each tag,
  // but the alternates still help search engines surface localised
  // versions if/when per-locale URLs are introduced.
  const hreflangTags: string[] = [];
  if (multiLocale) {
    for (const loc of projectLocales) {
      hreflangTags.push(
        `<link rel="alternate" hreflang="${escapeAttr(
          loc
        )}" href="${escapeAttr(origin + "/")}" />`
      );
    }
    hreflangTags.push(
      `<link rel="alternate" hreflang="x-default" href="${escapeAttr(
        origin + "/"
      )}" />`
    );
  }

  // Open Graph + Twitter Card meta — covers Facebook/LinkedIn previews
  // and Twitter/X cards. Image is the favicon-style logo if present;
  // we don't reference a generated AI image because those filenames are
  // unstable across regenerations.
  const ogImage = seoEntity.logoAbsoluteUrl || `${origin}/images/logo.webp`;
  const ogTags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeAttr(brand)}" />`,
    `<meta property="og:title" content="${escapeAttr(homeTitleForMeta)}" />`,
    `<meta property="og:description" content="${escapeAttr(metaDescription)}" />`,
    `<meta property="og:url" content="${escapeAttr(origin + "/")}" />`,
    `<meta property="og:image" content="${escapeAttr(ogImage)}" />`,
    `<meta property="og:locale" content="${escapeAttr(
      inLanguage.replace("-", "_")
    )}" />`,
  ];
  if (multiLocale) {
    for (const loc of projectLocales) {
      if (loc !== inLanguage) {
        ogTags.push(
          `<meta property="og:locale:alternate" content="${escapeAttr(
            loc.replace("-", "_")
          )}" />`
        );
      }
    }
  }
  const twitterTags = [
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(homeTitleForMeta)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(metaDescription)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />`,
  ];

  const faviconIco = path.join(projectPath, "public", "favicon", "favicon.ico");
  const faviconLinkTags =
    fs.existsSync(faviconIco)
      ? [
          `<link rel="icon" href="/favicon/favicon.ico" sizes="48x48" type="image/x-icon" />`,
          `<link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />`,
          `<link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />`,
          `<link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />`,
          `<link rel="manifest" href="/favicon/site.webmanifest" />`,
        ]
      : [];

  const injection = [
    INJECT_START,
    `<meta name="description" content="${escapeAttr(metaDescription)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${escapeAttr(origin + "/")}" />`,
    ...faviconLinkTags,
    ...hreflangTags,
    ...ogTags,
    ...twitterTags,
    `<script type="application/ld+json" id="sitebuilder-schema-org">${jsonStr}</script>`,
    INJECT_END,
  ].join("\n    ");

  let html = fs.readFileSync(indexHtmlPath, "utf-8");

  if (html.includes(INJECT_START) && html.includes(INJECT_END)) {
    html = html.replace(
      new RegExp(
        `${escapeRegex(INJECT_START)}[\\s\\S]*?${escapeRegex(INJECT_END)}`,
        "m"
      ),
      injection
    );
  } else {
    html = html.replace(/<\/head>/i, `    ${injection}\n  </head>`);
  }

  // <title> из бренда + главная
  if (/<title>[^<]*<\/title>/i.test(html)) {
    html = html.replace(
      /<title>[^<]*<\/title>/i,
      `<title>${escapeXmlText(home?.name ? titleWithBrandLeading(brand, home.name) : brand)}</title>`
    );
  }

  fs.writeFileSync(indexHtmlPath, html, "utf-8");
  console.log(`[build] Обновлёны meta + JSON-LD в index.html`);

  // Emit robots.txt + sitemap.xml so search engines can crawl the site
  // without an extra build step. Both files are placed in `public/` so
  // Vite copies them as-is into the production bundle.
  try {
    writeSeoArtifacts({
      projectPath,
      origin,
      pages:
        pageSummaries.length > 0
          ? pageSummaries
          : [{ path: "/", name: brand, description: metaDescription }],
      locales: projectLocales,
      defaultLocale,
      multiLocale,
    });
    console.log(`[build] Сгенерированы robots.txt и sitemap.xml`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[build] Не удалось сгенерировать SEO-артефакты: ${msg}`);
  }
}

function truncateMeta(s: string, max = 160): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

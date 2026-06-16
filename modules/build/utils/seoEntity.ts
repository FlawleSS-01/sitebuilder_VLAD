import fs from "fs";
import path from "path";
import { normalizeSiteOrigin } from "./jsonLdBuilder.js";

/** SEO Entity Layer — данные для schema.org / head (см. hack.txt). */
export interface SeoEntityConfig {
  brand: string;
  brandSeparated?: string;
  domain: string;
  geo?: string;
  countryCode?: string;
  languages: string[];
  logoPath?: string;
  logoAbsoluteUrl?: string;
  supportEmail?: string;
  phone?: string;
  foundingDate?: string;
  officialProfiles: string[];
  reviewSources: string[];
  homeKeywords: string[];
  brandAliases: string[];
  knowsAbout: string[];
  homeAbout: string[];
  /** Краткое описание бренда для Organization.description */
  organizationDescription?: string;
}

export function separateBrandName(brand: string): string {
  const t = brand.trim();
  if (!t) return "";
  if (/\s/.test(t)) return t;
  return t.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((x) => String(x)));
  }
  if (typeof value === "string") {
    return uniqueStrings(
      value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    );
  }
  return [];
}

const DEFAULT_KNOWS_ABOUT = [
  "Online casino",
  "Sports betting",
  "Slot games",
  "Live casino",
  "Responsible gambling",
  "Mobile casino app",
];

export function defaultKnowsAboutForGeo(geoLabel?: string): string[] {
  const geo = (geoLabel || "").trim();
  const base = [...DEFAULT_KNOWS_ABOUT];
  if (geo) base.unshift(`${geo} online gambling`);
  return uniqueStrings(base).slice(0, 8);
}

export function resolveLogoAbsoluteUrl(
  origin: string,
  projectPath: string,
  logoPath?: string
): string | undefined {
  const rel = (logoPath || "/images/logo.webp").replace(/^\//, "");
  const abs = path.join(projectPath, "public", rel);
  if (!fs.existsSync(abs)) {
    const alt = path.join(projectPath, "public", "images", "logo.webp");
    if (!fs.existsSync(alt)) return undefined;
    return `${origin}/images/logo.webp`;
  }
  return `${origin}/${rel.replace(/\\/g, "/")}`;
}

export interface BuildSeoEntityInput {
  brand: string;
  domain?: string;
  geoLabel?: string;
  country?: string;
  countryCode?: string;
  locales?: string[];
  htmlLang?: string;
  homeDescription?: string;
  projectPath?: string;
  /** Поля из формы / project-settings.seoEntity */
  overrides?: Partial<SeoEntityConfig> & Record<string, unknown>;
}

/**
 * Собирает SeoEntityConfig при создании/обновлении проекта.
 */
export function buildSeoEntityConfig(input: BuildSeoEntityInput): SeoEntityConfig {
  const brand = (input.brand || "Site").trim();
  const domain = (input.domain || "").trim();
  const origin = normalizeSiteOrigin(domain);
  const separated =
    (input.overrides?.brandSeparated as string | undefined)?.trim() ||
    separateBrandName(brand);

  const locales = Array.isArray(input.locales) && input.locales.length
    ? input.locales.map((l) => String(l).trim()).filter(Boolean)
    : [(input.htmlLang || "en").trim()];

  const geoLabel = (input.geoLabel || input.country || "").trim();
  const countryCode =
    (input.overrides?.countryCode as string | undefined)?.trim() ||
    (input.countryCode || "").trim().toUpperCase() ||
    undefined;

  // brandAliases: ручной ввод имеет приоритет (бренд всегда добавляем),
  // иначе авто-набор из бренда + вариаций.
  const manualAliases = parseStringList(input.overrides?.brandAliases);
  const brandAliases =
    manualAliases.length > 0
      ? uniqueStrings([brand, ...manualAliases])
      : uniqueStrings([
          brand,
          separated,
          `${brand} Casino`,
          geoLabel ? `${brand} ${geoLabel}` : "",
        ]);

  const officialProfiles = parseStringList(input.overrides?.officialProfiles);
  const reviewSources = parseStringList(input.overrides?.reviewSources);

  const knowsAbout =
    parseStringList(input.overrides?.knowsAbout).length > 0
      ? parseStringList(input.overrides?.knowsAbout)
      : defaultKnowsAboutForGeo(geoLabel);

  // homeKeywords: ручной ввод приоритетен, иначе авто из бренда + GEO.
  const manualKeywords = parseStringList(input.overrides?.homeKeywords);
  const homeKeywords =
    manualKeywords.length > 0
      ? manualKeywords
      : uniqueStrings([
          brand,
          `${brand} casino`,
          geoLabel ? `online casino ${geoLabel}` : "online casino",
          geoLabel ? `${brand} ${geoLabel}` : "",
          "sports betting",
          "slots",
        ]);

  const homeDesc = (input.homeDescription || "").trim();
  const homeAbout = parseStringList(input.overrides?.homeAbout);
  if (homeAbout.length === 0 && homeDesc) {
    homeAbout.push(homeDesc);
  }
  if (homeAbout.length === 0) {
    homeAbout.push(
      `${brand} — licensed online casino and betting platform${geoLabel ? ` for ${geoLabel}` : ""}.`
    );
  }

  const organizationDescription =
    (input.overrides?.organizationDescription as string | undefined)?.trim() ||
    homeDesc ||
    `${brand} — official online casino and sports betting site${geoLabel ? ` serving ${geoLabel}` : ""}.`;

  const logoPath =
    (input.overrides?.logoPath as string | undefined)?.trim() ||
    "/images/logo.webp";

  const logoAbsoluteUrl = input.projectPath
    ? resolveLogoAbsoluteUrl(origin, input.projectPath, logoPath)
    : logoPath.startsWith("http")
      ? logoPath
      : `${origin}${logoPath.startsWith("/") ? "" : "/"}${logoPath}`;

  // supportEmail авто = support@domain (если домен задан). Ручная правка перекрывает.
  const host = origin.replace(/^https:\/\//, "");
  const hasRealDomain = !!domain && !host.includes("example.com");
  const supportEmail =
    (input.overrides?.supportEmail as string | undefined)?.trim() ||
    (hasRealDomain ? `support@${host}` : undefined);

  return {
    brand,
    brandSeparated: separated || undefined,
    domain: domain || origin.replace(/^https:\/\//, ""),
    geo: geoLabel || undefined,
    countryCode,
    languages: locales,
    logoPath,
    logoAbsoluteUrl,
    supportEmail,
    phone: (input.overrides?.phone as string | undefined)?.trim() || undefined,
    foundingDate:
      (input.overrides?.foundingDate as string | undefined)?.trim() || undefined,
    officialProfiles,
    reviewSources,
    homeKeywords,
    brandAliases,
    knowsAbout,
    homeAbout,
    organizationDescription,
  };
}

/**
 * Читает seoEntity из project-settings + дополняет дефолтами.
 */
export function parseSeoEntityFromSettings(
  settings: Record<string, unknown>,
  projectPath: string,
  homeDescription?: string
): SeoEntityConfig {
  const raw = settings.seoEntity;
  const overrides =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return buildSeoEntityConfig({
    brand: (settings.brand as string) || "Site",
    domain: settings.domain as string | undefined,
    geoLabel: (settings.geoLabel as string) || (settings.country as string),
    country: settings.country as string | undefined,
    countryCode: settings.geoCode as string | undefined,
    locales: Array.isArray(settings.locales)
      ? (settings.locales as string[])
      : undefined,
    htmlLang: settings.htmlLang as string | undefined,
    homeDescription,
    projectPath,
    overrides,
  });
}

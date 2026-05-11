/**
 * GEO presets, locale → prompt language, and helpers for project language config.
 */

export type LanguagePresetSource = "geo" | "user" | "manual";

export interface GeoPresetDefinition {
  geoCode: string;
  geoLabel: string;
  /** Match free-text / codes (uppercase) */
  aliases: string[];
  recommendedPrimary: string;
  recommendedSecondary: string[];
  locales: string[];
  defaultLocale: string;
  /** Default state for "multi language" toggle in UI */
  defaultMultiLanguage: boolean;
  /** Опционально: id кампании шаблона (Keitaro и т.п.), если задан в проекте */
  templateCampaignId?: string | null;
}

/** Full BCP-47 / locale id → string for OpenAI prompts */
export const PROMPT_LANGUAGE_BY_LOCALE: Record<string, string> = {
  en: "English",
  "en-au": "English (Australia)",
  bn: "Bengali",
  ru: "Russian",
  de: "German",
  es: "Spanish",
  "es-ar": "Spanish (Argentina)",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  "pt-br": "Portuguese (Brazil)",
  uk: "Ukrainian",
  hi: "Hindi",
  ur: "Urdu",
  fil: "Filipino",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  th: "Thai",
  km: "Khmer",
};

export const LANGUAGE_OPTIONS_FOR_UI: Array<{
  label: string;
  locale: string;
}> = [
  { label: "English", locale: "en" },
  { label: "English (Australia)", locale: "en-au" },
  { label: "Bengali", locale: "bn" },
  { label: "Indonesian", locale: "id" },
  { label: "Malay", locale: "ms" },
  { label: "Khmer", locale: "km" },
  { label: "Vietnamese", locale: "vi" },
  { label: "French", locale: "fr" },
  { label: "Spanish", locale: "es" },
  { label: "Spanish (Argentina)", locale: "es-ar" },
  { label: "Portuguese", locale: "pt" },
  { label: "Portuguese (Brazil)", locale: "pt-br" },
  { label: "German", locale: "de" },
  { label: "Italian", locale: "it" },
  { label: "Hindi", locale: "hi" },
  { label: "Urdu", locale: "ur" },
  { label: "Filipino", locale: "fil" },
  { label: "Thai", locale: "th" },
  { label: "Russian", locale: "ru" },
  { label: "Ukrainian", locale: "uk" },
];

export const GEO_PRESETS: GeoPresetDefinition[] = [
  {
    geoCode: "BD",
    geoLabel: "Bangladesh",
    aliases: ["BD", "BANGLADESH", "БАНГЛАДЕШ"],
    recommendedPrimary: "English",
    recommendedSecondary: ["Bengali"],
    locales: ["en", "bn"],
    defaultLocale: "en",
    defaultMultiLanguage: true,
  },
  {
    geoCode: "UK",
    geoLabel: "United Kingdom",
    aliases: ["UK", "UNITED KINGDOM", "GB", "ВЕЛИКОБРИТАНИЯ"],
    recommendedPrimary: "English",
    recommendedSecondary: [],
    locales: ["en"],
    defaultLocale: "en",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "MULTI",
    geoLabel: "Multi-GEO",
    aliases: ["MULTI", "МУЛЬТИГЕО", "NO COUNTRY FOCUS"],
    recommendedPrimary: "English",
    recommendedSecondary: [],
    locales: ["en"],
    defaultLocale: "en",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "PK",
    geoLabel: "Pakistan",
    aliases: ["PK", "PAKISTAN", "ПАКИСТАН"],
    recommendedPrimary: "English",
    recommendedSecondary: [],
    locales: ["en"],
    defaultLocale: "en",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "PH",
    geoLabel: "Philippines",
    aliases: ["PH", "PHILIPPINES", "ФИЛИППИНЫ"],
    recommendedPrimary: "English",
    recommendedSecondary: [],
    locales: ["en"],
    defaultLocale: "en",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "BR",
    geoLabel: "Brazil",
    aliases: ["BR", "BRAZIL", "БРАЗИЛИЯ"],
    recommendedPrimary: "Portuguese (Brazil)",
    recommendedSecondary: [],
    locales: ["pt-br"],
    defaultLocale: "pt-br",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "FR",
    geoLabel: "France",
    aliases: ["FR", "FRANCE", "ФРАНЦИЯ"],
    recommendedPrimary: "French",
    recommendedSecondary: [],
    locales: ["fr"],
    defaultLocale: "fr",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "PT",
    geoLabel: "Portugal",
    aliases: ["PT", "PORTUGAL", "ПОРТУГАЛИЯ"],
    recommendedPrimary: "Portuguese",
    recommendedSecondary: [],
    locales: ["pt"],
    defaultLocale: "pt",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "ES",
    geoLabel: "Spain",
    aliases: ["ES", "SPAIN", "ИСПАНИЯ"],
    recommendedPrimary: "Spanish",
    recommendedSecondary: [],
    locales: ["es"],
    defaultLocale: "es",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "PRILKI",
    geoLabel: "Prilki Multi-GEO",
    aliases: ["PRILKI", "PRIL", "ПРИЛКИ МУЛЬТИГЕО", "ПРИЛКИ"],
    recommendedPrimary: "English",
    recommendedSecondary: [],
    locales: ["en"],
    defaultLocale: "en",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "VN",
    geoLabel: "Vietnam",
    aliases: ["VN", "VIETNAM", "ВЬЕТНАМ"],
    recommendedPrimary: "Vietnamese",
    recommendedSecondary: [],
    locales: ["vi"],
    defaultLocale: "vi",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "KEN",
    geoLabel: "Kenya",
    aliases: ["KEN", "KENYA", "КЕНИЯ"],
    recommendedPrimary: "English",
    recommendedSecondary: [],
    locales: ["en"],
    defaultLocale: "en",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "ARG",
    geoLabel: "Argentina",
    aliases: ["ARG", "ARGENTINA", "АРГЕНТИНА"],
    recommendedPrimary: "Spanish (Argentina)",
    recommendedSecondary: [],
    locales: ["es-ar"],
    defaultLocale: "es-ar",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "NIG",
    geoLabel: "Nigeria",
    aliases: ["NIG", "NIGERIA", "НИГЕРИЯ"],
    recommendedPrimary: "English",
    recommendedSecondary: [],
    locales: ["en"],
    defaultLocale: "en",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "INDON",
    geoLabel: "Indonesia",
    aliases: ["INDON", "INDONESIA", "ИНДОНЕЗИЯ", "ID"],
    recommendedPrimary: "Indonesian",
    recommendedSecondary: ["English"],
    locales: ["id", "en"],
    defaultLocale: "id",
    defaultMultiLanguage: true,
  },
  {
    geoCode: "MALA",
    geoLabel: "Malaysia",
    aliases: ["MALA", "MALAYSIA", "МАЛАЙЗИЯ"],
    recommendedPrimary: "Malay",
    recommendedSecondary: ["English"],
    locales: ["ms", "en"],
    defaultLocale: "ms",
    defaultMultiLanguage: true,
  },
  {
    geoCode: "KAM",
    geoLabel: "Cambodia",
    aliases: ["KAM", "CAMBODIA", "КАМБОДЖА"],
    recommendedPrimary: "Khmer",
    recommendedSecondary: ["English"],
    locales: ["km", "en"],
    defaultLocale: "km",
    defaultMultiLanguage: true,
  },
  {
    geoCode: "AUS",
    geoLabel: "Australia",
    aliases: ["AUS", "AUSTRALIA", "AU"],
    recommendedPrimary: "English (Australia)",
    recommendedSecondary: [],
    locales: ["en-au"],
    defaultLocale: "en-au",
    defaultMultiLanguage: false,
  },
  {
    geoCode: "IN",
    geoLabel: "India",
    aliases: ["IN", "INDIA", "ИНДИЯ"],
    recommendedPrimary: "English",
    recommendedSecondary: [],
    locales: ["en"],
    defaultLocale: "en",
    defaultMultiLanguage: false,
  },
];

function norm(s: string): string {
  return s.trim().toUpperCase();
}

export function findGeoByCode(code: string): GeoPresetDefinition | null {
  const c = norm(code || "");
  return GEO_PRESETS.find((g) => g.geoCode === c) || null;
}

export function matchGeoFromCountryInput(input: string): GeoPresetDefinition | null {
  const c = norm(input || "");
  if (!c || c === "NO COUNTRY") return null;
  const byCode = findGeoByCode(c);
  if (byCode) return byCode;
  for (const g of GEO_PRESETS) {
    if (g.aliases.some((a) => norm(a) === c)) return g;
  }
  for (const g of GEO_PRESETS) {
    if (norm(g.geoLabel) === c) return g;
  }
  for (const g of GEO_PRESETS) {
    const gl = norm(g.geoLabel);
    if (c.includes(gl) || gl.includes(c)) return g;
  }
  return null;
}

export function getGeoPresetsForApi(): Array<{
  geoCode: string;
  geoLabel: string;
  recommendedPrimary: string;
  recommendedSecondary: string[];
  locales: string[];
  defaultLocale: string;
  defaultMultiLanguage: boolean;
  languageCount: number;
  templateCampaignId: string | null;
}> {
  return GEO_PRESETS.map((g) => ({
    geoCode: g.geoCode,
    geoLabel: g.geoLabel,
    recommendedPrimary: g.recommendedPrimary,
    recommendedSecondary: [...g.recommendedSecondary],
    locales: [...g.locales],
    defaultLocale: g.defaultLocale,
    defaultMultiLanguage: g.defaultMultiLanguage,
    languageCount: g.locales.length,
    templateCampaignId: g.templateCampaignId ?? null,
  }));
}

export function promptLanguageForLocale(locale: string): string {
  const L = (locale || "en").toLowerCase().replace(/_/g, "-");
  if (PROMPT_LANGUAGE_BY_LOCALE[L]) return PROMPT_LANGUAGE_BY_LOCALE[L];
  const base = L.split(/[-/]/)[0];
  if (PROMPT_LANGUAGE_BY_LOCALE[base]) return PROMPT_LANGUAGE_BY_LOCALE[base];
  return locale;
}

export interface ProjectLocalePreset {
  primaryLanguage: string;
  secondaryLanguages: string[];
  locales: string[];
  defaultLocale: string;
}

/**
 * Legacy: resolve from country string when client does not send explicit locales.
 */
export function getLocalePresetForCountry(
  country: string,
  opts: {
    primaryLanguageHint?: string;
    htmlLangHint?: string;
  } = {}
): ProjectLocalePreset {
  const matched = matchGeoFromCountryInput(country);
  if (matched) {
    return {
      primaryLanguage: matched.recommendedPrimary,
      secondaryLanguages: [...matched.recommendedSecondary],
      locales: [...matched.locales],
      defaultLocale: matched.defaultLocale,
    };
  }
  const c = norm(country || "");
  if (c === "NO COUNTRY" || c === "") {
    const code =
      (opts.htmlLangHint || "en").toLowerCase().split(/[-_]/)[0] || "en";
    const primary =
      opts.primaryLanguageHint || promptLanguageForLocale(code);
    return {
      primaryLanguage: primary,
      secondaryLanguages: [],
      locales: [code],
      defaultLocale: code,
    };
  }
  const code =
    (opts.htmlLangHint || "en").toLowerCase().split(/[-_]/)[0] || "en";
  const primary =
    opts.primaryLanguageHint || promptLanguageForLocale(code);
  return {
    primaryLanguage: primary,
    secondaryLanguages: [],
    locales: [code],
    defaultLocale: code,
  };
}

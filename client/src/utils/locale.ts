/** Locale id → language name for OpenAI prompts (full BCP-47 first). */
const PROMPT_LANGUAGE_FULL: Record<string, string> = {
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

export function promptLanguageForLocale(locale: string): string {
  const L = (locale || "en").toLowerCase().replace(/_/g, "-");
  if (PROMPT_LANGUAGE_FULL[L]) return PROMPT_LANGUAGE_FULL[L];
  const base = L.split(/[-/]/)[0];
  if (PROMPT_LANGUAGE_FULL[base]) return PROMPT_LANGUAGE_FULL[base];
  return locale;
}

export function formatTextGenError(data: any): string {
  const parts = [
    data?.error,
    data?.message,
    data?.code && `code: ${data.code}`,
    data?.type && `type: ${data.type}`,
    data?.status != null && `http: ${data.status}`,
    data?.requestId && `request_id: ${data.requestId}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" — ") : "Unknown error";
}

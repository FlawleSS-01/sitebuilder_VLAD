import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, SITE_LOCALES } from "../data/siteConfig.js";

export type LocaleContextValue = {
  locale: string;
  setLocale: (code: string) => void;
  locales: readonly string[];
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "sitebuilder-locale";

function normalize(code: string): string {
  return String(code || "")
    .toLowerCase()
    .replace(/_/g, "-");
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(() => {
    const allowed = new Set(SITE_LOCALES.map(normalize));
    const fallback = normalize(DEFAULT_LOCALE);
    if (typeof window === "undefined") return allowed.has(fallback) ? fallback : SITE_LOCALES[0];
    const stored = normalize(localStorage.getItem(STORAGE_KEY) || "");
    if (stored && allowed.has(stored)) return stored;
    return allowed.has(fallback) ? fallback : SITE_LOCALES[0];
  });

  const setLocale = useCallback((code: string) => {
    const next = normalize(code);
    const allowed = new Set(SITE_LOCALES.map(normalize));
    const resolved = allowed.has(next) ? next : normalize(DEFAULT_LOCALE);
    setLocaleState(resolved);
    try {
      localStorage.setItem(STORAGE_KEY, resolved);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = resolved;
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      locales: SITE_LOCALES,
    }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}

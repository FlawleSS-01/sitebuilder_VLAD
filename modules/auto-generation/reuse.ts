import fs from "fs";
import path from "path";
import {
  getProjectPath,
  getProjectSettings,
} from "../build/utils/projectManager.js";

type PageInfo = {
  generated?: boolean;
  filePath?: string;
  localeFiles?: Record<string, string>;
  generatedLocales?: Record<string, boolean>;
  imagesGenerated?: boolean;
  images?: Array<{ name?: string; url?: string; placeholder?: boolean }>;
};

export function getPageInfo(
  projectName: string,
  pageType: string
): PageInfo | undefined {
  const settings = getProjectSettings(projectName);
  const raw = settings?.pages?.[pageType];
  if (!raw || typeof raw !== "object") return undefined;
  return raw as PageInfo;
}

export function pageJsonExists(
  projectName: string,
  pageType: string,
  locale: string
): boolean {
  const projectPath = getProjectPath(projectName);
  const info = getPageInfo(projectName, pageType);
  if (!info) return false;

  const rel =
    info.localeFiles?.[locale] ||
    info.filePath ||
    (info.localeFiles && Object.values(info.localeFiles)[0]);
  if (rel) {
    const abs = path.join(projectPath, rel);
    if (fs.existsSync(abs)) {
      try {
        const json = JSON.parse(fs.readFileSync(abs, "utf-8")) as Record<
          string,
          unknown
        >;
        return (
          Boolean(String(json.title || "").trim()) &&
          Boolean(String(json.h1 || "").trim())
        );
      } catch {
        return false;
      }
    }
  }

  const fallback = path.join(projectPath, "src", "pages", `${pageType}.json`);
  if (!fs.existsSync(fallback)) return false;
  try {
    const json = JSON.parse(fs.readFileSync(fallback, "utf-8")) as Record<
      string,
      unknown
    >;
    return (
      Boolean(String(json.title || "").trim()) &&
      Boolean(String(json.h1 || "").trim())
    );
  } catch {
    return false;
  }
}

export function shouldSkipPageText(
  projectName: string,
  pageType: string,
  locale: string
): boolean {
  const info = getPageInfo(projectName, pageType);
  if (!info?.generated) return false;
  if (info.generatedLocales?.[locale]) return true;
  return pageJsonExists(projectName, pageType, locale);
}

export function shouldSkipPageImages(
  projectName: string,
  pageType: string,
  minCount: number
): boolean {
  const info = getPageInfo(projectName, pageType);
  if (!info?.imagesGenerated || !Array.isArray(info.images)) return false;
  const real = info.images.filter(
    (img) => img?.name && !img.placeholder
  );
  return real.length >= minCount;
}

export function shouldSkipFavicon(projectName: string): boolean {
  const projectPath = getProjectPath(projectName);
  const fav = path.join(projectPath, "public", "favicon.ico");
  const webp = path.join(projectPath, "public", "images", "favicon.webp");
  return fs.existsSync(fav) || fs.existsSync(webp);
}

export function shouldSkipFaq(projectName: string): boolean {
  const projectPath = getProjectPath(projectName);
  const faqPath = path.join(projectPath, "src", "pages", "faq.json");
  if (!fs.existsSync(faqPath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(faqPath, "utf-8")) as {
      faq?: { items?: unknown[] };
      items?: unknown[];
    };
    const items = data.faq?.items ?? data.items;
    return Array.isArray(items) && items.length > 0;
  } catch {
    return false;
  }
}

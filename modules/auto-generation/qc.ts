import fs from "fs";
import path from "path";
import { getProjectPath, getProjectSettings } from "../build/utils/projectManager.js";
import { REQUIRED_PAGE_TYPES } from "./randomizer.js";
import { AUTO_ERRORS } from "./errors.js";

export interface QcResult {
  ok: boolean;
  message?: string;
}

function readPageJson(projectPath: string, relPath: string): Record<string, unknown> | null {
  const abs = path.join(projectPath, relPath);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function runQualityCheck(input: {
  projectName: string;
  requireUpload?: boolean;
  requireBuild?: boolean;
  requireArchive?: boolean;
}): QcResult {
  const settings = getProjectSettings(input.projectName);
  if (!settings) {
    return { ok: false, message: AUTO_ERRORS.projectNotFound };
  }

  if (!settings.domain?.trim()) {
    return { ok: false, message: AUTO_ERRORS.missingDomain };
  }
  if (!settings.affiliateLink?.trim()) {
    return { ok: false, message: AUTO_ERRORS.missingAffiliate };
  }

  const projectPath = getProjectPath(input.projectName);
  const pages = settings.pages || {};

  for (const pageType of REQUIRED_PAGE_TYPES) {
    const info = pages[pageType] as {
      generated?: boolean;
      blocks?: string[];
      filePath?: string;
    } | undefined;
    if (!info?.generated) {
      return {
        ok: false,
        message: `Не создана обязательная страница: ${pageType}.`,
      };
    }
    const blocks = info.blocks;
    if (!blocks || blocks.length < 3) {
      return {
        ok: false,
        message: `На странице «${pageType}» меньше 3 блоков.`,
      };
    }
    const rel = info.filePath;
    if (!rel) {
      return {
        ok: false,
        message: `Нет JSON файла для страницы «${pageType}».`,
      };
    }
    const json = readPageJson(projectPath, rel);
    if (!json) {
      return {
        ok: false,
        message: `Не удалось прочитать JSON страницы «${pageType}».`,
      };
    }
    if (!String(json.title || "").trim()) {
      return { ok: false, message: `Пустой Title на странице «${pageType}».` };
    }
    if (!String(json.description || "").trim()) {
      return {
        ok: false,
        message: `Пустой Description на странице «${pageType}».`,
      };
    }
    if (!String(json.h1 || "").trim()) {
      return { ok: false, message: `Пустой H1 на странице «${pageType}».` };
    }
  }

  const faviconIco = path.join(projectPath, "public", "favicon", "favicon.ico");
  if (!fs.existsSync(faviconIco)) {
    return { ok: false, message: "Favicon не создан." };
  }

  for (const [pageType, info] of Object.entries(pages)) {
    const pageInfo = info as { generated?: boolean; images?: unknown[] };
    if (!pageInfo?.generated) continue;
    const images = pageInfo.images;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return {
        ok: false,
        message: `Нет изображений для страницы «${pageType}».`,
      };
    }
  }

  if (settings.app?.hasApp && !settings.app?.link && !settings.app?.fileName) {
    return { ok: false, message: "APK указан, но ссылка на приложение не настроена." };
  }

  const distIndex = path.join(projectPath, "dist", "index.html");
  if (input.requireBuild && !fs.existsSync(distIndex)) {
    return { ok: false, message: "Build не собран (нет dist/index.html)." };
  }

  const ag = (settings as Record<string, unknown>).autoGeneration as
    | { archivePath?: string }
    | undefined;
  if (input.requireArchive && ag?.archivePath && !fs.existsSync(ag.archivePath)) {
    return { ok: false, message: "Archive не найден после сборки." };
  }

  if (input.requireUpload && !settings.serverUpload?.host) {
    return { ok: false, message: "Сайт не загружен на сервер (нет serverUpload)." };
  }

  return { ok: true };
}

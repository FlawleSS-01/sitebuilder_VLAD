import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");

/** Каталог с рекламными баннерами брендов: docs/<brand>/{728x90.*, 160x600.*}. */
const BANNERS_SOURCE_DIR = path.join(APP_ROOT, "docs");

/** Куда в проекте кладём выбранные баннеры (public → корень dist). */
const PROJECT_BANNER_SUBDIR = path.join("public", "banners");

const IMG_EXT = ["gif", "png", "webp", "jpg", "jpeg"];

/** Горизонтальный баннер (leaderboard) — файл вида 728x90.<ext>. */
const HORIZONTAL_BASENAME = "728x90";
/** Вертикальный баннер (skyscraper) — файл вида 160x600.<ext>. */
const VERTICAL_BASENAME = "160x600";

export interface BannerBrandFiles {
  /** Абсолютный путь к горизонтальному креативу (728x90). */
  horizontal: string;
  /** Абсолютный путь к вертикальному креативу (160x600). */
  vertical: string;
}

export interface AppliedBanners {
  /** Горизонтальный баннер (сверху hero). */
  topSrc: string;
  topAlt: string;
  /** Вертикальный баннер (сбоку hero). */
  sideSrc: string;
  sideAlt: string;
}

/** Ищет файл `<basename>.<ext>` в папке бренда, отдаёт первый по приоритету расширений. */
function findByBasename(brandDir: string, basename: string): string | null {
  for (const ext of IMG_EXT) {
    const candidate = path.join(brandDir, `${basename}.${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Файлы баннеров конкретного бренда (или null, если пары нет). */
export function getBrandBannerFiles(brand: string): BannerBrandFiles | null {
  const brandDir = path.join(BANNERS_SOURCE_DIR, brand);
  if (!fs.existsSync(brandDir) || !fs.statSync(brandDir).isDirectory()) {
    return null;
  }
  const horizontal = findByBasename(brandDir, HORIZONTAL_BASENAME);
  const vertical = findByBasename(brandDir, VERTICAL_BASENAME);
  if (!horizontal || !vertical) {
    return null;
  }
  return { horizontal, vertical };
}

/**
 * Список брендов с полным набором баннеров (есть и горизонтальный, и
 * вертикальный креатив). Сканирует подпапки docs/.
 */
export function getAvailableBannerBrands(): string[] {
  if (!fs.existsSync(BANNERS_SOURCE_DIR)) {
    return [];
  }
  const brands: string[] = [];
  for (const entry of fs.readdirSync(BANNERS_SOURCE_DIR, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    if (getBrandBannerFiles(entry.name)) {
      brands.push(entry.name);
    }
  }
  return brands.sort();
}

/** Удаляет ранее скопированные баннеры проекта (режим «без баннеров»). */
export function clearProjectBanners(projectPath: string): void {
  const dir = path.join(projectPath, PROJECT_BANNER_SUBDIR);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Копирует выбранную пару баннеров в проект и возвращает данные для .env /
 * рендера. Горизонтальный и вертикальный креативы берутся из РАЗНЫХ брендов
 * (папок), пара всегда «горизонтальный + вертикальный».
 */
export function applyBannersToProject(
  projectPath: string,
  pair: { horizontalBrand: string; verticalBrand: string }
): AppliedBanners {
  const hFiles = getBrandBannerFiles(pair.horizontalBrand);
  const vFiles = getBrandBannerFiles(pair.verticalBrand);
  if (!hFiles || !vFiles) {
    throw new Error(
      `Баннеры не найдены: ${pair.horizontalBrand}/${pair.verticalBrand}`
    );
  }

  const destDir = path.join(projectPath, PROJECT_BANNER_SUBDIR);
  // Пересобираем папку начисто — на случай смены пары при повторной генерации.
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  const topExt = path.extname(hFiles.horizontal) || ".gif";
  const sideExt = path.extname(vFiles.vertical) || ".gif";
  const topName = `top${topExt}`;
  const sideName = `side${sideExt}`;

  fs.copyFileSync(hFiles.horizontal, path.join(destDir, topName));
  fs.copyFileSync(vFiles.vertical, path.join(destDir, sideName));

  return {
    topSrc: `/banners/${topName}`,
    topAlt: pair.horizontalBrand.toUpperCase(),
    sideSrc: `/banners/${sideName}`,
    sideAlt: pair.verticalBrand.toUpperCase(),
  };
}

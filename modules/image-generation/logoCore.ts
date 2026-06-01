import path from "path";
import fs from "fs";
import sharp from "sharp";
import { generateAndSaveImage } from "./index.js";
import { ensureRunwareInitialized } from "./runwareSetup.js";
import { shouldUseRunware } from "./imageProvider.js";
import { writePlaceholderLogoWebp } from "./utils/placeholderImage.js";
import { generateFavicons } from "../build/utils/faviconGenerator.js";
import { syncIndexHtmlHead } from "../build/utils/indexHtmlSync.js";
import { getProjectPath } from "../build/utils/projectManager.js";

async function ensureFaviconFromLogoFile(
  projectPath: string,
  logoAbsolutePath: string,
  manifestName: string
): Promise<void> {
  await generateFavicons(projectPath, logoAbsolutePath, manifestName);
  try {
    syncIndexHtmlHead(projectPath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[logoCore] syncIndexHtmlHead после favicon:", msg);
  }
}

/** Generates logo.webp + favicon pack for a project (no HTTP). */
export async function generateLogoAndFaviconForProject(
  projectName: string
): Promise<{ placeholder: boolean }> {
  const projectPath = getProjectPath(projectName);
  const settingsPath = path.join(projectPath, "project-settings.json");

  if (!fs.existsSync(settingsPath)) {
    throw new Error("Project settings not found");
  }

  let brand = "Casino";
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const b = (settings.brand || "").trim();
    if (b) brand = b;
  } catch {
    /* use default */
  }

  const logoWebp = path.join(projectPath, "public", "images", "logo.webp");
  const manifestName =
    brand.replace(/[\r\n\x00-\x1f]/g, " ").trim().slice(0, 128) || "Casino";

  if (!shouldUseRunware()) {
    await writePlaceholderLogoWebp(projectPath, brand);
    await ensureFaviconFromLogoFile(projectPath, logoWebp, manifestName);
    return { placeholder: true };
  }

  if (!process.env.RUNWARE_API_KEY) {
    throw new Error("Runware API key is not configured");
  }

  ensureRunwareInitialized();

  const brandForPrompt =
    brand.replace(/[\r\n\x00-\x1f]/g, " ").trim().slice(0, 64) || "Casino";

  const prompt = `Horizontal casino wordmark logo banner. The ONLY readable text in the image must spell exactly: "${brandForPrompt}". Use one line of bold display typography — saturated color gradient on the letters (gold, electric blue, magenta neon, emerald accents), soft chromatic glow, subtle 3D bevel, luxury iGaming aesthetic, razor-sharp edges, centered, generous margins, dark navy-to-black background, high contrast, professional branding asset for website header. Do not add any other words, slogans, URLs, or symbols except those letters that form the brand name "${brandForPrompt}".`;

  const logoNegativePrompt =
    "watermark, stock watermark, QR code, illegible text, gibberish letters, misspelled words, wrong typography, extra random words, long slogan, tagline, subtitle, second line of marketing copy, duplicate overlapping text, cropped incomplete letters, busy cluttered background, low resolution, blurry, jpeg artifacts, deformed letters, mascot character, cartoon animal, photograph, realistic human face, clipart emblem with no readable brand text";

  const imagesDir = path.join(projectPath, "public", "images");
  fs.mkdirSync(imagesDir, { recursive: true });
  const tempPng = path.join(imagesDir, `logo-gen-${Date.now()}.png`);

  await generateAndSaveImage(
    prompt,
    "1536x512",
    tempPng,
    undefined,
    logoNegativePrompt
  );

  await sharp(tempPng).webp({ quality: 90 }).toFile(logoWebp);
  try {
    fs.unlinkSync(tempPng);
  } catch {
    /* ignore */
  }

  await ensureFaviconFromLogoFile(projectPath, logoWebp, manifestName);
  return { placeholder: false };
}

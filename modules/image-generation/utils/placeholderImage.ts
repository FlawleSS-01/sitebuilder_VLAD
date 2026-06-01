import fs from "fs";
import path from "path";
import sharp from "sharp";

const hues = [210, 265, 145, 30, 330, 180];

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return hues[Math.abs(h) % hues.length];
}

/**
 * Простая WebP-заглушка для страницы (без Runware).
 */
export async function writePlaceholderWebp(
  outPath: string,
  opts: { label: string; brand?: string; index: number }
): Promise<void> {
  const w = 1024;
  const h = 704;
  const hue = (hashHue(opts.label) + opts.index * 37) % 360;
  const c1 = `hsl(${hue}, 45%, 22%)`;
  const c2 = `hsl(${(hue + 40) % 360}, 50%, 35%)`;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1}"/>
      <stop offset="100%" style="stop-color:${c2}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="42%" text-anchor="middle" fill="rgba(255,255,255,0.92)" font-family="system-ui,Segoe UI,sans-serif" font-size="36" font-weight="600">${escapeXml(
    opts.brand || "Brand"
  )}</text>
  <text x="50%" y="54%" text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="system-ui,Segoe UI,sans-serif" font-size="22">${escapeXml(
    opts.label
  )} · placeholder</text>
  <text x="50%" y="64%" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="system-ui,Segoe UI,sans-serif" font-size="14">IMAGE_PROVIDER=placeholder</text>
</svg>`;

  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(outPath);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .slice(0, 80);
}

export async function writePlaceholderLogoWebp(
  projectPath: string,
  brand: string
): Promise<string> {
  const imagesDir = path.join(projectPath, "public", "images");
  fs.mkdirSync(imagesDir, { recursive: true });
  const outPath = path.join(imagesDir, "logo.webp");
  const w = 512;
  const h = 160;
  const hue = hashHue(brand || "logo");
  const g1 = `hsl(${hue}, 95%, 62%)`;
  const g2 = `hsl(${(hue + 42) % 360}, 92%, 58%)`;
  const g3 = `hsl(${(hue + 88) % 360}, 88%, 55%)`;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="brandWordmark" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${g1}"/>
      <stop offset="50%" style="stop-color:${g2}"/>
      <stop offset="100%" style="stop-color:${g3}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="12" fill="#1a1a2e"/>
  <text x="50%" y="58%" text-anchor="middle" fill="url(#brandWordmark)" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${escapeXml(
    brand || "Logo"
  )}</text>
</svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(outPath);
  return outPath;
}

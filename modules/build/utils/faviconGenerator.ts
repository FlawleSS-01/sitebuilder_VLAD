import path from "path";
import fs from "fs";
import sharp from "sharp";

interface FaviconSizes {
  name: string;
  size: number;
  format: "png" | "ico";
}

const FAVICON_SIZES: FaviconSizes[] = [
  { name: "android-chrome-192x192.png", size: 192, format: "png" },
  { name: "android-chrome-512x512.png", size: 512, format: "png" },
  { name: "apple-touch-icon.png", size: 180, format: "png" },
  { name: "favicon-16x16.png", size: 16, format: "png" },
  { name: "favicon-32x32.png", size: 32, format: "png" },
  { name: "favicon.ico", size: 48, format: "ico" },
];

/**
 * Генерирует все favicon файлы из исходного изображения
 */
export const generateFavicons = async (
  projectPath: string,
  sourceImagePath: string,
  brand: string
): Promise<void> => {
  const publicDir = path.join(projectPath, "public");
  const faviconDir = path.join(publicDir, "favicon");

  // Создаем директорию favicon если её нет
  fs.mkdirSync(faviconDir, { recursive: true });

  // Читаем исходное изображение
  const sourceBuffer = fs.readFileSync(sourceImagePath);
  const sourceImage = sharp(sourceBuffer);

  // Генерируем все размеры favicon
  for (const faviconSize of FAVICON_SIZES) {
    const outputPath = path.join(faviconDir, faviconSize.name);

    try {
      // Для всех форматов используем PNG, включая .ico
      // Современные браузеры принимают PNG с расширением .ico
      await sourceImage
        .clone()
        .resize(faviconSize.size, faviconSize.size, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toFile(outputPath);

      console.log(
        `[build] Сгенерирован favicon: ${faviconSize.name} (${faviconSize.size}x${faviconSize.size})`
      );
    } catch (error: any) {
      console.error(
        `[build] Ошибка при генерации ${faviconSize.name}:`,
        error.message
      );
      throw error;
    }
  }

  // Создаем site.webmanifest
  const manifestPath = path.join(faviconDir, "site.webmanifest");
  const manifest = {
    name: brand,
    short_name: brand,
    icons: [
      {
        src: "/favicon/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/favicon/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/favicon/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        src: "/favicon/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/favicon/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  console.log(`[build] Создан site.webmanifest`);
};

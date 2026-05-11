import fs from "fs";
import path from "path";

interface ImageInfo {
  alt?: string;
  title?: string;
  src: string;
}

/**
 * Получает имя изображения без расширения для использования как ключ
 */
const getImageKey = (imageName: string): string => {
  return imageName.replace(/\.webp$/, "");
};

/**
 * Получает путь к images.json в проекте
 */
const getImagesJsonPath = (projectPath: string): string => {
  return path.join(projectPath, "src", "pages", "images.json");
};

/**
 * Читает images.json из проекта
 */
export const readImagesJson = (projectPath: string): Record<string, ImageInfo> => {
  const imagesJsonPath = getImagesJsonPath(projectPath);
  
  if (!fs.existsSync(imagesJsonPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(imagesJsonPath, "utf-8");
    if (!content.trim()) {
      return {};
    }
    return JSON.parse(content);
  } catch (error) {
    console.warn(
      `[image-generation] Не удалось прочитать images.json:`,
      error
    );
    return {};
  }
};

/**
 * Записывает images.json в проект
 */
export const writeImagesJson = (
  projectPath: string,
  images: Record<string, ImageInfo>
): void => {
  const imagesJsonPath = getImagesJsonPath(projectPath);
  const pagesDir = path.dirname(imagesJsonPath);

  // Создаем директорию если её нет
  fs.mkdirSync(pagesDir, { recursive: true });

  // Записываем файл
  fs.writeFileSync(
    imagesJsonPath,
    JSON.stringify(images, null, 2),
    "utf-8"
  );

  console.log(`[image-generation] Обновлен images.json`);
};

/**
 * Обновляет информацию об изображении в images.json
 */
export const updateImageInJson = (
  projectPath: string,
  imageName: string,
  imageInfo: {
    alt?: string;
    title?: string;
    src: string;
  }
): void => {
  const images = readImagesJson(projectPath);
  const key = getImageKey(imageName);
  
  images[key] = {
    alt: imageInfo.alt || "",
    title: imageInfo.title || "",
    src: imageInfo.src,
  };

  writeImagesJson(projectPath, images);
};

/**
 * Удаляет изображение из images.json
 */
export const removeImageFromJson = (
  projectPath: string,
  imageName: string
): void => {
  const images = readImagesJson(projectPath);
  const key = getImageKey(imageName);
  
  delete images[key];

  writeImagesJson(projectPath, images);
};

/**
 * Обновляет alt/title для изображения в images.json
 */
export const updateImageAltTitle = (
  projectPath: string,
  imageName: string,
  alt?: string,
  title?: string
): void => {
  const images = readImagesJson(projectPath);
  const key = getImageKey(imageName);
  
  if (images[key]) {
    if (alt !== undefined) {
      images[key].alt = alt;
    }
    if (title !== undefined) {
      images[key].title = title;
    }
    writeImagesJson(projectPath, images);
  }
};


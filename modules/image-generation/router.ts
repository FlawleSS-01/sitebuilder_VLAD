import { Router } from "express";
import {
  generateImage,
  generatePageImages,
  generateAllProjectImages,
  generateSingleImage,
  uploadImage,
  uploadLogo,
  generateLogo,
} from "./controller.js";
import multer from "multer";

const router = Router();

// Настройка multer для загрузки файлов
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Генерация изображений
router.post("/generate", generateImage);

// Генерация изображений для страницы (3 картинки)
router.post("/generate-page-images", generatePageImages);

// Массовая генерация для всех страниц проекта (по наличию JSON / флагам в settings)
router.post("/generate-all-project-images", generateAllProjectImages);

// Генерация одной картинки (перегенерация)
router.post("/generate-single-image", generateSingleImage);

// Загрузка своей картинки
router.post("/upload-image", upload.single("image"), uploadImage);

// Генерация логотипа (Runware → logo.webp)
router.post("/generate-logo", generateLogo);

// Загрузка логотипа
router.post("/upload-logo", upload.single("logo"), uploadLogo);

// Перегенерация alt/title для изображения
router.post("/regenerate-alt-title", async (req, res) => {
  try {
    const { generateAltTitle } = await import("./utils/altTitleGenerator.js");
    const { updateImageAltTitle } = await import("./utils/imagesJsonManager.js");
    const path = await import("path");
    const { projectName, pageType, imagePrompt, language, country, brand, imageName } = req.body;

    if (!projectName || !pageType || !imagePrompt || !language || !country || !brand || !imageName) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    const result = await generateAltTitle(imagePrompt, language, country, brand, pageType);

    if (!result) {
      return res.status(500).json({
        error: "Failed to generate alt/title",
      });
    }

    // Обновляем images.json
    const projectPath = path.join(process.cwd(), "projects", projectName);
    updateImageAltTitle(projectPath, imageName, result.alt, result.title);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[image-generation] Ошибка при перегенерации alt/title:", error);
    res.status(500).json({
      error: "Failed to regenerate alt/title",
      message: error.message,
    });
  }
});

export default router;


import { Router } from "express";
import { generateText, generateCustomPage, generateFAQ, generateSingleBlock } from "./controller.js";

const router = Router();

// Генерация текстов для страниц
router.post("/generate", generateText);

// Генерация кастомной страницы
router.post("/generate-custom", generateCustomPage);

// Генерация FAQ
router.post("/generate-faq", generateFAQ);

// Генерация одного блока
router.post("/generate-single-block", generateSingleBlock);

export default router;

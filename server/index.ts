import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env файл
const envPath = path.join(__dirname, "..", ".env");
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  console.warn("⚠️  Не удалось загрузить .env файл:", envPath);
  console.warn("⚠️  Ошибка:", result.error.message);
} else {
  console.log("✓ .env файл загружен из:", envPath);
  
  // Проверяем наличие ключевых переменных
  if (process.env.OPENAI_API_KEY) {
    const keyPreview = process.env.OPENAI_API_KEY.length > 10
      ? `${process.env.OPENAI_API_KEY.substring(0, 7)}...${process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4)}`
      : "***";
    console.log(`✓ OPENAI_API_KEY загружен: ${keyPreview}, длина: ${process.env.OPENAI_API_KEY.length}`);
  } else {
    console.warn("⚠️  OPENAI_API_KEY не найден в переменных окружения!");
  }
}

// Импортируем роутеры модулей
import textGenerationRouter from "../modules/text-generation/router.js";
import imageGenerationRouter from "../modules/image-generation/router.js";
import buildRouter from "../modules/build/router.js";
import buildDownloadArtifactRouter from "../modules/build/downloadArtifactRoutes.js";
import previewRouter from "../modules/preview/router.js";

const app = express();
const PORT = process.env.PORT || 3001;

// CORS настройки
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

// Логирование запросов (исключаем статус-запросы и health check)
app.use((req, res, next) => {
  // Не логируем частые статус-запросы и health check
  if (!req.path.includes("/api/preview/status") && req.path !== "/api/health") {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Создаем папку projects если её нет
const projectsDir = path.join(__dirname, "../projects");
if (!fs.existsSync(projectsDir)) {
  fs.mkdirSync(projectsDir, { recursive: true });
  console.log("✓ Создана папка projects");
}

// Подключаем роутеры модулей
app.use("/api/text-generation", textGenerationRouter);
app.use("/api/image-generation", imageGenerationRouter);
// Скачивание APK: отдельный роутер первым, чтобы путь всегда был зарегистрирован
app.use("/api/build", buildDownloadArtifactRouter);
app.use("/api/build", buildRouter);
app.use("/api/preview", previewRouter);

// Раздача статических файлов из projects (для сгенерированных изображений)
const projectsPath = path.join(__dirname, "../projects");
app.use("/projects", express.static(projectsPath));

// Раздача статических файлов из client/dist (Vite)
const buildPath = path.join(__dirname, "../client/dist");
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
}

// Для всех остальных маршрутов возвращаем index.html (SPA)
app.get("*", (req, res, next) => {
  // Пропускаем API запросы
  if (req.path.startsWith("/api/") || req.path.startsWith("/projects/")) {
    return next();
  }
  
  const indexHtmlPath = path.join(buildPath, "index.html");
  if (fs.existsSync(indexHtmlPath)) {
    res.sendFile(indexHtmlPath);
  } else {
    res.status(404).json({
      error: "Frontend not found",
      message: "Выполните сборку фронтенда: cd client && npm run build",
    });
  }
});

// Обработка ошибок
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Ошибка:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    path: req.path,
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

server.timeout = 300000; // 5 минут
server.keepAliveTimeout = 300000;


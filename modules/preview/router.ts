import { Router } from "express";
import {
  startPreview,
  stopPreview,
  getPreviewInfo,
  isPreviewRunning,
  isProjectRunning,
  checkDependencies,
  installDependencies,
  getNpmInstallStatus,
} from "./utils/previewManager.js";
import { getProjectPath, projectExists } from "../build/utils/projectManager.js";

const router = Router();

// Статус фоновой установки npm
router.get("/npm-install-status/:projectName", async (req, res) => {
  try {
    const { projectName } = req.params;
    if (!projectName) {
      return res.status(400).json({ error: "Missing projectName" });
    }
    if (!projectExists(projectName)) {
      return res.status(404).json({ error: "Project not found" });
    }
    const projectPath = getProjectPath(projectName);
    res.json({ success: true, ...getNpmInstallStatus(projectPath) });
  } catch (error: any) {
    res.status(500).json({
      error: "Failed to get npm install status",
      message: error.message,
    });
  }
});

// Запустить npm install (в фоне; прогресс — GET npm-install-status)
router.post("/install-deps/:projectName", async (req, res) => {
  try {
    const { projectName } = req.params;

    if (!projectName) {
      return res.status(400).json({ error: "Missing projectName" });
    }
    if (!projectExists(projectName)) {
      return res.status(404).json({ error: "Project not found" });
    }

    const projectPath = getProjectPath(projectName);
    const status = getNpmInstallStatus(projectPath);

    if (status.dependenciesInstalled) {
      return res.json({
        success: true,
        alreadyInstalled: true,
        message: "Зависимости уже установлены",
        ...status,
      });
    }

    if (status.installing) {
      return res.json({
        success: true,
        inProgress: true,
        message: "Установка уже выполняется",
        ...status,
      });
    }

    console.log(`[preview] install-deps (фон): ${projectName}`);
    void installDependencies(projectPath).catch((err: Error) => {
      console.error(`[preview] install-deps ошибка для ${projectName}:`, err.message);
    });

    const started = getNpmInstallStatus(projectPath);
    res.json({
      success: true,
      started: true,
      inProgress: true,
      message: "Копирование зависимостей из кэша шаблона",
      ...started,
    });
  } catch (error: any) {
    console.error("[preview] install-deps:", error);
    res.status(500).json({
      error: "Failed to install dependencies",
      message: error.message,
    });
  }
});

// Запустить проект
router.post("/start/:projectName", async (req, res) => {
  try {
    const { projectName } = req.params;

    if (!projectName) {
      return res.status(400).json({
        error: "Missing required field: projectName",
      });
    }

    if (!projectExists(projectName)) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const projectPath = getProjectPath(projectName);
    console.log(`[preview] Starting project: ${projectName}, path: ${projectPath}`);

    const info = await startPreview(projectName, projectPath);

    console.log(`[preview] Project started successfully: ${projectName}, URL: ${info.url}`);

    res.json({
      success: true,
      info,
    });
  } catch (error: any) {
    console.error("[preview] Ошибка при запуске проекта:", error);
    res.status(500).json({
      error: "Failed to start project",
      message: error.message,
    });
  }
});

// Остановить проект
router.post("/stop", async (req, res) => {
  try {
    await stopPreview();

    res.json({
      success: true,
      message: "Project stopped",
    });
  } catch (error: any) {
    console.error("[preview] Ошибка при остановке проекта:", error);
    res.status(500).json({
      error: "Failed to stop project",
      message: error.message,
    });
  }
});

// Получить статус превью
router.get("/status", async (req, res) => {
  try {
    const info = getPreviewInfo();
    const running = isPreviewRunning();

    res.json({
      running,
      info: info || null,
    });
  } catch (error: any) {
    console.error("[preview] Ошибка при получении статуса:", error);
    res.status(500).json({
      error: "Failed to get status",
      message: error.message,
    });
  }
});

// Проверить статус конкретного проекта
router.get("/status/:projectName", async (req, res) => {
  try {
    const { projectName } = req.params;

    if (!projectName) {
      return res.status(400).json({
        error: "Missing required field: projectName",
      });
    }

    const projectPath = getProjectPath(projectName);
    // Убрали подробное логирование для частых статус-запросов

    const running = isProjectRunning(projectName);
    // Возвращаем info только если этот конкретный проект запущен
    const currentInfo = getPreviewInfo();
    const info = running && currentInfo?.projectName === projectName ? currentInfo : null;
    
    let dependenciesInstalled = false;
    let npmInstall = {
      installing: false,
      elapsedSeconds: 0,
      lastError: null as string | null,
    };
    if (projectExists(projectName)) {
      dependenciesInstalled = checkDependencies(projectPath);
      npmInstall = getNpmInstallStatus(projectPath);
    }

    res.json({
      running,
      info: info || null,
      dependenciesInstalled,
      npmInstall,
    });
  } catch (error: any) {
    console.error("[preview] Ошибка при получении статуса проекта:", error);
    res.status(500).json({
      error: "Failed to get project status",
      message: error.message,
    });
  }
});

export default router;


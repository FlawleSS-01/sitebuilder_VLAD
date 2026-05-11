import { Router } from "express";
import {
  startPreview,
  stopPreview,
  getPreviewInfo,
  isPreviewRunning,
  isProjectRunning,
  checkDependencies,
} from "./utils/previewManager.js";
import { getProjectPath, projectExists } from "../build/utils/projectManager.js";

const router = Router();

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
    if (projectExists(projectName)) {
      dependenciesInstalled = checkDependencies(projectPath);
    }

    res.json({
      running,
      info: info || null,
      dependenciesInstalled,
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


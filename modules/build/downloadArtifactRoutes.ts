import { Router } from "express";
import fs from "fs";
import path from "path";
import { getProjectPath } from "./utils/projectManager.js";
import { generateApkSourceZip } from "./utils/apkGenerator.js";
import { buildCordovaAndroidApk } from "./utils/apkBinaryBuilder.js";

/**
 * Вынесено в отдельный роутер и подключается в server/index.ts первым под /api/build,
 * чтобы маршруты скачивания APK гарантированно регистрировались (огромный router.ts
 * у части деплоев мог подключаться из кэша/старой сборки без этих путей).
 */
const router = Router();

router.get("/download-apk/:projectName", async (req, res) => {
  const { projectName } = req.params;

  if (!projectName) {
    return res.status(400).json({ error: "Не указано имя проекта" });
  }

  const projectPath = getProjectPath(projectName);
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: "Проект не найден" });
  }

  try {
    const apkPath = await buildCordovaAndroidApk(projectPath, projectName);
    const safeBase =
      projectName.replace(/[^a-zA-Z0-9._-]/g, "_") || "app";

    res.download(apkPath, `${safeBase}.apk`, (err) => {
      if (fs.existsSync(apkPath)) {
        try {
          fs.unlinkSync(apkPath);
        } catch (e) {
          console.warn("[build] Не удалось удалить временный APK:", e);
        }
      }
      if (err) {
        console.error("[build] Ошибка при отправке APK:", err);
      }
    });
  } catch (error: any) {
    console.error("[build] Ошибка при сборке APK:", error);
    res.status(500).json({
      error: "Не удалось собрать APK",
      details: error.message,
    });
  }
});

router.get("/download-apk-source/:projectName", async (req, res) => {
  const { projectName } = req.params;

  if (!projectName) {
    return res.status(400).json({ error: "Не указано имя проекта" });
  }

  const projectPath = getProjectPath(projectName);
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: "Проект не найден" });
  }

  const archivePath = path.join(projectPath, `${projectName}-apk-source.zip`);

  try {
    await generateApkSourceZip(projectPath, projectName, archivePath);

    res.download(archivePath, `${projectName}-apk-source.zip`, (err) => {
      if (err) {
        console.error("Ошибка при отправке архива:", err);
      }
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
    });
  } catch (error: any) {
    console.error("Ошибка при создании архива APK:", error);
    res.status(500).json({
      error: "Не удалось создать архив APK",
      details: error.message,
    });
  }
});

export default router;

import fs from "fs";
import path from "path";
import archiver from "archiver";
import {
  checkDependencies,
  installDependencies,
  stopPreviewForProject,
} from "../../preview/utils/previewManager.js";
import { runNpmCli } from "../../utils/npmCli.js";

function projectNameFromPath(projectPath: string): string {
  return path.basename(path.resolve(projectPath));
}

/**
 * Создает архив проекта (исключая node_modules и dist)
 */
export const createProjectArchive = (
  projectPath: string,
  outputPath: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Максимальное сжатие
    });

    output.on("close", () => {
      console.log(`[build] Архив создан: ${outputPath} (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Рекурсивно добавляем файлы, исключая node_modules и dist
    const addDirectory = (dir: string, baseDir: string = projectPath) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        // Пропускаем node_modules и dist
        if (entry.name === "node_modules" || entry.name === "dist") {
          continue;
        }

        // Пропускаем скрытые файлы и папки (кроме важных)
        if (entry.name.startsWith(".") && entry.name !== ".env" && entry.name !== ".gitignore") {
          continue;
        }

        if (entry.isDirectory()) {
          addDirectory(fullPath, baseDir);
        } else {
          archive.file(fullPath, { name: relativePath });
        }
      }
    };

    addDirectory(projectPath);
    archive.finalize();
  });
};

/**
 * Запускает production-сборку Vite (npm run build) в каталоге проекта.
 */
export const runProjectProductionBuild = (
  projectPath: string
): Promise<void> => {
  console.log(`[build] Запускаем сборку проекта: npm run build`);
  return new Promise<void>((resolve, reject) => {
    const child = runNpmCli(["run", "build"], {
      cwd: projectPath,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });

    child.on("error", reject);
    child.on("exit", (code: number | null) => {
      if (code === 0) {
        console.log(`[build] Сборка завершена успешно`);
        resolve();
      } else {
        reject(new Error(`npm run build завершился с ошибкой (код: ${code})`));
      }
    });
  });
};

/**
 * Гарантирует наличие production-сборки (dist/index.html).
 * Превью через «Запустить проект» использует только vite dev — папку dist не создаёт.
 */
export const ensureProjectDistBuilt = async (
  projectPath: string
): Promise<string> => {
  const distPath = path.join(projectPath, "dist");
  const indexHtml = path.join(distPath, "index.html");

  if (fs.existsSync(indexHtml)) {
    console.log(
      `[build] Используем готовую папку dist (без npm run build): ${distPath}`
    );
    return distPath;
  }

  await stopPreviewForProject(projectNameFromPath(projectPath));

  const dependenciesInstalled = checkDependencies(projectPath);
  if (!dependenciesInstalled) {
    console.log(`[build] Зависимости не установлены, устанавливаем...`);
    await installDependencies(projectPath);
  }

  console.log(
    `[build] Нет готовой папки dist (нет index.html) — выполняем production-сборку в ${projectPath}`
  );
  await runProjectProductionBuild(projectPath);

  if (!fs.existsSync(distPath)) {
    throw new Error("Папка dist не найдена после сборки");
  }
  if (!fs.existsSync(path.join(distPath, "index.html"))) {
    throw new Error(
      "После сборки в dist нет index.html. Проверьте vite.config (outDir) и логи npm run build."
    );
  }

  return distPath;
};

/**
 * Принудительная пересборка dist (игнорирует уже существующую папку).
 * Обычные сценарии используют {@link ensureProjectDistBuilt}.
 */
export const rebuildProjectDistForPackaging = async (
  projectPath: string
): Promise<string> => {
  await stopPreviewForProject(projectNameFromPath(projectPath));

  const dependenciesInstalled = checkDependencies(projectPath);
  if (!dependenciesInstalled) {
    console.log(`[build] Зависимости не установлены, устанавливаем...`);
    await installDependencies(projectPath);
  }

  console.log(
    `[build] Перед упаковкой: npm run build в ${projectPath}`
  );
  await runProjectProductionBuild(projectPath);

  const distPath = path.join(projectPath, "dist");
  if (!fs.existsSync(distPath)) {
    throw new Error("Папка dist не найдена после сборки");
  }
  if (!fs.existsSync(path.join(distPath, "index.html"))) {
    throw new Error(
      "После сборки в dist нет index.html. Проверьте vite.config (outDir) и логи npm run build."
    );
  }

  return distPath;
};

/**
 * Упаковывает каталог dist в zip (только файлы из dist).
 */
export const archiveDistFolderToZip = (
  distPath: string,
  outputPath: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => {
      console.log(`[build] Архив dist создан: ${outputPath} (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    const addDirectory = (dir: string, baseDir: string = distPath) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        if (entry.isDirectory()) {
          addDirectory(fullPath, baseDir);
        } else {
          archive.file(fullPath, { name: relativePath });
        }
      }
    };

    addDirectory(distPath);
    archive.finalize();
  });
};

/**
 * Гарантирует наличие dist и создаёт ZIP только из папки dist (без лишней пересборки).
 */
export const buildAndArchiveProject = async (
  projectPath: string,
  outputPath: string
): Promise<void> => {
  const distPath = await ensureProjectDistBuilt(projectPath);
  console.log(`[build] Создаем архив dist папки...`);
  await archiveDistFolderToZip(distPath, outputPath);
};


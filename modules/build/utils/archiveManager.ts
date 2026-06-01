import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import archiver from "archiver";
import {
  checkDependencies,
  installDependencies,
  freePreviewPort,
  stopPreviewForProject,
} from "../../preview/utils/previewManager.js";
import { runNpmCli } from "../../utils/npmCli.js";

/** Лимит времени на vite/npm build (мс). По умолчанию 25 мин; 0 или SITEBUILDER_BUILD_TIMEOUT_MS=0 — без лимита. */
const PROJECT_BUILD_TIMEOUT_MS = (() => {
  const raw = process.env.SITEBUILDER_BUILD_TIMEOUT_MS?.trim();
  if (raw === "0") return 0;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 25 * 60 * 1000;
})();

/** Уровень сжатия zip: 9 очень медленный на больших проектах; 6 даёт почти тот же размер заметно быстрее. */
const ARCHIVE_ZIP_LEVEL = Math.min(
  9,
  Math.max(
    1,
    Number.parseInt(process.env.SITEBUILDER_ZIP_LEVEL || "6", 10) || 6
  )
);

function projectNameFromPath(projectPath: string): string {
  return path.basename(path.resolve(projectPath));
}

/** Максимальный mtime среди файлов в дереве каталога (без node_modules/dist). */
function getLatestFileMtimeMs(dir: string): number {
  let max = 0;
  if (!fs.existsSync(dir)) return 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const fp = path.join(d, entry.name);
      try {
        if (entry.isDirectory()) walk(fp);
        else {
          const st = fs.statSync(fp);
          if (st.mtimeMs > max) max = st.mtimeMs;
        }
      } catch {
        /* пропуск недоступных файлов */
      }
    }
  };
  walk(dir);
  return max;
}

const ROOT_BUILD_INPUT_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "index.html",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
];

/**
 * Нужна ли повторная production-сборка: нет dist/index.html или любой
 * релевантный вход новее, чем уже собранный dist.
 */
export function needsProductionRebuild(projectPath: string): boolean {
  const resolved = path.resolve(projectPath);
  const distIndex = path.join(resolved, "dist", "index.html");
  if (!fs.existsSync(distIndex)) return true;

  let distMtime: number;
  try {
    distMtime = fs.statSync(distIndex).mtimeMs;
  } catch {
    return true;
  }

  for (const name of ROOT_BUILD_INPUT_FILES) {
    const p = path.join(resolved, name);
    if (!fs.existsSync(p)) continue;
    try {
      if (fs.statSync(p).mtimeMs > distMtime) return true;
    } catch {
      return true;
    }
  }

  const srcMt = getLatestFileMtimeMs(path.join(resolved, "src"));
  if (srcMt > distMtime) return true;

  const pubMt = getLatestFileMtimeMs(path.join(resolved, "public"));
  if (pubMt > distMtime) return true;

  return false;
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
      zlib: { level: ARCHIVE_ZIP_LEVEL },
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

function resolveProjectViteCli(projectPath: string): string | null {
  const p = path.join(
    path.resolve(projectPath),
    "node_modules",
    "vite",
    "bin",
    "vite.js"
  );
  return fs.existsSync(p) ? p : null;
}

/**
 * Запускает production-сборку в каталоге проекта.
 * Предпочитает прямой `node …/vite/bin/vite.js build` (минуя npm.cmd и связанное с stdin зависание на Windows);
 * иначе `npm run build` с stdin, отсоединённым от TTY.
 */
export const runProjectProductionBuild = (
  projectPath: string
): Promise<void> => {
  const resolved = path.resolve(projectPath);
  const viteCli = resolveProjectViteCli(resolved);

  console.log(
    viteCli
      ? `[build] Запускаем vite build напрямую (node vite.js build)`
      : `[build] Запускаем сборку через npm run build (vite локально не найден)`
  );

  return new Promise<void>((resolve, reject) => {
    const buildEnv = {
      ...process.env,
      NODE_ENV: "production",
      CI: process.env.CI ?? "true",
      npm_config_loglevel: process.env.npm_config_loglevel ?? "error",
    } as NodeJS.ProcessEnv;

    const child = viteCli
      ? spawn(process.execPath, [viteCli, "build"], {
          cwd: resolved,
          env: buildEnv,
          stdio: ["ignore", "inherit", "inherit"] as const,
          windowsHide: true,
          shell: false,
        })
      : runNpmCli(["run", "build"], {
          cwd: resolved,
          stdio: "inherit",
          ignoreStdin: true,
          env: buildEnv,
        });

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimeoutIfAny = (): void => {
      if (timer) clearTimeout(timer);
    };

    if (PROJECT_BUILD_TIMEOUT_MS > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const pid = child.pid;
        try {
          if (process.platform === "win32" && pid) {
            spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
              stdio: "ignore",
              windowsHide: true,
              detached: true,
            }).unref();
          } else {
            child.kill("SIGKILL");
          }
        } catch {
          try {
            child.kill();
          } catch {
            /* ignore */
          }
        }
        reject(
          new Error(
            `Сборка dist превысила ${Math.round(
              PROJECT_BUILD_TIMEOUT_MS / 60000
            )} мин. Остановите «Превью» проекта, при необходимости закройте Vite/dev на этом проекте. ` +
              `Проверьте в каталоге проекта: vite build или npm run build. ` +
              `Проекты в папке OneDrive сборку часто очень тормозят или блокируют.`
          )
        );
      }, PROJECT_BUILD_TIMEOUT_MS);
    }

    child.on("error", (e) => {
      clearTimeoutIfAny();
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
    child.on("exit", (code: number | null) => {
      clearTimeoutIfAny();
      if (settled) return;
      settled = true;
      if (code === 0) {
        console.log(`[build] Сборка завершена успешно`);
        resolve();
      } else {
        reject(
          new Error(
            `Сборка завершилась с ошибкой (код: ${code}). Смотрите лог vite/npm выше.`
          )
        );
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

  if (fs.existsSync(indexHtml) && !needsProductionRebuild(projectPath)) {
    console.log(
      `[build] Используем готовую папку dist (без повторной сборки): ${distPath}`
    );
    return distPath;
  }

  await stopPreviewForProject(projectNameFromPath(projectPath));
  await freePreviewPort();
  await new Promise((r) => setTimeout(r, 450));

  const dependenciesInstalled = checkDependencies(projectPath);
  if (!dependenciesInstalled) {
    console.log(`[build] Зависимости не установлены, устанавливаем...`);
    await installDependencies(projectPath);
  }

  if (!fs.existsSync(indexHtml)) {
    console.log(
      `[build] Нет готовой папки dist (нет index.html) — выполняем production-сборку в ${projectPath}`
    );
  } else {
    console.log(
      `[build] dist устарел относительно исходников/конфига — пересборка в ${projectPath}`
    );
  }
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
  await freePreviewPort();
  await new Promise((r) => setTimeout(r, 450));

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
      zlib: { level: ARCHIVE_ZIP_LEVEL },
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


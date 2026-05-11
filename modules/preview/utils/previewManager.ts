import {
  createServer,
  request as httpRequest,
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "http";
import handler from "serve-handler";
import { spawn, type ChildProcess } from "child_process";
import { runNpmCli } from "../../utils/npmCli.js";
import fs from "fs";
import path from "path";
import os from "os";

export interface PreviewInfo {
  projectName: string;
  projectPath: string;
  port: number;
  url: string;
  startedAt: string;
}

type StaticPreviewState = {
  type: "static";
  server: HttpServer;
  info: PreviewInfo;
};

type ReactPreviewState = {
  type: "react";
  process: ChildProcess;
  info: PreviewInfo;
};

let activePreview: StaticPreviewState | ReactPreviewState | null = null;

// Фиксированный порт для всех проектов
const PREVIEW_PORT = 5173;

/**
 * Получить свободный порт (используем фиксированный порт)
 */
const getAvailablePort = (): Promise<number> => {
  return Promise.resolve(PREVIEW_PORT);
};

/**
 * Ожидание запуска React dev-сервера
 */
const waitForReactServer = (
  port: number,
  child: ChildProcess,
  timeoutMs = 30000
): Promise<void> =>
  new Promise((resolve, reject) => {
    const started = Date.now();

    const check = () => {
      const req = httpRequest(
        {
          method: "HEAD",
          hostname: "localhost",
          port,
          path: "/",
          timeout: 2000,
        },
        (res: IncomingMessage) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            resolve();
          } else if (!child.pid) {
            reject(new Error("React preview завершился до старта"));
          } else if (Date.now() - started > timeoutMs) {
            reject(new Error("Превышено время ожидания запуска React превью"));
          } else {
            setTimeout(check, 500);
          }
          res.resume();
        }
      );

      req.on("error", () => {
        if (!child.pid) {
          reject(new Error("React preview завершился до старта"));
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Превышено время ожидания запуска React превью"));
        } else {
          setTimeout(check, 500);
        }
      });

      req.end();
    };

    check();
  });

/**
 * Проверка установленных зависимостей.
 *
 * Эта функция вызывается очень часто — клиент опрашивает
 * `/api/preview/status/:projectName` пока пользователь сидит на
 * странице проекта. Чтобы не засорять консоль повторяющимися
 * сообщениями `node_modules not found`, по умолчанию мы молчим.
 * Когда вызов происходит из реального flow запуска превью,
 * используется `verbose=true` (ниже в `installDependencies`/`startPreview`),
 * и логи остаются информативными.
 */
export const checkDependencies = (
  projectPath: string,
  verbose: boolean = false
): boolean => {
  const nodeModules = path.join(projectPath, "node_modules");
  const packageJson = path.join(projectPath, "package.json");

  if (!fs.existsSync(packageJson)) {
    if (verbose) console.log(`[preview] package.json not found at ${projectPath}`);
    return false;
  }

  if (!fs.existsSync(nodeModules)) {
    if (verbose) console.log(`[preview] node_modules not found at ${nodeModules}`);
    return false;
  }

  // Проверяем наличие vite (для React+Vite проектов)
  // На Windows может быть vite.cmd или vite.ps1, на Unix - просто vite
  const viteBinDir = path.join(nodeModules, ".bin");
  const viteBin = path.join(viteBinDir, "vite");
  const viteCmd = path.join(viteBinDir, "vite.cmd");
  const vitePs1 = path.join(viteBinDir, "vite.ps1");

  const viteExists =
    fs.existsSync(viteBin) || fs.existsSync(viteCmd) || fs.existsSync(vitePs1);

  if (!viteExists) {
    if (verbose) {
      console.log(
        `[preview] vite binary not found at ${viteBinDir} (checked: vite, vite.cmd, vite.ps1)`
      );
    }
    return false;
  }

  // Дополнительная проверка: убеждаемся что node_modules не пустая папка
  try {
    const nodeModulesContents = fs.readdirSync(nodeModules);
    if (nodeModulesContents.length === 0) {
      if (verbose) console.log(`[preview] node_modules is empty at ${nodeModules}`);
      return false;
    }
  } catch (err) {
    if (verbose) console.log(`[preview] Error reading node_modules: ${err}`);
    return false;
  }

  return true;
};

/**
 * Установка зависимостей для React проекта
 */
export const installDependencies = (projectPath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const nodeModules = path.join(projectPath, "node_modules");

    // Если зависимости уже установлены - пропускаем
    if (checkDependencies(projectPath, true)) {
      resolve();
      return;
    }

    console.log(`[preview] Installing dependencies for ${projectPath}...`);
    const child = runNpmCli(["install"], {
      cwd: projectPath,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development" },
    });

    child.on("error", reject);
    child.on("exit", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error("npm install завершился с ошибкой"));
    });
  });

/**
 * Остановить текущее превью
 */
export const stopPreview = async (): Promise<void> => {
  const current = activePreview;
  if (!current) {
    console.log("[preview] No active preview to stop");
    return;
  }

  console.log(`[preview] Stopping preview for ${current.info.projectName}...`);

  if (current.type === "static") {
    await new Promise<void>((resolve) => current.server.close(() => resolve()));
  } else {
    const child = current.process;
    const pid = child.pid;

    if (!pid) {
      console.log("[preview] Process has no PID, already terminated");
      activePreview = null;
      return;
    }

    console.log(`[preview] Killing process tree for PID ${pid}`);

    // На Windows используем taskkill для убийства процесса и всех дочерних
    if (process.platform === "win32") {
      try {
        // Используем taskkill для убийства процесса и всех дочерних процессов
        const taskkill = spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
          stdio: "pipe",
          shell: false,
        });

        await new Promise<void>((resolve) => {
          taskkill.once("exit", () => resolve());
          taskkill.once("close", () => resolve());
          setTimeout(() => resolve(), 3000);
        });
      } catch (err) {
        console.error(`[preview] Error killing process tree: ${err}`);
      }
    } else {
      // На Unix-системах убиваем всё дерево процессов
      try {
        // Сначала пробуем мягко завершить через SIGTERM
        child.kill("SIGTERM");

        // Ждем завершения процесса
        await new Promise<void>((resolve) => {
          child.once("exit", () => resolve());
          child.once("close", () => resolve());
          setTimeout(() => resolve(), 2000);
        });

        // Если процесс не завершился, убиваем всё дерево процессов через pkill
        if (!child.killed && pid) {
          console.log(
            `[preview] Process still running, killing process tree for PID ${pid}`
          );

          // Используем pkill для убийства всего дерева процессов
          const pkill = spawn("pkill", ["-P", String(pid)], {
            stdio: "pipe",
            shell: false,
          });

          await new Promise<void>((resolve) => {
            pkill.once("exit", () => resolve());
            pkill.once("close", () => resolve());
            setTimeout(() => resolve(), 1000);
          });

          // Также убиваем сам процесс напрямую
          try {
            child.kill("SIGKILL");
          } catch (e) {
            // Игнорируем ошибки, если процесс уже завершен
          }

          // Дополнительно убиваем процесс по PID через kill
          const kill = spawn("kill", ["-9", String(pid)], {
            stdio: "pipe",
            shell: false,
          });

          await new Promise<void>((resolve) => {
            kill.once("exit", () => resolve());
            kill.once("close", () => resolve());
            setTimeout(() => resolve(), 1000);
          });
        }
      } catch (err) {
        console.error(`[preview] Error killing process: ${err}`);
        // В случае ошибки пробуем убить процесс напрямую
        if (pid) {
          try {
            const kill = spawn("kill", ["-9", String(pid)], {
              stdio: "pipe",
              shell: false,
            });
            await new Promise<void>((resolve) => {
              kill.once("exit", () => resolve());
              kill.once("close", () => resolve());
              setTimeout(() => resolve(), 1000);
            });
          } catch (e) {
            console.error(`[preview] Error in fallback kill: ${e}`);
          }
        }
      }
    }
  }

  // Дополнительная проверка: убиваем процессы по порту, если они остались
  if (current.info.port) {
    try {
      await killProcessByPort(current.info.port);
    } catch (err) {
      console.error(`[preview] Error killing process by port: ${err}`);
    }
  }

  activePreview = null;
  console.log("[preview] Stopped successfully");
};

/**
 * Остановить превью, если оно запущено для этого проекта (избегает зависаний npm run build из‑за Vite dev на тех же файлах).
 */
export const stopPreviewForProject = async (
  projectName: string
): Promise<void> => {
  if (!activePreview || activePreview.info.projectName !== projectName) {
    return;
  }
  console.log(
    `[preview] Останавливаем превью перед сборкой dist для ${projectName}`
  );
  await stopPreview();
  await new Promise((r) => setTimeout(r, 600));
};

/**
 * Убить процесс по порту (дополнительная мера безопасности)
 */
const killProcessByPort = async (port: number): Promise<void> => {
  if (process.platform === "win32") {
    // На Windows используем netstat и taskkill
    try {
      const netstat = spawn("netstat", ["-ano"], {
        stdio: "pipe",
        shell: false,
      });

      let output = "";
      netstat.stdout?.on("data", (data) => {
        output += data.toString();
      });

      await new Promise<void>((resolve) => {
        netstat.once("exit", () => resolve());
        netstat.once("close", () => resolve());
        setTimeout(() => resolve(), 2000);
      });

      const lines = output.split("\n");
      const pids = new Set<string>();

      for (const line of lines) {
        if (line.includes(`:${port}`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid)) {
            pids.add(pid);
          }
        }
      }

      for (const pid of pids) {
        try {
          const taskkill = spawn("taskkill", ["/F", "/PID", pid], {
            stdio: "pipe",
            shell: false,
          });
          await new Promise<void>((resolve) => {
            taskkill.once("exit", () => resolve());
            taskkill.once("close", () => resolve());
            setTimeout(() => resolve(), 1000);
          });
        } catch (e) {
          // Игнорируем ошибки
        }
      }
    } catch (err) {
      // Игнорируем ошибки
    }
  } else {
    // На Unix-системах используем lsof и kill
    try {
      const lsof = spawn("lsof", ["-ti", `:${port}`], {
        stdio: "pipe",
        shell: false,
      });

      let output = "";
      lsof.stdout?.on("data", (data) => {
        output += data.toString();
      });

      await new Promise<void>((resolve) => {
        lsof.once("exit", () => resolve());
        lsof.once("close", () => resolve());
        setTimeout(() => resolve(), 2000);
      });

      const pids = output
        .trim()
        .split("\n")
        .filter((pid) => pid && /^\d+$/.test(pid));

      for (const pid of pids) {
        try {
          const kill = spawn("kill", ["-9", pid], {
            stdio: "pipe",
            shell: false,
          });
          await new Promise<void>((resolve) => {
            kill.once("exit", () => resolve());
            kill.once("close", () => resolve());
            setTimeout(() => resolve(), 1000);
          });
        } catch (e) {
          // Игнорируем ошибки
        }
      }
    } catch (err) {
      // Игнорируем ошибки, если lsof не установлен или порт свободен
    }
  }
};

/**
 * Проверить, свободен ли порт
 */
const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
};

/**
 * Запустить превью проекта
 */
export const startPreview = async (
  projectName: string,
  projectPath: string
): Promise<PreviewInfo> => {
  // Проверяем что директория существует
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Директория проекта не найдена: ${projectPath}`);
  }

  console.log(
    `[preview] Starting preview for project: ${projectName} at ${projectPath}`
  );

  // Останавливаем предыдущее превью (если запущено)
  if (activePreview) {
    console.log(
      `[preview] Stopping previous preview: ${activePreview.info.projectName}`
    );
    await stopPreview();
    // Даем время порту освободиться
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Проверяем, что порт свободен
  const port = await getAvailablePort();
  const portAvailable = await isPortAvailable(port);
  if (!portAvailable) {
    console.log(`[preview] Port ${port} is still in use, waiting...`);
    // Ждем еще немного
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const portAvailable2 = await isPortAvailable(port);
    if (!portAvailable2) {
      throw new Error(
        `Порт ${port} все еще занят. Попробуйте остановить предыдущий проект вручную.`
      );
    }
  }

  // Проверяем и устанавливаем зависимости
  const dependenciesInstalled = checkDependencies(projectPath, true);
  if (!dependenciesInstalled) {
    console.log(`[preview] Dependencies not installed, installing...`);
    await installDependencies(projectPath);
  }

  // Определяем host для URL превью
  // Используем переменную окружения PREVIEW_HOST или получаем hostname сервера
  const previewHost =
    process.env.PREVIEW_HOST ||
    (() => {
      try {
        const networkInterfaces = os.networkInterfaces();
        // Ищем первый не-localhost IPv4 адрес
        for (const interfaceName in networkInterfaces) {
          const interfaces = networkInterfaces[interfaceName];
          if (interfaces) {
            for (const iface of interfaces) {
              if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
              }
            }
          }
        }
      } catch (e) {
        // Игнорируем ошибки
      }
      // Fallback на localhost если не удалось определить
      return "localhost";
    })();

  // Запускаем Vite dev server
  const child = runNpmCli(
    ["run", "dev", "--", "--host", "0.0.0.0", "--port", String(port)],
    {
      cwd: projectPath,
      stdio: "pipe",
      env: { ...process.env, PORT: String(port) },
    }
  );

  // Логируем вывод процесса
  child.stdout?.on("data", (data) => {
    console.log(`[preview:${projectName}] ${data.toString()}`);
  });

  child.stderr?.on("data", (data) => {
    console.error(`[preview:${projectName}] ${data.toString()}`);
  });

  child.on("error", (error) => {
    console.error(`[preview] React preview error for ${projectName}:`, error);
  });

  // Ждем запуска сервера
  await waitForReactServer(port, child);

  const info: PreviewInfo = {
    projectName,
    projectPath,
    port,
    url: `http://${previewHost}:${port}`,
    startedAt: new Date().toISOString(),
  };

  activePreview = { type: "react", process: child, info };
  console.log(
    `[preview] React dev server started at ${info.url} for ${projectName}`
  );
  return info;
};

/**
 * Получить информацию о текущем превью
 */
export const getPreviewInfo = (): PreviewInfo | null =>
  activePreview ? activePreview.info : null;

/**
 * Проверить, запущено ли превью
 */
export const isPreviewRunning = (): boolean => activePreview !== null;

/**
 * Проверить, запущен ли конкретный проект
 */
export const isProjectRunning = (projectName: string): boolean => {
  return activePreview?.info.projectName === projectName;
};

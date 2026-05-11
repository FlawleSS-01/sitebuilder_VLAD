import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { ensureProjectDistBuilt } from "./archiveManager.js";
import {
  readCordovaMetadata,
  writeCordovaProjectDir,
} from "./apkGenerator.js";

/** Дочерний процесс часто не видит npx/npm (урезанный PATH в GUI/службах). */
function getCordovaChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    CI: "true",
    CORDOVA_TELEMETRY: "0",
  };
  const nodeBin = path.dirname(process.execPath);
  const prefix: string[] = [nodeBin];
  if (process.platform === "win32") {
    const systemRoot = env.SystemRoot || "C:\\Windows";
    prefix.push(
      path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0"),
      path.join(systemRoot, "System32")
    );
  }
  env.PATH = [...prefix, env.PATH || ""].join(path.delimiter);
  return env;
}

function resolveNpmExecutable(): string {
  const nodeBin = path.dirname(process.execPath);
  if (process.platform === "win32") {
    const cmd = path.join(nodeBin, "npm.cmd");
    return fs.existsSync(cmd) ? cmd : "npm.cmd";
  }
  const n = path.join(nodeBin, "npm");
  return fs.existsSync(n) ? n : "npm";
}

function getCordovaJsPath(appDir: string): string {
  return path.join(appDir, "node_modules", "cordova", "bin", "cordova");
}

function runSpawn(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    CI: "true",
  },
  options?: { shell?: boolean }
): Promise<void> {
  const shell =
    options?.shell !== undefined
      ? options.shell
      : process.platform === "win32";
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell,
      env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `Команда завершилась с кодом ${code}: ${command} ${args.join(" ")}`
          )
        );
      }
    });
  });
}

function findFirstApk(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(dir);
  } catch {
    return null;
  }
  if (!stat.isDirectory()) return null;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const found = findFirstApk(p);
      if (found) return found;
    } else if (name.endsWith(".apk") && !name.includes("unaligned")) {
      return p;
    }
  }
  return null;
}

function assertAndroidSdk(): void {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    process.env.ANDROID_SDK_HOME;
  if (!sdk || !fs.existsSync(sdk)) {
    throw new Error(
      "Не найден Android SDK. Установите Android Studio, в SDK Manager добавьте платформу Android, затем задайте ANDROID_HOME (или ANDROID_SDK_ROOT) на каталог Sdk и перезапустите сервер."
    );
  }
}

/**
 * Собирает debug APK через Cordova (нужны JDK, Android SDK; первый запуск может долго качать Gradle/npm).
 * Возвращает путь к временному файлу — удалить после отдачи клиенту.
 */
export async function buildCordovaAndroidApk(
  projectPath: string,
  projectName: string
): Promise<string> {
  assertAndroidSdk();

  const distPath = await ensureProjectDistBuilt(projectPath);
  const meta = readCordovaMetadata(projectPath);

  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sitebuilder-apk-"));
  const appFolderName = "cordova-app";

  try {
    const appDir = path.join(workRoot, appFolderName);
    const cordovaEnv = getCordovaChildEnv();
    writeCordovaProjectDir(appDir, distPath, meta);

    await runSpawn(
      resolveNpmExecutable(),
      ["install", "--no-fund", "--no-audit"],
      appDir,
      cordovaEnv,
      { shell: process.platform === "win32" }
    );

    const cordovaJs = getCordovaJsPath(appDir);
    if (!fs.existsSync(cordovaJs)) {
      throw new Error(
        `После npm install не найден Cordova CLI: ${cordovaJs}. Проверьте лог npm выше.`
      );
    }

    await runSpawn(
      process.execPath,
      [cordovaJs, "--no-telemetry", "platform", "add", "android"],
      appDir,
      cordovaEnv,
      { shell: false }
    );

    await runSpawn(
      process.execPath,
      [cordovaJs, "--no-telemetry", "build", "android"],
      appDir,
      cordovaEnv,
      { shell: false }
    );

    const platAndroid = path.join(appDir, "platforms", "android");
    const apk =
      findFirstApk(path.join(platAndroid, "app", "build", "outputs", "apk")) ||
      findFirstApk(platAndroid);

    if (!apk || !fs.existsSync(apk)) {
      throw new Error(
        "Сборка завершилась, но файл .apk не найден в platforms/android. Проверьте лог Gradle выше и установку Android SDK / JDK."
      );
    }

    const tempDir = path.join(process.cwd(), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const safeBase =
      projectName.replace(/[^a-zA-Z0-9._-]/g, "_") || "app";
    const outPath = path.join(tempDir, `${safeBase}-${Date.now()}-debug.apk`);
    fs.copyFileSync(apk, outPath);

    return outPath;
  } finally {
    try {
      fs.rmSync(workRoot, { recursive: true, force: true });
    } catch (e) {
      console.warn(
        "[build] Не удалось удалить временную папку Cordova:",
        workRoot,
        e
      );
    }
  }
}

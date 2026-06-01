import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toWinLongPath(dirPath: string): string {
  const abs = path.resolve(dirPath);
  if (process.platform !== "win32") return abs;
  const normalized = abs.replace(/\//g, "\\");
  if (normalized.startsWith("\\\\?\\")) return normalized;
  return `\\\\?\\${normalized}`;
}

async function windowsRmdir(dirPath: string): Promise<void> {
  const target = toWinLongPath(dirPath);
  const comspec = process.env.ComSpec ?? "cmd.exe";
  await execFileAsync(comspec, ["/d", "/s", "/c", "rmdir", "/s", "/q", target], {
    windowsHide: true,
    timeout: 120_000,
  }).catch((err: NodeJS.ErrnoException) => {
    const code = String(err.code ?? "");
    if (code === "2" || code === "1") return;
    throw err;
  });
}

async function removePathOnce(dirPath: string): Promise<void> {
  await fs.promises.rm(dirPath, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 300,
  });
}

/**
 * Удаление папки проекта: повторы, сначала node_modules, на Windows — rmdir /s /q.
 */
export async function removeDirectoryRobust(dirPath: string): Promise<void> {
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved)) return;

  const nodeModules = path.join(resolved, "node_modules");
  if (fs.existsSync(nodeModules)) {
    for (let i = 0; i < 4; i++) {
      try {
        if (process.platform === "win32") {
          await windowsRmdir(nodeModules);
        } else {
          await removePathOnce(nodeModules);
        }
        if (!fs.existsSync(nodeModules)) break;
      } catch {
        await sleep(400 * (i + 1));
      }
    }
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await removePathOnce(resolved);
      if (!fs.existsSync(resolved)) return;
    } catch (err) {
      lastError = err;
      if (process.platform === "win32" && attempt >= 3) {
        try {
          await windowsRmdir(resolved);
          if (!fs.existsSync(resolved)) return;
        } catch (winErr) {
          lastError = winErr;
        }
      }
      await sleep(500 * (attempt + 1));
    }
  }

  if (fs.existsSync(resolved)) {
    const parent = path.dirname(resolved);
    const base = path.basename(resolved);
    const trashPath = path.join(parent, `.deleted-${base}-${Date.now()}`);
    try {
      fs.renameSync(resolved, trashPath);
      console.warn(
        `[build] Папка проекта переименована в ${trashPath} — удалите вручную, если останется`
      );
      void removeDirectoryRobust(trashPath).catch(() => undefined);
      return;
    } catch {
      /* fall through */
    }

    const msg =
      lastError instanceof Error
        ? lastError.message
        : String(lastError ?? "unknown");
    throw new Error(
      `Не удалось удалить папку проекта (${msg}). Остановите preview, закройте терминал в папке проекта и повторите.`
    );
  }
}

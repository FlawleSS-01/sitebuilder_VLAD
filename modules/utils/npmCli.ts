import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

export function resolveNpmExecutable(): string {
  const nodeBin = path.dirname(process.execPath);
  if (process.platform === "win32") {
    const cmd = path.join(nodeBin, "npm.cmd");
    return fs.existsSync(cmd) ? cmd : "npm.cmd";
  }
  const n = path.join(nodeBin, "npm");
  return fs.existsSync(n) ? n : "npm";
}

/** Путь к npm-cli.js рядом с node (MSI/fnm/nvm-windows) или в ../lib (типичный Unix prefix). */
function resolveNpmCliScriptPath(): string | null {
  const nodeBin = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeBin, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(nodeBin, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const p of candidates) {
    const resolved = path.normalize(p);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

/** Кавычки для путей с пробелами в одной строке после `cmd /c`. */
function quoteForCmdMeta(s: string): string {
  if (!/[ \t"&|<>^]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Запуск npm без shell:true (Node склеивает команду без кавычек — путь режется на «C:\Program»).
 * Основной путь: node + npm-cli.js (как у установки из nodejs.org). Иначе: cmd /c call «…npm.cmd» …
 */
export function runNpmCli(
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    stdio: "inherit" | "pipe";
  }
): ChildProcess {
  const cliJs = resolveNpmCliScriptPath();
  if (cliJs) {
    return spawn(process.execPath, [cliJs, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio,
      shell: false,
      windowsHide: true,
    });
  }

  if (process.platform === "win32") {
    const npm = resolveNpmExecutable();
    const line = ["call", quoteForCmdMeta(npm), ...args.map(quoteForCmdMeta)].join(
      " "
    );
    const comspec = process.env.ComSpec ?? "cmd.exe";
    return spawn(comspec, ["/d", "/s", "/c", line], {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio,
      windowsHide: true,
    });
  }

  return spawn(resolveNpmExecutable(), args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio,
    shell: false,
    windowsHide: true,
  });
}

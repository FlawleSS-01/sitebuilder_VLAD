import { execFile, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");

const execFileAsync = promisify(execFile);

const TEMPLATE_MARKER = ".sitebuilder-template";

export const writeProjectTemplateMarker = (
  projectPath: string,
  templateName: string
): void => {
  fs.writeFileSync(
    path.join(projectPath, TEMPLATE_MARKER),
    templateName.trim() || "default-template",
    "utf-8"
  );
};

export const readProjectTemplateName = (projectPath: string): string => {
  const marker = path.join(projectPath, TEMPLATE_MARKER);
  if (fs.existsSync(marker)) {
    const name = fs.readFileSync(marker, "utf-8").trim();
    if (name) return name;
  }
  return "default-template";
};

const vitePresentInNodeModules = (nodeModulesDir: string): boolean => {
  const bin = path.join(nodeModulesDir, ".bin");
  return (
    fs.existsSync(path.join(bin, "vite")) ||
    fs.existsSync(path.join(bin, "vite.cmd")) ||
    fs.existsSync(path.join(bin, "vite.ps1"))
  );
};

/** Папка node_modules-источник для копирования (без npm в projects/). */
export const resolveNodeModulesSource = (
  templateName: string = "default-template"
): string | null => {
  const root = APP_ROOT;
  const candidates = [
    path.join(root, "modules", "source", ".deps-cache", templateName, "node_modules"),
    path.join(root, "modules", "source", templateName, "node_modules"),
    path.join(root, "modules", "source", "default-template", "node_modules"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && vitePresentInNodeModules(dir)) {
      return dir;
    }
  }
  return null;
};

const removeDirIfExists = (dir: string): void => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/** robocopy: коды 0–7 = успех */
const isRobocopySuccess = (code: number): boolean => code >= 0 && code <= 7;

async function copyTree(src: string, dest: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (process.platform === "win32") {
    await execFileAsync(
      "robocopy",
      [src, dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"],
      { windowsHide: true, maxBuffer: 1024 * 1024 }
    ).then(
      () => undefined,
      (err: NodeJS.ErrnoException & { code?: number }) => {
        const code = typeof err.code === "number" ? err.code : -1;
        if (isRobocopySuccess(code)) return;
        throw err;
      }
    );
    return;
  }

  await fs.promises.cp(src, dest, { recursive: true, force: true });
}

function copyTreeSync(src: string, dest: string): void {
  if (process.platform === "win32") {
    try {
      execFileSync(
        "robocopy",
        [src, dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"],
        { windowsHide: true, stdio: "ignore" }
      );
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status: number }).status)
          : -1;
      if (!isRobocopySuccess(code)) throw err;
    }
    return;
  }

  fs.cpSync(src, dest, { recursive: true, force: true });
}

const COPY_TIMEOUT_MS = 15 * 60 * 1000;

export async function copyNodeModulesToProject(
  projectPath: string,
  templateName?: string
): Promise<void> {
  const resolved = path.resolve(projectPath);
  const template = templateName ?? readProjectTemplateName(resolved);
  const src = resolveNodeModulesSource(template);

  if (!src) {
    throw new Error(
      "Нет готового кэша node_modules. В корне репозитория выполните: npm run prepare-project-deps"
    );
  }

  const dest = path.join(resolved, "node_modules");
  removeDirIfExists(dest);

  console.log(
    `[preview] Копирование node_modules из ${src} → ${dest} (без npm install)`
  );

  const copyPromise = copyTree(src, dest);
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(
            "Таймаут копирования зависимостей. Запустите в папке проекта: npm install"
          )
        ),
      COPY_TIMEOUT_MS
    );
  });

  await Promise.race([copyPromise, timeout]);
  console.log(`[preview] node_modules скопированы в ${dest}`);
}

export function copyNodeModulesToProjectSync(
  projectPath: string,
  templateName?: string
): void {
  const resolved = path.resolve(projectPath);
  const template = templateName ?? readProjectTemplateName(resolved);
  const src = resolveNodeModulesSource(template);

  if (!src) {
    console.warn(
      `[build] Кэш node_modules не найден для шаблона "${template}". Запустите: npm run prepare-project-deps`
    );
    return;
  }

  const dest = path.join(resolved, "node_modules");
  removeDirIfExists(dest);
  console.log(`[build] Копирование node_modules: ${src} → ${dest}`);
  copyTreeSync(src, dest);
}

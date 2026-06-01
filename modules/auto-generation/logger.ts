import fs from "fs";
import path from "path";
import { getProjectPath } from "../build/utils/projectManager.js";
import type { AutoGenerationCost } from "./types.js";
import { formatCostLogLine, roundCost } from "./cost.js";

function appendLine(filePath: string, line: string): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, line, "utf-8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[auto-generation] Не удалось записать лог в ${filePath}: ${msg}`);
  }
}

/** Пишет в консоль сервера и в projects/<name>/auto-generation.log */
export function autoGenLog(
  projectName: string | null,
  message: string,
  level: "info" | "warn" | "error" = "info"
): void {
  const ts = new Date().toISOString();
  const tag = projectName ? `[auto-generation:${projectName}]` : "[auto-generation]";
  const line = `${ts} ${tag} ${message}`;

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  if (projectName) {
    appendLine(
      path.join(getProjectPath(projectName), "auto-generation.log"),
      `${line}\n`
    );
  }
}

/** Запись разбивки стоимости в auto-generation.log */
export function logAutoGenCost(
  projectName: string,
  cost: AutoGenerationCost,
  label = "Расходы"
): void {
  autoGenLog(projectName, `${label}: ${formatCostLogLine(roundCost(cost))}`);
}

import fs from "fs";
import path from "path";
import {
  getProjectPath,
  getProjectSettings,
  saveProjectSettings,
} from "../build/utils/projectManager.js";
import {
  type AutoGenerationCost,
  type AutoGenerationState,
  type AutoGenerationStep,
  type AutoStepKey,
  type AutoStepStatus,
  createInitialAutoSteps,
} from "./types.js";

function readSettingsRaw(projectName: string): Record<string, unknown> | null {
  const p = path.join(getProjectPath(projectName), "project-settings.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getAutoGenerationState(
  projectName: string
): AutoGenerationState | null {
  const settings = readSettingsRaw(projectName);
  const ag = settings?.autoGeneration;
  if (!ag || typeof ag !== "object") return null;
  return ag as AutoGenerationState;
}

export function patchAutoGeneration(
  projectName: string,
  patch: Partial<AutoGenerationState>
): AutoGenerationState {
  const settings = getProjectSettings(projectName);
  if (!settings) {
    throw new Error("Project settings not found");
  }
  const prev = (settings as Record<string, unknown>).autoGeneration as
    | AutoGenerationState
    | undefined;
  const next: AutoGenerationState = {
    ...(prev || {
      mode: "auto",
      status: "pending",
      currentStep: null,
      steps: createInitialAutoSteps(),
    }),
    ...patch,
  };
  saveProjectSettings(getProjectPath(projectName), {
    ...settings,
    autoGeneration: next,
  } as Parameters<typeof saveProjectSettings>[1]);
  return next;
}

export function setAutoStep(
  projectName: string,
  stepKey: AutoStepKey,
  status: AutoStepStatus,
  error?: string
): void {
  const settings = getProjectSettings(projectName);
  if (!settings) return;
  const ag = ((settings as Record<string, unknown>).autoGeneration ||
    {}) as AutoGenerationState;
  const steps: AutoGenerationStep[] = ag.steps?.length
    ? [...ag.steps]
    : createInitialAutoSteps();
  const idx = steps.findIndex((s) => s.key === stepKey);
  if (idx >= 0) {
    steps[idx] = { ...steps[idx], status, ...(error ? { error } : {}) };
  }
  patchAutoGeneration(projectName, {
    currentStep: status === "running" ? stepKey : ag.currentStep,
    steps,
    status: status === "error" ? "error" : ag.status === "error" ? "error" : "running",
    ...(error ? { error } : {}),
  });
}

export function startAutoRun(projectName: string): void {
  patchAutoGeneration(projectName, {
    status: "running",
    currentStep: "creating",
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    error: undefined,
    steps: createInitialAutoSteps().map((s, i) => ({
      ...s,
      status: i === 0 ? "running" : "pending",
    })),
  });
}

export function finishAutoRun(
  projectName: string,
  cost?: AutoGenerationCost
): void {
  const steps = createInitialAutoSteps().map((s) => ({
    ...s,
    status: "done" as AutoStepStatus,
  }));
  patchAutoGeneration(projectName, {
    status: "done",
    currentStep: "done",
    steps,
    finishedAt: new Date().toISOString(),
    ...(cost ? { cost } : {}),
  });
}

export function failAutoRun(projectName: string, message: string, stepKey?: AutoStepKey): void {
  if (stepKey) {
    setAutoStep(projectName, stepKey, "error", message);
  }
  patchAutoGeneration(projectName, {
    status: "error",
    error: message,
    finishedAt: new Date().toISOString(),
  });
}

export function mergeAutoCost(
  projectName: string,
  cost: AutoGenerationCost
): void {
  const ag = getAutoGenerationState(projectName);
  const prev = ag?.cost;
  const merged: AutoGenerationCost = {
    text: (prev?.text || 0) + cost.text,
    images: (prev?.images || 0) + cost.images,
    favicon: (prev?.favicon || 0) + cost.favicon,
    other: (prev?.other || 0) + cost.other,
    total: (prev?.total || 0) + cost.total,
  };
  patchAutoGeneration(projectName, { cost: merged });
}

/** Сохраняет актуальную оценку стоимости (для UI и лога, без суммирования). */
export function setAutoCost(
  projectName: string,
  cost: AutoGenerationCost
): void {
  patchAutoGeneration(projectName, { cost });
}

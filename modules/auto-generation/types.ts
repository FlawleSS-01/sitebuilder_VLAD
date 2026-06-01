export type GenerationMode = "manual" | "auto";

export type AutoGenerationStatus =
  | "pending"
  | "running"
  | "done"
  | "error";

export type AutoStepKey =
  | "creating"
  | "design"
  | "pages"
  | "images"
  | "favicon"
  | "qc"
  | "build"
  | "archive"
  | "upload"
  | "done";

export type AutoStepStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface AutoGenerationStep {
  key: AutoStepKey;
  label: string;
  status: AutoStepStatus;
  error?: string;
}

export interface AutoGenerationCost {
  text: number;
  images: number;
  favicon: number;
  other: number;
  total: number;
}

export interface AutoCustomPageSpec {
  name: string;
  slug?: string;
  blocks: string[];
}

export interface AutoDeployServerSpec {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath?: string;
  savedServerId?: string;
}

export interface AutoGenerationOptions {
  server: AutoDeployServerSpec;
  customPages?: AutoCustomPageSpec[];
  globalKeywords?: string;
}

export interface AutoGenerationSelection {
  templateName?: string;
  themeName?: string;
  pages?: Record<string, { blocks: string[]; blockTemplates: Record<string, string> }>;
}

export interface AutoGenerationState {
  mode: GenerationMode;
  status: AutoGenerationStatus;
  currentStep: AutoStepKey | null;
  steps: AutoGenerationStep[];
  error?: string;
  cost?: AutoGenerationCost;
  startedAt?: string;
  finishedAt?: string;
  options?: AutoGenerationOptions;
  selection?: AutoGenerationSelection;
  archivePath?: string;
}

export interface OpenAiUsageRecord {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export const AUTO_STEP_DEFINITIONS: Array<{ key: AutoStepKey; label: string }> = [
  { key: "creating", label: "Создаём проект" },
  { key: "design", label: "Подбираем дизайн" },
  { key: "pages", label: "Генерируем страницы и тексты" },
  { key: "images", label: "Генерируем изображения" },
  { key: "favicon", label: "Генерируем favicon" },
  { key: "qc", label: "Проверяем качество" },
  { key: "build", label: "Собираем build" },
  { key: "archive", label: "Создаём archive" },
  { key: "upload", label: "Загружаем на сервер" },
  { key: "done", label: "Готово" },
];

export function createInitialAutoSteps(): AutoGenerationStep[] {
  return AUTO_STEP_DEFINITIONS.map((s) => ({
    key: s.key,
    label: s.label,
    status: "pending",
  }));
}

export function createInitialAutoGenerationState(
  mode: GenerationMode = "manual"
): AutoGenerationState {
  return {
    mode,
    status: mode === "auto" ? "pending" : "done",
    currentStep: null,
    steps: mode === "auto" ? createInitialAutoSteps() : [],
  };
}

/** Normalize custom page specs from API/form payloads (blocks required, min 3). */
export function normalizeAutoCustomPages(
  raw: unknown
): AutoCustomPageSpec[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: AutoCustomPageSpec[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as { name?: string; slug?: string; blocks?: unknown };
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const blocks = Array.isArray(o.blocks)
      ? o.blocks.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
      : [];
    if (blocks.length < 3) continue;
    result.push({
      name,
      ...(typeof o.slug === "string" && o.slug.trim()
        ? { slug: o.slug.trim() }
        : {}),
      blocks,
    });
  }
  return result.length > 0 ? result : undefined;
}

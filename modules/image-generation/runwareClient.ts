import crypto from "node:crypto";
import type { ImageSizeOption } from "./types.js";

interface RunwareClientConfig {
  apiKey: string;
  apiUrl?: string;
  model?: string;
  guidance?: number;
  steps?: number;
  negativePrompt?: string;
  scheduler?: string;
  outputFormat?: "WEBP" | "PNG" | "JPEG";
  outputQuality?: number;
  checkNSFW?: boolean;
  includeCost?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  openaiQuality?: string;
  openaiBackground?: string;
  openaiStyle?: string;
}

let config: RunwareClientConfig | null = null;

const RUNWARE_MODEL_ALIASES: Record<string, string> = {
  "runware:sdxl-lightning": "civitai:102438@133677",
  "civitai:102438@133677": "civitai:102438@133677",
  "runware:101@1": "runware:101@1",
  "runware:400@1": "runware:400@1",
  "flux.1(dev)": "runware:101@1",
  "flux1-dev": "runware:101@1",
  "flux1": "runware:101@1",
  "flux.1": "runware:101@1",
  "flux.2": "runware:400@1",
  "flux2": "runware:400@1",
  "runware:400@3": "runware:400@3"
};

const resolveRunwareModel = (value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return RUNWARE_MODEL_ALIASES["runware:sdxl-lightning"];
  }
  return RUNWARE_MODEL_ALIASES[trimmed.toLowerCase()] ?? trimmed;
};

export const initRunwareClient = (clientConfig: RunwareClientConfig): void => {
  config = {
    ...clientConfig,
    apiUrl: clientConfig.apiUrl ?? "https://api.runware.ai/v1",
    model: resolveRunwareModel(clientConfig.model),
    guidance: clientConfig.guidance ?? 7,
    steps: clientConfig.steps ?? 28,
    negativePrompt:
      clientConfig.negativePrompt ??
      // Strong negatives so Flux doesn't drift away from a clear casino scene
      // into manuscript drawings, abstract art, anime, low-quality renders or
      // text artefacts. These keywords were the cause of "странные" images
      // that didn't look like a casino at all.
      "text, watermark, letters, words, numbers, typography, captions, logos, UI, low quality, blurry, lowres, jpeg artefacts, deformed, ugly, sketch, manuscript, parchment, ancient illustration, historical drawing, line art, doodle, cartoon, anime, child drawing, abstract art, painting, oil painting, occult symbols, religious iconography",
    outputFormat: clientConfig.outputFormat ?? "WEBP",
    outputQuality: clientConfig.outputQuality ?? 75,
    maxRetries: clientConfig.maxRetries ?? 3,
    retryDelayMs: clientConfig.retryDelayMs ?? 1000,
  };
};

const getConfig = (): RunwareClientConfig => {
  if (!config) {
    throw new Error(
      "Runware client not initialized. Call initRunwareClient() first."
    );
  }
  return config;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;

  if (error instanceof TypeError && /fetch failed/i.test((error as Error).message)) {
    return true;
  }
  if (error instanceof SyntaxError) {
    return true;
  }

  const code = (error as { code?: string }).code;
  if (
    code &&
    ["UND_ERR_SOCKET", "ECONNRESET", "ETIMEDOUT", "RUNWARE_JSON_PARSE"].includes(
      code
    )
  ) {
    return true;
  }

  const cause = (error as { cause?: { code?: string } }).cause;
  const causeCode = cause?.code;
  if (
    causeCode &&
    ["UND_ERR_SOCKET", "ECONNRESET", "ETIMEDOUT"].includes(causeCode)
  ) {
    return true;
  }

  return false;
};

const parseSizeToDimensions = (
  size: ImageSizeOption
): { width: number; height: number } => {
  const [widthStr, heightStr] = size.split("x");
  const width = Number.parseInt(widthStr ?? "0", 10);
  const height = Number.parseInt(heightStr ?? "0", 10);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(`Invalid image size provided: ${size}`);
  }

  return { width, height };
};

const normalizeDimensionsForOpenAIModel = (
  width: number,
  height: number,
  aspect: ImageSizeOption
): { width: number; height: number } => {
  if (aspect === "1024x1024") {
    return { width: 1024, height: 1024 };
  }
  if (aspect === "1792x1024") {
    return { width: 1536, height: 1024 };
  }
  if (aspect === "1024x1792") {
    return { width: 1024, height: 1536 };
  }
  return { width: 1024, height: 1024 };
};

const isLikelyBase64 = (value: string): boolean =>
  value.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(value);

const extractRunwareValue = (
  payload: unknown,
  matcher: (entry: { key: string; value: string }) => string | undefined
): string | undefined => {
  if (!payload || typeof payload !== "object") return undefined;

  const queue: unknown[] = [payload];
  const seen = new Set<unknown>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    for (const [key, value] of Object.entries(
      current as Record<string, unknown>
    )) {
      if (typeof value === "string") {
        const matched = matcher({ key, value });
        if (matched) return matched;
      } else if (Array.isArray(value) || (value && typeof value === "object")) {
        queue.push(value);
      }
    }
  }

  return undefined;
};

const extractBase64 = (payload: unknown): string | undefined =>
  extractRunwareValue(payload, ({ key, value }) => {
    if (/base64|b64/i.test(key) || isLikelyBase64(value)) {
      return value;
    }
    return undefined;
  });

const extractImageUrl = (payload: unknown): string | undefined =>
  extractRunwareValue(payload, ({ key, value }) => {
    if (/url/i.test(key) && /^https?:\/\//i.test(value)) {
      return value;
    }
    return undefined;
  });

const downloadImageAsBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Runware image download failed (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
};

export const generateImageRunware = async (
  prompt: string,
  size: ImageSizeOption,
  modelOverride?: string,
  /** Для wordmark-логотипов и т.п.: не использовать глобальный negative с запретом текста */
  negativePromptOverride?: string
): Promise<string> => {
  const cfg = getConfig();

  const model = modelOverride
    ? resolveRunwareModel(modelOverride)
    : cfg.model!;
  const { width, height } = parseSizeToDimensions(size);
  const isOpenAIModel = model.startsWith("openai:");

  const { width: finalWidth, height: finalHeight } = isOpenAIModel
    ? normalizeDimensionsForOpenAIModel(width, height, size)
    : { width, height };

  const task: Record<string, unknown> = {
    taskType: "imageInference",
    taskUUID: crypto.randomUUID(),
    model,
    positivePrompt: prompt,
    negativePrompt: negativePromptOverride ?? cfg.negativePrompt,
    width: finalWidth,
    height: finalHeight,
    numberResults: 1,
    steps: cfg.steps,
    guidanceScale: cfg.guidance,
    outputType: "base64Data",
    scheduler: cfg.scheduler,
    outputFormat: cfg.outputFormat,
    outputQuality: cfg.outputQuality,
    checkNSFW: cfg.checkNSFW,
    includeCost: cfg.includeCost,
  };

  if (isOpenAIModel) {
    delete task.steps;
    delete task.guidanceScale;
    delete task.negativePrompt;
    task.providerSettings = {
      openai: {
        quality: cfg.openaiQuality ?? "high",
        background: cfg.openaiBackground ?? "opaque",
        ...(cfg.openaiStyle ? { style: cfg.openaiStyle } : {}),
      },
    };
  }

  Object.keys(task).forEach((key) => {
    if (task[key] === undefined) delete task[key];
  });

  let attempt = 0;
  let lastError: unknown;
  const maxRetries = cfg.maxRetries!;
  const retryDelayMs = cfg.retryDelayMs!;
  const requestTimeoutMs = Math.max(
    30_000,
    parseInt(process.env.RUNWARE_REQUEST_TIMEOUT_MS || "180000", 10) || 180_000
  );

  while (attempt < maxRetries) {
    attempt++;
    try {
      const response = await fetch(cfg.apiUrl!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify([task]),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      if (!response.ok) {
        let text: string;
        try {
          text = await response.text();
        } catch {
          text = response.statusText;
        }
        throw new Error(`Runware API error (${response.status}): ${text}`);
      }

      const text = await response.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch (error) {
        const parseError =
          error instanceof Error ? error : new Error(String(error));
        (parseError as { code?: string }).code = "RUNWARE_JSON_PARSE";
        throw parseError;
      }

      let base64 =
        (json.data as any)?.[0]?.b64_json ??
        (json.data as any)?.[0]?.base64 ??
        (json.data as any)?.[0]?.image_base64 ??
        (json.data as any)?.[0]?.outputs?.[0]?.image_base64 ??
        (json.data as any)?.[0]?.outputs?.[0]?.images?.[0]?.base64 ??
        (json.output as any)?.[0]?.image_base64 ??
        (json.images as any)?.[0]?.base64 ??
        extractBase64(json) ??
        null;

      if (!base64) {
        const fallbackUrl = extractImageUrl(json);
        if (fallbackUrl) {
          base64 = await downloadImageAsBase64(fallbackUrl);
        }
      }

      if (!base64) {
        const preview = JSON.stringify(json).slice(0, 400);
        throw new Error(
          `Runware API returned empty image payload (preview: ${preview})`
        );
      }

      return base64;
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= maxRetries;

      if (!shouldRetryError(error) || isLastAttempt) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      const delay = retryDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `[runware] Request failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Runware request failed");
};

export const getModelAliases = (): Record<string, string> => ({
  ...RUNWARE_MODEL_ALIASES,
});


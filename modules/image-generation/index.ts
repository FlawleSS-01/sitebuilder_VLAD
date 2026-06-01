import { initRunwareClient, generateImageRunware } from "./runwareClient.js";
import type { ImageSizeOption } from "./types.js";

export type { ImageSizeOption };
export { parseImageSize } from "./types.js";

export const initImageGeneration = (config: {
  runwareApiKey: string;
  runwareApiUrl?: string;
  runwareModel?: string;
  runwareGuidance?: number;
  runwareSteps?: number;
  runwareNegativePrompt?: string;
}): void => {
  initRunwareClient({
    apiKey: config.runwareApiKey,
    apiUrl: config.runwareApiUrl,
    model: config.runwareModel,
    guidance: config.runwareGuidance,
    steps: config.runwareSteps,
    negativePrompt: config.runwareNegativePrompt,
  });
};

export const generateImage = async (
  prompt: string,
  size: ImageSizeOption,
  modelOverride?: string,
  negativePromptOverride?: string
): Promise<string> => {
  return generateImageRunware(prompt, size, modelOverride, negativePromptOverride);
};

export const saveBase64ToFile = async (
  base64: string,
  filePath: string
): Promise<void> => {
  const fs = await import("fs");
  const path = await import("path");

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const buffer = Buffer.from(base64, "base64");
  fs.writeFileSync(filePath, buffer);
};

export const generateAndSaveImage = async (
  prompt: string,
  size: ImageSizeOption,
  filePath: string,
  modelOverride?: string,
  negativePromptOverride?: string
): Promise<{ base64: string; filePath: string }> => {
  const base64 = await generateImage(
    prompt,
    size,
    modelOverride,
    negativePromptOverride
  );
  await saveBase64ToFile(base64, filePath);
  return { base64, filePath };
};

import { initImageGeneration } from "./index.js";

let runwareInitialized = false;

/** Idempotent Runware client init (required before generateAndSaveImage). */
export function ensureRunwareInitialized(): void {
  if (runwareInitialized || !process.env.RUNWARE_API_KEY?.trim()) {
    return;
  }
  initImageGeneration({
    runwareApiKey: process.env.RUNWARE_API_KEY,
    runwareApiUrl: process.env.RUNWARE_API_URL,
    runwareModel: process.env.RUNWARE_MODEL || "flux.2",
    runwareGuidance: process.env.RUNWARE_GUIDANCE
      ? parseInt(process.env.RUNWARE_GUIDANCE, 10)
      : undefined,
    runwareSteps: process.env.RUNWARE_STEPS
      ? parseInt(process.env.RUNWARE_STEPS, 10)
      : undefined,
  });
  runwareInitialized = true;
}

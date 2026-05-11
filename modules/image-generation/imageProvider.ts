/**
 * IMAGE_PROVIDER=runware (default) — генерация через Runware при наличии RUNWARE_API_KEY.
 * IMAGE_PROVIDER=placeholder — локальные заглушки (sharp), без Runware и без списания кредитов.
 */
export type ImageProviderMode = "runware" | "placeholder";

export function getImageProviderMode(): ImageProviderMode {
  const raw = (process.env.IMAGE_PROVIDER || "runware").toLowerCase().trim();
  if (raw === "placeholder" || raw === "none" || raw === "local") {
    return "placeholder";
  }
  return "runware";
}

export function shouldUseRunware(): boolean {
  if (getImageProviderMode() === "placeholder") {
    return false;
  }
  return Boolean(process.env.RUNWARE_API_KEY?.trim());
}

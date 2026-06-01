import type { AutoGenerationCost, OpenAiUsageRecord } from "./types.js";

function envNum(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** USD per 1K tokens (input + output averaged if single rate). */
export function getOpenAiPricePer1k(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("gpt-5")) {
    return envNum("SITEBUILDER_COST_GPT5_PER_1K", 0.005);
  }
  if (m.includes("gpt-4o-mini")) {
    return envNum("SITEBUILDER_COST_GPT4O_MINI_PER_1K", 0.0003);
  }
  if (m.includes("gpt-4o")) {
    return envNum("SITEBUILDER_COST_GPT4O_PER_1K", 0.005);
  }
  return envNum("SITEBUILDER_COST_OPENAI_DEFAULT_PER_1K", 0.001);
}

export function getRunwarePricePerImage(): number {
  return envNum("SITEBUILDER_COST_RUNWARE_PER_IMAGE", 0.04);
}

export function createEmptyCost(): AutoGenerationCost {
  return { text: 0, images: 0, favicon: 0, other: 0, total: 0 };
}

export function addOpenAiUsageCost(
  cost: AutoGenerationCost,
  usage: OpenAiUsageRecord | null | undefined
): void {
  if (!usage || usage.totalTokens <= 0) return;
  const rate = getOpenAiPricePer1k(usage.model);
  const usd = (usage.totalTokens / 1000) * rate;
  cost.text += usd;
  cost.total += usd;
}

export function addImageCost(cost: AutoGenerationCost, count: number): void {
  if (count <= 0) return;
  const usd = count * getRunwarePricePerImage();
  cost.images += usd;
  cost.total += usd;
}

export function addRunwareReportedCost(
  cost: AutoGenerationCost,
  usd: number | undefined
): void {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return;
  cost.images += usd;
  cost.total += usd;
}

export function addFaviconCost(cost: AutoGenerationCost, count = 1): void {
  if (count <= 0) return;
  const usd = count * getRunwarePricePerImage();
  cost.favicon += usd;
  cost.total += usd;
}

export function formatCostLogLine(cost: AutoGenerationCost): string {
  const c = roundCost(cost);
  return (
    `Стоимость: итог $${c.total.toFixed(4)} | тексты $${c.text.toFixed(4)} | ` +
    `изображения $${c.images.toFixed(4)} | favicon $${c.favicon.toFixed(4)} | ` +
    `прочее $${c.other.toFixed(4)}`
  );
}

export function roundCost(cost: AutoGenerationCost): AutoGenerationCost {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return {
    text: r(cost.text),
    images: r(cost.images),
    favicon: r(cost.favicon),
    other: r(cost.other),
    total: r(cost.total),
  };
}

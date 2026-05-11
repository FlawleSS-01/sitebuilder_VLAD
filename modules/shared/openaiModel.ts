/**
 * Models that reject custom temperature (OpenAI returns 400 if temperature !== default).
 */
export function modelSupportsCustomTemperature(model: string): boolean {
  const m = (model || "").trim().toLowerCase();
  if (!m) return true;
  if (m.startsWith("gpt-5")) return false;
  if (m.startsWith("o1") || m.startsWith("o3")) return false;
  return true;
}

import type OpenAI from "openai";

/** Извлекает текст из ответа Chat Completions (в т.ч. multipart content). */
export function extractChatCompletionText(
  completion: OpenAI.Chat.Completions.ChatCompletion
): string {
  const choice = completion.choices[0];
  if (!choice?.message) return "";

  const content = choice.message.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "type" in part) {
          const p = part as { type?: string; text?: string };
          if (p.type === "text" && typeof p.text === "string") return p.text;
        }
        return "";
      })
      .join("")
      .trim();
    if (joined) return joined;
  }

  return "";
}

export function describeEmptyCompletion(
  completion: OpenAI.Chat.Completions.ChatCompletion
): string {
  const choice = completion.choices[0];
  const refusal =
    choice?.message && "refusal" in choice.message
      ? String((choice.message as { refusal?: string }).refusal || "")
      : "";
  return [
    `model=${completion.model}`,
    `finish_reason=${choice?.finish_reason ?? "unknown"}`,
    refusal ? `refusal=${refusal.slice(0, 200)}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

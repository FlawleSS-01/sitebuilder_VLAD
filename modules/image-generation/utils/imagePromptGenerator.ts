import OpenAI from "openai";
import { modelSupportsCustomTemperature } from "../../shared/openaiModel.js";

export interface ImagePromptContext {
  brand: string;
  country: string; // country name or "NO COUNTRY"
  language: string; // human-readable, e.g. "English"
  pageType: string; // "homepage", "casino", "slots", "games", "betting", "app", "login", or custom name
  pageName?: string; // for custom pages
  imageSlot: 1 | 2 | 3; // 1 = hero banner, 2 = mid-section, 3 = closing illustration
  variation?: string | number; // optional seed/variation hint to keep prompts diverse on regeneration
}

export interface ImagePromptResult {
  /** Concise SEO-ready alt for the rendered image. */
  alt: string;
  /** SEO-ready title attribute / SEO title for the rendered image. */
  title: string;
  /**
   * Final prompt that is fed to the image-generation backend (Runware / Flux / etc.).
   * Built from the alt and enriched with style tokens that produce a
   * bright, premium casino-style picture (no text, no logos, no watermarks).
   */
  prompt: string;
}

const SLOT_BRIEFS: Record<number, { role: string; layout: string; mood: string }> = {
  1: {
    role: "primary hero banner",
    layout: "wide cinematic horizontal composition, central focal point, room for overlay heading on the left",
    mood: "spectacular, dramatic, welcoming, jackpot energy",
  },
  2: {
    role: "mid-section illustration",
    layout: "balanced horizontal scene, soft depth of field, supportive secondary visual",
    mood: "lively, inviting, premium product showcase",
  },
  3: {
    role: "closing call-to-action visual",
    layout: "horizontal celebratory composition, dynamic perspective, energetic final hook",
    mood: "exciting, victorious, big-win celebration",
  },
};

const PAGE_BRIEFS: Record<string, string> = {
  homepage:
    "the homepage of an online casino — a glamorous casino floor montage with glowing neon slot machines, premium cards and chips, gold confetti, dramatic stage lighting",
  main:
    "the main landing page of an online casino — a glamorous casino floor montage with glowing neon slot machines, premium cards and chips, gold confetti, dramatic stage lighting",
  casino:
    "an online casino lobby showcase — luxurious casino interior, glowing roulette wheel, baccarat & blackjack tables, chandeliers, plush velvet, gold accents",
  slots:
    "online slot machines — colorful slot reels with cherries, sevens, bars, golden coins flying, jackpot screen lit up, neon arcade vibe",
  games:
    "a wide selection of casino games — slot reels, roulette wheel, blackjack table, dice, playing cards fanned out, glowing UI accents",
  betting:
    "a sports betting hub — stadium lights, dynamic athletes silhouettes, betting odds and ticket motifs, blue and gold accents, energetic crowd",
  app:
    "a mobile casino app showcase — modern smartphone with glowing slot interface, particles and coins floating, soft gradient background, premium product render",
  login:
    "a secure account/login illustration — abstract casino card design with glowing security shield, padlock motif, neon aura, soft luxury background",
};

/**
 * Returns true if the value isn't a real targetable country and should be
 * treated like "no specific country" (e.g. multi-region projects that
 * shouldn't lock the picture to a flag/landmark).
 */
const isGenericCountry = (country?: string): boolean => {
  const c = (country || "").trim().toUpperCase();
  if (!c) return true;
  return (
    c === "NO COUNTRY" ||
    c === "MULTI-GEO" ||
    c === "MULTI" ||
    c === "GLOBAL" ||
    c === "WORLDWIDE" ||
    c === "INTERNATIONAL"
  );
};

const COUNTRY_FLAVOR = (country?: string): string => {
  if (isGenericCountry(country)) return "";
  return ` Subtle cultural cues from ${country!.trim()} can appear (architectural silhouette, flag colors as accents, regional motif), kept tasteful and in the background without dominating the image.`;
};

const buildFallback = (ctx: ImagePromptContext): ImagePromptResult => {
  const slot = SLOT_BRIEFS[ctx.imageSlot] || SLOT_BRIEFS[1];
  const pageBrief = PAGE_BRIEFS[ctx.pageType] || PAGE_BRIEFS.homepage;
  const country = isGenericCountry(ctx.country) ? "" : ctx.country.trim();
  const altBase = country
    ? `${ctx.brand} online casino in ${country} — ${ctx.pageType} ${slot.role}`
    : `${ctx.brand} online casino — ${ctx.pageType} ${slot.role}`;
  const titleBase = country
    ? `${ctx.brand} ${ctx.pageType} | online casino in ${country}`
    : `${ctx.brand} ${ctx.pageType} | online casino`;
  const promptText = [
    "Online casino marketing visual.",
    "Mandatory subject: a glamorous casino scene with at least three of the following clearly visible — glowing slot machine reels with cherries/sevens/bars, a roulette wheel, a green felt blackjack table, a fan of playing cards, stacks of poker chips, golden coins flying through the air, dice, a jackpot light-up display.",
    `Page-specific focus: ${pageBrief}.`,
    `Composition: ${slot.layout}.`,
    `Mood: ${slot.mood}.`,
    "Render style: cinematic photo-real 3D render, glossy materials, polished gold and chrome, neon rim lighting, dramatic studio bokeh.",
    "Color palette: rich gold, deep purple, electric blue, neon magenta with soft bloom.",
    "Quality: ultra-detailed, sharp focus, 8k, hyper-real, premium marketing photography.",
    "Strict negatives: NO text, NO letters, NO words, NO numbers, NO logos, NO watermarks, NO UI overlays, NO people in foreground, NOT abstract, NOT a sketch, NOT a manuscript drawing, NOT a historical illustration, NOT cartoon, NOT anime.",
    COUNTRY_FLAVOR(ctx.country).trim(),
  ]
    .filter(Boolean)
    .join(" ");
  return { alt: altBase, title: titleBase, prompt: promptText };
};

/**
 * Generates SEO-ready alt + title for an image AND a rich casino-themed
 * generation prompt, all in one OpenAI call.
 *
 * The flow is: text-context -> alt/title -> use the alt/title as the
 * conceptual seed of the image-generation prompt. This guarantees that the
 * image we render and the alt we save are semantically aligned.
 *
 * Falls back to a deterministic local prompt when OpenAI is unavailable.
 */
export const generateImagePromptAndAlt = async (
  ctx: ImagePromptContext
): Promise<ImagePromptResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[image-generation] OPENAI_API_KEY не настроен — используется локальный fallback для alt/prompt"
    );
    return buildFallback(ctx);
  }

  const noCountry = isGenericCountry(ctx.country);
  const model = noCountry
    ? process.env.OPENAI_MODEL_ALTTITLE_NO_GEO ||
      process.env.OPENAI_MODEL_ALTTITLE ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini"
    : process.env.OPENAI_MODEL_ALTTITLE ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini";

  const slot = SLOT_BRIEFS[ctx.imageSlot] || SLOT_BRIEFS[1];
  const pageBrief = PAGE_BRIEFS[ctx.pageType] || PAGE_BRIEFS.homepage;
  const countryLine = noCountry
    ? "Target country: not specified — do NOT mention any country, region, language, or nationality in the alt/title or in the picture."
    : `Target country: ${ctx.country}.`;

  const systemPrompt = [
    "You write SEO metadata AND image-generation prompts for an ONLINE CASINO marketing landing page.",
    "You ALWAYS return strict JSON with exactly the keys: alt, title, prompt.",
    "Rules for `alt`: 90–140 characters, plain prose, includes the brand and the page topic, describes what is actually shown in the picture.",
    "Rules for `title`: 50–80 characters, marketing-friendly, includes the brand.",
    "Rules for `prompt`: 70–120 words, English, image-generation prompt.",
    "The prompt MUST be UNAMBIGUOUSLY about an online casino. The picture MUST clearly show at least three of these casino elements: glowing slot machine reels with cherries/sevens/bars, a roulette wheel, a green felt blackjack/poker table, a fan of playing cards, stacks of poker chips, golden coins flying, dice, a jackpot screen.",
    "The prompt MUST describe a vivid, bright, colorful, premium online-casino visual — neon glow, golden coins, chips, cards, glossy materials, dramatic studio rim-lighting, cinematic photo-real or 3D-render style, ultra-detailed, 8k, sharp focus.",
    "The prompt MUST forbid any text in the image. End the prompt with the literal phrase: \"no text, no letters, no words, no numbers, no logos, no watermarks, no UI, no people in foreground, not abstract, not a sketch, not a manuscript, not historical, not cartoon, not anime\".",
    "The prompt MUST NOT include the brand name as text inside the picture (the brand name is conveyed by the alt/title only).",
    "The picture must look like an asset for a real, modern online casino landing page (e.g. like Stake, BC.Game, Bet365 promo art).",
    "If you would otherwise produce something abstract, ornamental, historical, hand-drawn, scientific, or unrelated to gambling — STOP and rewrite around concrete casino props (slots, roulette, chips, cards, dice).",
  ].join(" ");

  const userPrompt = [
    `Brand: ${ctx.brand}.`,
    `Brand language for alt/title: ${ctx.language}.`,
    countryLine,
    `Page: ${ctx.pageName || ctx.pageType}.`,
    `Page subject brief: ${pageBrief}.`,
    `Image slot: ${ctx.imageSlot} of 3 (${slot.role}). Composition: ${slot.layout}. Mood: ${slot.mood}.`,
    ctx.variation !== undefined
      ? `Variation hint (use it to make this prompt different from neighbors): ${ctx.variation}.`
      : "",
    "Output strict JSON. Example shape: {\"alt\": \"...\", \"title\": \"...\", \"prompt\": \"...\"}.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const openai = new OpenAI({ apiKey: apiKey.trim() });
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(modelSupportsCustomTemperature(model) ? { temperature: 0.85 } : {}),
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      console.warn(
        "[image-generation] Пустой ответ OpenAI при генерации alt/prompt — используется локальный fallback"
      );
      return buildFallback(ctx);
    }

    let parsed: Partial<ImagePromptResult>;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      console.warn(
        "[image-generation] Невалидный JSON от OpenAI для alt/prompt:",
        parseError
      );
      return buildFallback(ctx);
    }

    const alt = typeof parsed.alt === "string" && parsed.alt.trim() ? parsed.alt.trim() : "";
    const title =
      typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "";
    const promptOut =
      typeof parsed.prompt === "string" && parsed.prompt.trim() ? parsed.prompt.trim() : "";

    if (!alt || !title || !promptOut) {
      console.warn(
        "[image-generation] OpenAI вернул не все поля alt/title/prompt — используется локальный fallback"
      );
      return buildFallback(ctx);
    }

    // Hard-guard: ensure the no-text + casino-only constraints are present
    // in the image prompt regardless of what the LLM produced. Flux loves
    // to hallucinate text into casino scenes if not explicitly forbidden.
    const lowered = promptOut.toLowerCase();
    const guards: string[] = [];
    if (!lowered.includes("no text") && !lowered.includes("no letters")) {
      guards.push(
        "no text, no letters, no words, no numbers, no logos, no watermarks, no UI"
      );
    }
    if (!lowered.includes("not a sketch") && !lowered.includes("not abstract")) {
      guards.push(
        "not abstract, not a sketch, not a manuscript, not historical, not cartoon, not anime"
      );
    }
    if (
      !lowered.includes("slot") &&
      !lowered.includes("roulette") &&
      !lowered.includes("chip") &&
      !lowered.includes("card")
    ) {
      // The LLM somehow produced a non-casino prompt — splice in a
      // casino subject so Runware/Flux gets a clear gambling scene.
      guards.unshift(
        "Mandatory casino subject: glowing slot machines, a roulette wheel, poker chips, playing cards and golden coins arranged in a glossy 3D render"
      );
    }
    const enforcement = guards.length ? ` ${guards.join(". ")}.` : "";

    return { alt, title, prompt: promptOut + enforcement };
  } catch (error: any) {
    console.error(
      "[image-generation] Ошибка при генерации alt/prompt через OpenAI:",
      error?.message || error
    );
    return buildFallback(ctx);
  }
};

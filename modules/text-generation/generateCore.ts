import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { validateAndParseJSON } from "../text-generation/utils/jsonValidator.js";
import {
  getStructureTemplate,
  generateSystemPrompt,
  generateUserPrompt,
} from "../text-generation/prompts/index.js";
import {
  getStructureForBlock,
  getStructureTemplateWithCustomTemplates,
} from "../text-generation/prompts/templates.js";
import {
  generatePageVariants,
  addVariantsToPageData,
  generateListVariant,
} from "../text-generation/utils/variantGenerator.js";
import { modelSupportsCustomTemperature } from "../shared/openaiModel.js";
import { buildReferenceGuidance } from "./referenceTexts.js";
import {
  extractChatCompletionText,
  describeEmptyCompletion,
} from "../shared/openaiCompletion.js";
import type { OpenAiUsageRecord } from "../auto-generation/types.js";

const DEFAULT_OPENAI_MODEL =
  process.env.OPENAI_MODEL_DEFAULT || "gpt-4o-mini";

const PAGE_FILE_MAP_FOR_UNIQUENESS: Record<string, string> = {
  homepage: "main.json",
  casino: "casino.json",
  slots: "slots.json",
  games: "games.json",
  betting: "betting.json",
  app: "app.json",
  login: "login.json",
};

export function getModelForPageType(pageType: string): string {
  const modelMap: Record<string, string> = {
    homepage:
      process.env.OPENAI_MODEL_HOMEPAGE ||
      process.env.OPENAI_MODEL ||
      DEFAULT_OPENAI_MODEL,
    casino:
      process.env.OPENAI_MODEL_CASINO ||
      process.env.OPENAI_MODEL ||
      DEFAULT_OPENAI_MODEL,
    slots:
      process.env.OPENAI_MODEL_SLOTS ||
      process.env.OPENAI_MODEL ||
      DEFAULT_OPENAI_MODEL,
    games:
      process.env.OPENAI_MODEL_GAMES ||
      process.env.OPENAI_MODEL ||
      DEFAULT_OPENAI_MODEL,
    betting:
      process.env.OPENAI_MODEL_BETTING ||
      process.env.OPENAI_MODEL ||
      DEFAULT_OPENAI_MODEL,
    app:
      process.env.OPENAI_MODEL_APP ||
      process.env.OPENAI_MODEL ||
      DEFAULT_OPENAI_MODEL,
    login:
      process.env.OPENAI_MODEL_LOGIN ||
      process.env.OPENAI_MODEL ||
      DEFAULT_OPENAI_MODEL,
  };
  return modelMap[pageType] || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
}

function usageFromCompletion(
  model: string,
  completion: OpenAI.Chat.Completions.ChatCompletion
): OpenAiUsageRecord {
  const u = completion.usage;
  return {
    model,
    promptTokens: u?.prompt_tokens ?? 0,
    completionTokens: u?.completion_tokens ?? 0,
    totalTokens: u?.total_tokens ?? 0,
  };
}

async function buildUniquenessHint(
  projectName: string | undefined,
  excludePageType: string,
  language: string
): Promise<string | null> {
  if (!projectName) return null;
  try {
    const projectPath = path.join(process.cwd(), "projects", projectName);
    const pagesDir = path.join(projectPath, "src", "pages");
    if (!fs.existsSync(pagesDir)) return null;

    const lines: string[] = [];
    const seenFiles = new Set<string>();
    for (const file of fs.readdirSync(pagesDir)) {
      if (!file.endsWith(".json")) continue;
      if (file === "images.json" || file === "page-metadata.json") continue;
      const skipFile = PAGE_FILE_MAP_FOR_UNIQUENESS[excludePageType];
      if (skipFile && file === skipFile) continue;
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);

      try {
        const raw = fs.readFileSync(path.join(pagesDir, file), "utf-8");
        const data = JSON.parse(raw);
        const t = typeof data?.title === "string" ? data.title.trim() : "";
        const d =
          typeof data?.description === "string" ? data.description.trim() : "";
        if (t || d) {
          lines.push(
            `- ${file}: title="${t.slice(0, 110)}", description="${d.slice(0, 200)}"`
          );
        }
      } catch {
        /* ignore */
      }
      if (lines.length >= 8) break;
    }
    if (lines.length === 0) return null;

    const stamp = `seed=${Date.now().toString(36)}-${Math.floor(
      Math.random() * 1e6
    ).toString(36)}, target_language=${language}`;
    return [`Already used on sibling pages:`, ...lines, stamp].join("\n");
  } catch {
    return null;
  }
}

function loadProjectVariants(projectName?: string): Record<string, number> {
  if (!projectName) return generatePageVariants();
  try {
    const settingsPath = path.join(
      process.cwd(),
      "projects",
      projectName,
      "project-settings.json"
    );
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      if (settings.variants) return settings.variants;
    }
  } catch {
    /* ignore */
  }
  return generatePageVariants();
}

function requireOpenAi(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured");
  }
  return new OpenAI({ apiKey });
}

export interface GeneratePageContentInput {
  brand: string;
  language: string;
  country: string;
  domain: string;
  affiliateLink: string;
  pageType: string;
  blocks: string[];
  blockTemplates?: Record<string, string>;
  blockKeywords?: Record<string, string>;
  projectName?: string;
  /** Референс-файлы (docs/text-reference) для стиля/структуры. Если не заданы — выбираются случайно. */
  referenceFiles?: string[];
}

export async function generatePageContentCore(
  input: GeneratePageContentInput
): Promise<{ data: Record<string, unknown>; usage: OpenAiUsageRecord }> {
  const openai = requireOpenAi();
  const model = getModelForPageType(input.pageType);

  const structureTemplate =
    input.blockTemplates && Object.keys(input.blockTemplates).length > 0
      ? getStructureTemplateWithCustomTemplates(
          input.pageType,
          input.blocks,
          input.blockTemplates
        )
      : getStructureTemplate(input.pageType, input.blocks);

  const systemPrompt = generateSystemPrompt(
    input.language,
    input.brand,
    input.country,
    input.domain,
    input.affiliateLink,
    input.pageType,
    structureTemplate
  );
  const uniquenessHint = await buildUniquenessHint(
    input.projectName,
    input.pageType,
    input.language
  );
  const referenceGuidance = buildReferenceGuidance(
    input.pageType,
    input.referenceFiles
  );
  const userPrompt = generateUserPrompt(
    input.brand,
    input.language,
    input.country,
    input.blocks,
    input.pageType,
    uniquenessHint || undefined,
    input.blockKeywords,
    referenceGuidance || undefined
  );

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.7 } : {}),
    response_format: { type: "json_object" },
  });

  const responseText = extractChatCompletionText(completion);
  if (!responseText) {
    throw new Error(
      `Empty response from OpenAI (${describeEmptyCompletion(completion)})`
    );
  }

  const parsedJSON = validateAndParseJSON(
    responseText,
    input.pageType,
    "Play Now"
  );
  if (!parsedJSON) {
    throw new Error("Invalid JSON response from OpenAI");
  }

  const variants = loadProjectVariants(input.projectName);
  const data = addVariantsToPageData(parsedJSON, variants);

  return { data, usage: usageFromCompletion(model, completion) };
}

export interface GenerateCustomPageContentInput {
  brand: string;
  language: string;
  country: string;
  domain: string;
  affiliateLink: string;
  pageName: string;
  blocks: string[];
  blockTemplates?: Record<string, string>;
  blockKeywords?: Record<string, string>;
  projectName?: string;
  /** Референс-файлы (docs/text-reference) для стиля/структуры. Если не заданы — выбираются случайно. */
  referenceFiles?: string[];
}

export async function generateCustomPageContentCore(
  input: GenerateCustomPageContentInput
): Promise<{ data: Record<string, unknown>; usage: OpenAiUsageRecord }> {
  const openai = requireOpenAi();
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

  const structureTemplate: unknown[] = [];
  for (const block of input.blocks) {
    structureTemplate.push(
      getStructureForBlock(block, input.blockTemplates?.[block])
    );
  }

  const systemPrompt = generateSystemPrompt(
    input.language,
    input.brand,
    input.country,
    input.domain,
    input.affiliateLink,
    input.pageName,
    structureTemplate
  );
  const uniquenessHint = await buildUniquenessHint(
    input.projectName,
    input.pageName,
    input.language
  );
  const referenceGuidance = buildReferenceGuidance(
    input.pageName,
    input.referenceFiles
  );
  const userPrompt = generateUserPrompt(
    input.brand,
    input.language,
    input.country,
    input.blocks,
    input.pageName,
    uniquenessHint || undefined,
    input.blockKeywords,
    referenceGuidance || undefined
  );

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.7 } : {}),
    response_format: { type: "json_object" },
  });

  const responseText = extractChatCompletionText(completion);
  if (!responseText) {
    throw new Error(
      `Empty response from OpenAI (${describeEmptyCompletion(completion)})`
    );
  }

  const imgBase = input.pageName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const parsedJSON = validateAndParseJSON(responseText, imgBase, "Play Now");
  if (!parsedJSON) {
    throw new Error("Invalid JSON response from OpenAI");
  }

  const variants = loadProjectVariants(input.projectName);
  const data = addVariantsToPageData(parsedJSON, variants);

  return { data, usage: usageFromCompletion(model, completion) };
}

export interface GenerateFaqContentInput {
  brand: string;
  language: string;
  country: string;
  count: number;
  projectName?: string;
}

export async function generateFaqContentCore(
  input: GenerateFaqContentInput
): Promise<{ data: { faq: Record<string, unknown> }; usage: OpenAiUsageRecord }> {
  const openai = requireOpenAi();
  const model =
    process.env.OPENAI_MODEL_FAQ ||
    process.env.OPENAI_MODEL ||
    DEFAULT_OPENAI_MODEL;

  const systemPrompt = `You are a copywriter who creates FAQ content for online casinos. Generate clear, helpful questions and answers that address common player concerns. Always respond with valid JSON only.`;

  const userPrompt = `Generate ${input.count} frequently asked questions (FAQ) with answers in ${input.language} for the online casino brand ${input.brand}. The text must be localized for players in ${input.country}.

Return the result as a JSON object with the following structure:
{
  "faq": {
    "h2": "Brand Name Casino FAQ",
    "text": "A brief introductory paragraph explaining what this FAQ section covers (2-3 sentences).",
    "items": [
      {
        "question": "Question text here",
        "answer": "Answer text here (2-4 sentences, clear and helpful)"
      }
    ]
  }
}

Make sure:
- h2 should be the brand name followed by "Casino FAQ" (e.g., "${input.brand} Casino FAQ")
- text is a brief introduction paragraph (2-3 sentences) explaining what the FAQ covers
- Questions are relevant to online casino players
- Answers are clear, helpful, and accurate (2-4 sentences each)
- Content is appropriate for ${input.country} players
- All text is in ${input.language}
- Return valid JSON only, no markdown or explanations`;

  let lastEmptyDetail = "";
  let completion: OpenAI.Chat.Completions.ChatCompletion | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 8000,
      ...(modelSupportsCustomTemperature(model) ? { temperature: 0.7 } : {}),
      response_format: { type: "json_object" },
    });

    const responseText = extractChatCompletionText(completion);
    if (responseText) {
      let parsedJSON: { faq?: Record<string, unknown> };
      try {
        let cleaned = responseText.trim();
        if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "");
          cleaned = cleaned.replace(/\n?```\s*$/, "");
          cleaned = cleaned.trim();
        }
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }
        parsedJSON = JSON.parse(cleaned);
      } catch {
        if (attempt < 2) {
          console.warn(
            `[text-generation] FAQ JSON parse failed (attempt ${attempt}), retrying…`
          );
          continue;
        }
        throw new Error("Invalid JSON response from OpenAI (FAQ)");
      }

      if (!parsedJSON.faq || typeof parsedJSON.faq !== "object") {
        if (attempt < 2) {
          console.warn(
            `[text-generation] FAQ missing faq object (attempt ${attempt}), retrying…`
          );
          continue;
        }
        throw new Error("Invalid FAQ structure: missing 'faq' object");
      }

      let faqVariant: number | null = null;
      if (input.projectName) {
        try {
          const settingsPath = path.join(
            process.cwd(),
            "projects",
            input.projectName,
            "project-settings.json"
          );
          if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
            if (settings.variants?.faqBlock !== undefined) {
              faqVariant = settings.variants.faqBlock;
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (faqVariant === null) {
        faqVariant = generateListVariant();
      }
      parsedJSON.faq.variant = faqVariant;

      return {
        data: { faq: parsedJSON.faq },
        usage: usageFromCompletion(model, completion),
      };
    }

    lastEmptyDetail = describeEmptyCompletion(completion);
    console.warn(
      `[text-generation] FAQ empty OpenAI response (attempt ${attempt}/2): ${lastEmptyDetail}`
    );
  }

  throw new Error(
    `Empty response from OpenAI (${lastEmptyDetail || "no completion"})`
  );
}

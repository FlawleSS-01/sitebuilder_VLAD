import { Request, Response } from "express";
import OpenAI from "openai";
import { validateAndParseJSON } from "./utils/jsonValidator.js";
import {
  getStructureTemplate,
  generateSystemPrompt,
  generateUserPrompt,
} from "./prompts/index.js";
import {
  getStructureForBlock,
  getStructureTemplateWithCustomTemplates,
} from "./prompts/templates.js";
import {
  generatePageVariants,
  addVariantsToPageData,
  generateListVariant,
} from "./utils/variantGenerator.js";
import { modelSupportsCustomTemperature } from "../shared/openaiModel.js";

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

/**
 * Reads existing pages of the project and returns a short string with
 * already-used title/description pairs. The prompt feeds this back to
 * the model so each new generation produces UNIQUE meta — no duplicate
 * titles across pages, which also helps SEO (Google penalises near-dup
 * meta).
 *
 * Returns null if no project context is available; the prompt then
 * skips the uniqueness signal entirely.
 */
async function buildUniquenessHint(
  projectName: string | undefined,
  excludePageType: string,
  language: string
): Promise<string | null> {
  if (!projectName) return null;
  try {
    const path = await import("path");
    const fs = await import("fs");
    const projectPath = path.join(process.cwd(), "projects", projectName);
    const pagesDir = path.join(projectPath, "src", "pages");
    if (!fs.existsSync(pagesDir)) return null;

    const lines: string[] = [];
    const seenFiles = new Set<string>();
    for (const file of fs.readdirSync(pagesDir)) {
      if (!file.endsWith(".json")) continue;
      if (file === "images.json" || file === "page-metadata.json") continue;
      // Skip the file we're about to (re)generate — its OLD copy must
      // not anchor the model to repeat itself when regenerating the
      // same page.
      const skipFile = PAGE_FILE_MAP_FOR_UNIQUENESS[excludePageType];
      if (skipFile && file === skipFile) continue;
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);

      try {
        const raw = fs.readFileSync(path.join(pagesDir, file), "utf-8");
        const data = JSON.parse(raw);
        const t = typeof data?.title === "string" ? data.title.trim() : "";
        const d =
          typeof data?.description === "string"
            ? data.description.trim()
            : "";
        if (t || d) {
          lines.push(
            `- ${file}: title="${t.slice(0, 110)}", description="${d.slice(
              0,
              200
            )}"`
          );
        }
      } catch {
        /* ignore unreadable page files */
      }
      if (lines.length >= 8) break; // cap so prompt doesn't balloon
    }
    if (lines.length === 0) return null;

    // Add a fresh entropy stamp so even regenerating the SAME page
    // twice in a row produces different wording (the model also has
    // temperature, but the hint makes the variance explicit).
    const stamp = `seed=${Date.now().toString(36)}-${Math.floor(
      Math.random() * 1e6
    ).toString(36)}, target_language=${language}`;
    return [`Already used on sibling pages:`, ...lines, stamp].join("\n");
  } catch {
    return null;
  }
}

function openAiHttpDetails(error: any): {
  message: string;
  code?: string;
  status?: number;
  type?: string;
  requestId?: string;
} {
  const raw = error?.response?.data ?? error?.error ?? error;
  const nested =
    raw && typeof raw === "object" && "error" in raw
      ? (raw as any).error
      : raw;
  const msg =
    (typeof nested === "object" && nested?.message) ||
    (typeof raw === "object" && raw?.message) ||
    error?.message ||
    String(error);
  const code =
    (typeof nested === "object" && nested?.code) ||
    (typeof raw === "object" && raw?.code) ||
    error?.code;
  const status = error?.status ?? error?.response?.status;
  const type = typeof nested === "object" ? nested?.type : undefined;
  const hdrs = error?.response?.headers;
  const requestId =
    hdrs?.["x-request-id"] ||
    (hdrs && typeof hdrs.get === "function"
      ? hdrs.get("x-request-id")
      : undefined);
  return {
    message: typeof msg === "string" ? msg : JSON.stringify(msg),
    code: typeof code === "string" ? code : undefined,
    status,
    type: typeof type === "string" ? type : undefined,
    requestId: typeof requestId === "string" ? requestId : undefined,
  };
}

interface GenerateTextRequest {
  brand: string;
  language: string;
  country: string;
  domain: string;
  affiliateLink: string;
  pageType: string;
  blocks: string[];
  blockTemplates?: Record<string, string>; // Маппинг блоков на шаблоны (опционально, для ручного выбора)
  // Маппинг блоков на пользовательские ключевые слова (через запятую).
  // Используется, чтобы кастомные блоки генерировались строго вокруг
  // указанных тем, а не только по имени блока.
  blockKeywords?: Record<string, string>;
}

interface GenerateFAQRequest {
  brand: string;
  language: string;
  country: string;
  count: number;
  projectName?: string;
}

export const generateText = async (req: Request, res: Response) => {
  try {
    const {
      brand,
      language,
      country,
      domain,
      affiliateLink,
      pageType,
      blocks,
      blockTemplates,
      blockKeywords,
      projectName,
    } = req.body as GenerateTextRequest & { projectName?: string };

    // Validation
    if (!brand || !language || !country || !domain || !affiliateLink) {
      return res.status(400).json({
        error:
          "Missing required fields: brand, language, country, domain, affiliateLink",
      });
    }

    if (!pageType) {
      return res.status(400).json({
        error: "Missing required field: pageType",
      });
    }

    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({
        error: "Blocks must be a non-empty array",
      });
    }

    // Проверяем наличие API ключа
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "OpenAI API key is not configured",
      });
    }

    // Создаем клиент OpenAI с актуальным ключом
    const openai = new OpenAI({
      apiKey: apiKey.trim(), // Убираем возможные пробелы
    });

    // Получаем модель для конкретного типа страницы
    const getModelForPageType = (pageType: string): string => {
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
          process.env.OPENAI_MODEL_SLOTS || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
        games:
          process.env.OPENAI_MODEL_GAMES || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
        betting:
          process.env.OPENAI_MODEL_BETTING ||
          process.env.OPENAI_MODEL ||
          DEFAULT_OPENAI_MODEL,
        app:
          process.env.OPENAI_MODEL_APP || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
        login:
          process.env.OPENAI_MODEL_LOGIN || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      };
      return modelMap[pageType] || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    };

    const model = getModelForPageType(pageType);

    // Логируем информацию о ключе (первые и последние символы для безопасности)
    const keyPreview =
      apiKey.length > 10
        ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`
        : "***";
    console.log(
      `[text-generation] API ключ загружен: ${keyPreview}, длина: ${apiKey.length}`
    );

    // Если передан маппинг шаблонов (ручной выбор), используем его
    // Иначе используем автовыбор из маппинга страницы
    const structureTemplate =
      blockTemplates && Object.keys(blockTemplates).length > 0
        ? getStructureTemplateWithCustomTemplates(
            pageType,
            blocks,
            blockTemplates
          )
        : getStructureTemplate(pageType, blocks);

    const systemPrompt = generateSystemPrompt(
      language,
      brand,
      country,
      domain,
      affiliateLink,
      pageType,
      structureTemplate
    );
    const uniquenessHint = await buildUniquenessHint(
      projectName,
      pageType,
      language
    );
    const userPrompt = generateUserPrompt(
      brand,
      language,
      country,
      blocks,
      pageType,
      uniquenessHint || undefined,
      blockKeywords
    );

    console.log(
      `[text-generation] Генерация текста для страницы: ${pageType}, модель: ${model}${
        uniquenessHint ? " (uniqueness hint applied)" : ""
      }${blockKeywords ? " (block keywords applied)" : ""}`
    );

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(modelSupportsCustomTemperature(model) ? { temperature: 0.7 } : {}),
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content;
    if (!responseText) {
      return res.status(500).json({
        error: "Empty response from OpenAI",
      });
    }
    console.log("[text-generation] Получен ответ от OpenAI");

    // Validate and parse JSON
    const imgBase = pageType;
    const buttonText = "Play Now";
    const parsedJSON = validateAndParseJSON(responseText, imgBase, buttonText);

    if (!parsedJSON) {
      return res.status(500).json({
        error: "Invalid JSON response from OpenAI",
        rawResponse: responseText,
      });
    }

    // Получаем варианты стилей из project-settings.json проекта
    let variants: any = null;
    if (projectName) {
      try {
        const path = await import("path");
        const fs = await import("fs");
        const projectPath = path.join(process.cwd(), "projects", projectName);
        const settingsPath = path.join(projectPath, "project-settings.json");

        if (fs.existsSync(settingsPath)) {
          const settingsContent = fs.readFileSync(settingsPath, "utf-8");
          const settings = JSON.parse(settingsContent);
          if (settings.variants) {
            variants = settings.variants;
          }
        }
      } catch (err: any) {
        console.warn(
          "[text-generation] Не удалось загрузить варианты из project-settings.json:",
          err.message
        );
      }
    }

    // Если варианты не найдены, генерируем новые (fallback для старых проектов)
    if (!variants) {
      variants = generatePageVariants();
    }

    // Добавляем варианты стилей в JSON страницы
    const pageDataWithVariants = addVariantsToPageData(parsedJSON, variants);

    res.json({
      success: true,
      data: pageDataWithVariants,
    });
  } catch (error: any) {
    console.error("[text-generation] Ошибка:", error);
    const d = openAiHttpDetails(error);
    res.status(500).json({
      error: "Failed to generate text",
      message: d.message,
      code: d.code,
      status: d.status,
      type: d.type,
      requestId: d.requestId,
    });
  }
};

interface GenerateCustomPageRequest {
  brand: string;
  language: string;
  country: string;
  domain: string;
  affiliateLink: string;
  pageName: string;
  blocks: string[];
  blockTemplates?: Record<string, string>; // Маппинг блоков на шаблоны (опционально)
  // Пользовательские ключевые слова на каждый блок (через запятую).
  // Передаются с фронта при создании кастомной страницы, чтобы блок
  // был не "просто с таким названием", а реально про эти темы.
  blockKeywords?: Record<string, string>;
}

export const generateCustomPage = async (req: Request, res: Response) => {
  try {
    const {
      brand,
      language,
      country,
      domain,
      affiliateLink,
      pageName,
      blocks,
      blockTemplates,
      blockKeywords,
      projectName,
    } = req.body as GenerateCustomPageRequest & { projectName?: string };

    // Validation
    if (!brand || !language || !country || !domain || !affiliateLink) {
      return res.status(400).json({
        error:
          "Missing required fields: brand, language, country, domain, affiliateLink",
      });
    }

    if (!pageName) {
      return res.status(400).json({
        error: "Missing required field: pageName",
      });
    }

    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({
        error: "Blocks must be a non-empty array",
      });
    }

    // Проверяем наличие API ключа
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "OpenAI API key is not configured",
      });
    }

    // Создаем клиент OpenAI с актуальным ключом
    const openai = new OpenAI({
      apiKey: apiKey.trim(),
    });

    // Для кастомной страницы используем общую модель OPENAI_MODEL
    const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

    // Создаем структуру шаблона на основе блоков
    // Если передан маппинг шаблонов, используем его, иначе используем автопоиск
    const structureTemplate: any[] = [];

    blocks.forEach((block) => {
      const templateId = blockTemplates?.[block];
      const blockStructure = getStructureForBlock(block, templateId);
      structureTemplate.push(blockStructure);
    });

    // Логируем информацию о ключе
    const keyPreview =
      apiKey.length > 10
        ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`
        : "***";
    console.log(
      `[text-generation] API ключ загружен: ${keyPreview}, длина: ${apiKey.length}`
    );

    const systemPrompt = generateSystemPrompt(
      language,
      brand,
      country,
      domain,
      affiliateLink,
      pageName,
      structureTemplate
    );
    const uniquenessHint = await buildUniquenessHint(
      projectName,
      pageName,
      language
    );
    const userPrompt = generateUserPrompt(
      brand,
      language,
      country,
      blocks,
      pageName,
      uniquenessHint || undefined,
      blockKeywords
    );

    console.log(
      `[text-generation] Генерация кастомной страницы: ${pageName}, модель: ${model}${
        uniquenessHint ? " (uniqueness hint applied)" : ""
      }${blockKeywords ? " (block keywords applied)" : ""}`
    );

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(modelSupportsCustomTemperature(model) ? { temperature: 0.7 } : {}),
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content;
    if (!responseText) {
      return res.status(500).json({
        error: "Empty response from OpenAI",
      });
    }
    console.log(
      "[text-generation] Получен ответ от OpenAI для кастомной страницы"
    );

    // Validate and parse JSON
    // Используем название страницы в нижнем регистре для имени картинки
    const imgBase = pageName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const buttonText = "Play Now";
    const parsedJSON = validateAndParseJSON(responseText, imgBase, buttonText);

    if (!parsedJSON) {
      return res.status(500).json({
        error: "Invalid JSON response from OpenAI",
        rawResponse: responseText,
      });
    }

    // Получаем варианты стилей из project-settings.json проекта
    let variants: any = null;
    if (projectName) {
      try {
        const path = await import("path");
        const fs = await import("fs");
        const projectPath = path.join(process.cwd(), "projects", projectName);
        const settingsPath = path.join(projectPath, "project-settings.json");

        if (fs.existsSync(settingsPath)) {
          const settingsContent = fs.readFileSync(settingsPath, "utf-8");
          const settings = JSON.parse(settingsContent);
          if (settings.variants) {
            variants = settings.variants;
          }
        }
      } catch (err: any) {
        console.warn(
          "[text-generation] Не удалось загрузить варианты из project-settings.json:",
          err.message
        );
      }
    }

    // Если варианты не найдены, генерируем новые (fallback для старых проектов)
    if (!variants) {
      variants = generatePageVariants();
    }

    // Добавляем варианты стилей в JSON страницы
    const pageDataWithVariants = addVariantsToPageData(parsedJSON, variants);

    res.json({
      success: true,
      data: pageDataWithVariants,
    });
  } catch (error: any) {
    console.error(
      "[text-generation] Ошибка при генерации кастомной страницы:",
      error
    );
    const d = openAiHttpDetails(error);
    res.status(500).json({
      error: "Failed to generate custom page",
      message: d.message,
      code: d.code,
      status: d.status,
      type: d.type,
      requestId: d.requestId,
    });
  }
};

interface GenerateSingleBlockRequest {
  brand: string;
  language: string;
  country: string;
  domain: string;
  affiliateLink: string;
  pageType: string;
  blockType: string;
  blockTemplate?: string;
  projectName: string;
  blockIndex: number;
  pageName?: string;
  isCustom?: boolean;
  // Пользовательские ключевые слова для этого блока, через запятую.
  // Используются при ре-генерации одного блока, чтобы получить контент
  // именно по нужным темам, а не "просто что-то с этим названием".
  blockKeywords?: string;
}

export const generateSingleBlock = async (req: Request, res: Response) => {
  try {
    const {
      brand,
      language,
      country,
      domain,
      affiliateLink,
      pageType,
      blockType,
      blockTemplate,
      projectName,
      blockIndex,
      pageName,
      isCustom,
      blockKeywords,
    } = req.body as GenerateSingleBlockRequest;
    const locale =
      typeof (req.body as any).locale === "string"
        ? (req.body as any).locale.trim()
        : "";

    // Validation
    if (!brand || !language || !country || !domain || !affiliateLink) {
      return res.status(400).json({
        error:
          "Missing required fields: brand, language, country, domain, affiliateLink",
      });
    }

    if (
      !pageType ||
      !blockType ||
      projectName === undefined ||
      blockIndex === undefined
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: pageType, blockType, projectName, blockIndex",
      });
    }

    // Проверяем наличие API ключа
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "OpenAI API key is not configured",
      });
    }

    // Создаем клиент OpenAI
    const openai = new OpenAI({
      apiKey: apiKey.trim(),
    });

    // Получаем модель для конкретного типа страницы
    const getModelForPageType = (pageType: string): string => {
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
          process.env.OPENAI_MODEL_SLOTS || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
        games:
          process.env.OPENAI_MODEL_GAMES || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
        betting:
          process.env.OPENAI_MODEL_BETTING ||
          process.env.OPENAI_MODEL ||
          DEFAULT_OPENAI_MODEL,
        app:
          process.env.OPENAI_MODEL_APP || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
        login:
          process.env.OPENAI_MODEL_LOGIN || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      };
      return modelMap[pageType] || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    };

    const model = isCustom
      ? process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
      : getModelForPageType(pageType);

    // Получаем структуру для одного блока
    const blockStructure = getStructureForBlock(blockType, blockTemplate);
    const structureTemplate = [blockStructure];

    const systemPrompt = generateSystemPrompt(
      language,
      brand,
      country,
      domain,
      affiliateLink,
      isCustom ? pageName || pageType : pageType,
      structureTemplate
    );

    // Готовим guidance по ключевым словам для одного блока: парсим
    // строку через запятую и просим модель раскрыть каждую из этих
    // тем внутри генерируемого блока.
    const keywordList =
      typeof blockKeywords === "string"
        ? blockKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : [];
    const keywordsGuidance =
      keywordList.length > 0
        ? `\n\nThis block MUST be written around the following keywords/topics — cover every keyword at least once, naturally weaved into the h2/text/list items (do NOT just paste them in a row):\n- ${keywordList.join(
            "\n- "
          )}`
        : "";

    const userPrompt = `Generate content for a single block of type "${blockType}" for ${
      isCustom ? pageName || pageType : pageType
    } page JSON for brand ${brand} in ${language}${
      country !== "NO COUNTRY" ? ` for ${country}` : ""
    }.
Follow the structure above exactly. Generate only the content for this one block.
The brand name "${brand}" MUST be used naturally throughout the text and is a required keyword.
Do NOT start sentences with the construction "At ${brand}".  
Instead, use alternative sentence openings such as:
- "${brand} offers..."
- "With ${brand}, users can..."
- "${brand} provides..."
- "Players can..."
- "Users enjoy..."

Never remove or avoid the brand name entirely.${keywordsGuidance}`;

    console.log(
      `[text-generation] Генерация одного блока: ${blockType} для страницы ${pageType}, модель: ${model}${
        keywordList.length > 0
          ? ` (block keywords: ${keywordList.join(", ")})`
          : ""
      }`
    );

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(modelSupportsCustomTemperature(model) ? { temperature: 0.7 } : {}),
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content;
    if (!responseText) {
      return res.status(500).json({
        error: "Empty response from OpenAI",
      });
    }

    console.log("[text-generation] Получен ответ от OpenAI для одного блока");

    // Парсим JSON
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

    let parsedJSON;
    try {
      parsedJSON = JSON.parse(cleaned);
    } catch (parseError: any) {
      console.error(
        "[text-generation] Ошибка парсинга JSON для одного блока:",
        parseError
      );
      return res.status(500).json({
        error: "Invalid JSON response from OpenAI",
        rawResponse: responseText,
      });
    }

    // Извлекаем только блок из ответа
    if (
      !parsedJSON.blocks ||
      !Array.isArray(parsedJSON.blocks) ||
      parsedJSON.blocks.length === 0
    ) {
      return res.status(500).json({
        error: "Invalid block structure in response",
        rawResponse: responseText,
      });
    }

    const generatedBlock = parsedJSON.blocks[0];

    // Загружаем существующий JSON страницы
    const path = await import("path");
    const fs = await import("fs");
    const projectPath = path.join(process.cwd(), "projects", projectName);

    let pageFilePath: string | undefined;
    const settingsPath = path.join(projectPath, "project-settings.json");
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(
          fs.readFileSync(settingsPath, "utf-8")
        ) as any;
        const pi = settings.pages?.[pageType];
        if (locale && pi?.localeFiles?.[locale]) {
          pageFilePath = path.join(projectPath, pi.localeFiles[locale]);
        } else if (pi?.filePath) {
          pageFilePath = path.join(projectPath, pi.filePath);
        }
      } catch (_) {
        /* fallback ниже */
      }
    }

    if (!pageFilePath) {
      if (isCustom && pageName) {
        const fileName =
          pageName.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".json";
        pageFilePath = path.join(projectPath, "src", "pages", fileName);
      } else {
        const pageFileMap: Record<string, string> = {
          homepage: "main.json",
          casino: "casino.json",
          slots: "slots.json",
          games: "games.json",
          betting: "betting.json",
          app: "app.json",
          login: "login.json",
        };
        const fileName = pageFileMap[pageType] || "main.json";
        pageFilePath = path.join(projectPath, "src", "pages", fileName);
      }
    }

    if (!fs.existsSync(pageFilePath)) {
      return res.status(404).json({
        error: "Page file not found",
      });
    }

    // Читаем существующий JSON
    const pageContent = fs.readFileSync(pageFilePath, "utf-8");
    const pageData = JSON.parse(pageContent);

    if (!pageData.blocks || !Array.isArray(pageData.blocks)) {
      return res.status(500).json({
        error: "Invalid page structure",
      });
    }

    // Определяем imgBase для правильной обработки изображений
    const imgBase =
      isCustom && pageName
        ? pageName.toLowerCase().replace(/[^a-z0-9]/g, "_")
        : pageType;

    // Появилось ли это блок впервые (был добавлен после первой генерации
    // и его индекс выходит за пределы массива)? В этом случае мы НЕ
    // заменяем существующий блок, а дописываем новый — соответственно
    // считаем его последним и переносим image2/button с предыдущего
    // последнего блока на новый.
    const isAppendingNewBlock = blockIndex >= pageData.blocks.length;

    // Обновляем блок по индексу
    const isFirstBlock = blockIndex === 0;
    const isLastBlock = isAppendingNewBlock
      ? true
      : blockIndex === pageData.blocks.length - 1;

    // Получаем варианты стилей из project-settings.json проекта
    let variants: any = null;
    try {
      const settingsPath = path.join(projectPath, "project-settings.json");
      if (fs.existsSync(settingsPath)) {
        const settingsContent = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(settingsContent);
        if (settings.variants) {
          variants = settings.variants;
        }
      }
    } catch (err: any) {
      console.warn(
        "[text-generation] Не удалось загрузить варианты из project-settings.json:",
        err.message
      );
    }

    // Если варианты не найдены, генерируем новые (fallback для старых проектов)
    if (!variants) {
      variants = generatePageVariants();
    }

    // Удаляем старые image и button элементы из нового блока
    const cleanedElements = generatedBlock.elements.filter(
      (el: any) => el.type !== "image" && el.type !== "button"
    );

    // Добавляем варианты стилей для элементов блока
    cleanedElements.forEach((element: any) => {
      if (element.type === "list" || element.type === "list-large") {
        element.variant = variants.cardsList;
      } else if (element.type === "glossaryList") {
        element.variant = variants.glossaryList;
      }
    });

    // Добавляем изображения и кнопки согласно правилам
    if (isFirstBlock) {
      // После первого блока - image
      cleanedElements.push({
        type: "image",
        src: imgBase + "1",
      });
    }

    if (isLastBlock) {
      // После последнего блока - image + button
      cleanedElements.push(
        {
          type: "image",
          src: imgBase + "2",
        },
        {
          type: "button",
          text: "Play Now",
        }
      );
    }

    generatedBlock.elements = cleanedElements;

    // Если этот блок добавляется в конец (новый блок после генерации
    // страницы), нужно удалить image2/button с прежнего последнего
    // блока — теперь он не последний и не должен иметь финальные CTA.
    if (isAppendingNewBlock && pageData.blocks.length > 0) {
      const previousLast = pageData.blocks[pageData.blocks.length - 1];
      if (previousLast && Array.isArray(previousLast.elements)) {
        previousLast.elements = previousLast.elements.filter(
          (el: any) => el.type !== "image" && el.type !== "button"
        );
      }
      pageData.blocks.push(generatedBlock);
    } else {
      // Заменяем блок в массиве (поведение перегенерации)
      pageData.blocks[blockIndex] = generatedBlock;
    }

    // Сохраняем обновленный JSON
    fs.writeFileSync(pageFilePath, JSON.stringify(pageData, null, 2), "utf-8");

    console.log(
      `[text-generation] Блок ${blockIndex} ${
        isAppendingNewBlock ? "добавлен" : "успешно обновлен"
      } в файле ${pageFilePath}`
    );

    res.json({
      success: true,
      data: {
        block: generatedBlock,
        blockIndex: blockIndex,
      },
    });
  } catch (error: any) {
    console.error(
      "[text-generation] Ошибка при генерации одного блока:",
      error
    );
    const d = openAiHttpDetails(error);
    res.status(500).json({
      error: "Failed to generate single block",
      message: d.message,
      code: d.code,
      status: d.status,
      type: d.type,
      requestId: d.requestId,
    });
  }
};

export const generateFAQ = async (req: Request, res: Response) => {
  try {
    const { brand, language, country, count, projectName } =
      req.body as GenerateFAQRequest;

    // Validation
    if (!brand || !language || !country) {
      return res.status(400).json({
        error: "Missing required fields: brand, language, country",
      });
    }

    if (!count || count < 1 || count > 50) {
      return res.status(400).json({
        error: "Count must be between 1 and 50",
      });
    }

    // Проверяем наличие API ключа
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "OpenAI API key is not configured",
      });
    }

    // Создаем клиент OpenAI с актуальным ключом
    const openai = new OpenAI({
      apiKey: apiKey.trim(),
    });

    // Используем модель для FAQ или общую модель
    const model =
      process.env.OPENAI_MODEL_FAQ || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

    // Системный промт для FAQ
    const systemPrompt = `You are a copywriter who creates FAQ content for online casinos. Generate clear, helpful questions and answers that address common player concerns.`;

    // Пользовательский промт
    const userPrompt = `Generate ${count} frequently asked questions (FAQ) with answers in ${language} for the online casino brand ${brand}. The text must be localized for players in ${country}.

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
- h2 should be the brand name followed by "Casino FAQ" (e.g., "${brand} Casino FAQ")
- text is a brief introduction paragraph (2-3 sentences) explaining what the FAQ covers
- Questions are relevant to online casino players
- Answers are clear, helpful, and accurate (2-4 sentences each)
- Content is appropriate for ${country} players
- All text is in ${language}
- Return valid JSON only, no markdown or explanations`;

    console.log(
      `[text-generation] Генерация FAQ для бренда ${brand}, язык: ${language}, страна: ${country}, количество: ${count}`
    );

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4000,
      ...(modelSupportsCustomTemperature(model) ? { temperature: 0.7 } : {}),
    });

    const responseText = completion.choices[0]?.message?.content?.trim();

    if (!responseText) {
      return res.status(500).json({
        error: "Empty response from OpenAI",
      });
    }

    // Парсим JSON ответ (для FAQ используем простой парсинг без валидации страниц)
    let parsedJSON;
    try {
      let cleaned = responseText.trim();

      // Remove markdown code blocks if present
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "");
        cleaned = cleaned.replace(/\n?```\s*$/, "");
        cleaned = cleaned.trim();
      }

      // Find JSON object boundaries
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      parsedJSON = JSON.parse(cleaned);
    } catch (parseError: any) {
      console.error("[text-generation] Ошибка парсинга FAQ JSON:", parseError);
      return res.status(500).json({
        error: "Invalid JSON response from OpenAI",
        rawResponse: responseText,
      });
    }

    // Проверяем структуру FAQ
    if (!parsedJSON.faq || typeof parsedJSON.faq !== "object") {
      return res.status(500).json({
        error: "Invalid FAQ structure: missing 'faq' object",
        rawResponse: responseText,
      });
    }

    if (!parsedJSON.faq.h2 || typeof parsedJSON.faq.h2 !== "string") {
      return res.status(500).json({
        error: "Invalid FAQ structure: missing 'h2' field",
        rawResponse: responseText,
      });
    }

    if (!parsedJSON.faq.text || typeof parsedJSON.faq.text !== "string") {
      return res.status(500).json({
        error: "Invalid FAQ structure: missing 'text' field",
        rawResponse: responseText,
      });
    }

    if (!parsedJSON.faq.items || !Array.isArray(parsedJSON.faq.items)) {
      return res.status(500).json({
        error: "Invalid FAQ structure: missing 'items' array",
        rawResponse: responseText,
      });
    }

    // Проверяем структуру каждого элемента items
    for (const item of parsedJSON.faq.items) {
      if (!item.question || typeof item.question !== "string") {
        return res.status(500).json({
          error: "Invalid FAQ structure: missing 'question' field in item",
          rawResponse: responseText,
        });
      }
      if (!item.answer || typeof item.answer !== "string") {
        return res.status(500).json({
          error: "Invalid FAQ structure: missing 'answer' field in item",
          rawResponse: responseText,
        });
      }
    }

    // Получаем вариант стиля для FAQ из project-settings.json проекта
    let faqVariant: number | null = null;
    if (projectName) {
      try {
        const path = await import("path");
        const fs = await import("fs");
        const projectPath = path.join(process.cwd(), "projects", projectName);
        const settingsPath = path.join(projectPath, "project-settings.json");

        if (fs.existsSync(settingsPath)) {
          const settingsContent = fs.readFileSync(settingsPath, "utf-8");
          const settings = JSON.parse(settingsContent);
          if (settings.variants?.faqBlock !== undefined) {
            faqVariant = settings.variants.faqBlock;
          }
        }
      } catch (err: any) {
        console.warn(
          "[text-generation] Не удалось загрузить варианты FAQ из project-settings.json:",
          err.message
        );
      }
    }

    // Если вариант не найден, генерируем новый (fallback для старых проектов)
    if (faqVariant === null) {
      faqVariant = generateListVariant();
    }

    // Добавляем вариант стиля для FAQ
    parsedJSON.faq.variant = faqVariant;

    res.json({
      success: true,
      data: parsedJSON,
    });
  } catch (error: any) {
    console.error("[text-generation] Ошибка при генерации FAQ:", error);
    const d = openAiHttpDetails(error);
    res.status(500).json({
      error: "Failed to generate FAQ",
      message: d.message,
      code: d.code,
      status: d.status,
      type: d.type,
      requestId: d.requestId,
    });
  }
};

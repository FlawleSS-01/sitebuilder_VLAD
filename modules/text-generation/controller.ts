import { Request, Response } from "express";
import OpenAI from "openai";
import {
  generatePageContentCore,
  generateCustomPageContentCore,
  generateFaqContentCore,
  getModelForPageType,
} from "./generateCore.js";
import {
  getStructureForBlock,
} from "./prompts/templates.js";
import {
  generatePageVariants,
} from "./utils/variantGenerator.js";
import { modelSupportsCustomTemperature } from "../shared/openaiModel.js";
import { generateSingleBlockSystemPrompt } from "./prompts/index.js";

const DEFAULT_OPENAI_MODEL =
  process.env.OPENAI_MODEL_DEFAULT || "gpt-4o-mini";

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

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OpenAI API key is not configured",
      });
    }

    console.log(
      `[text-generation] Генерация текста для страницы: ${pageType}, модель: ${getModelForPageType(pageType)}${
        blockKeywords ? " (block keywords applied)" : ""
      }`
    );

    const result = await generatePageContentCore({
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
    });

    res.json({
      success: true,
      data: result.data,
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

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OpenAI API key is not configured",
      });
    }

    console.log(
      `[text-generation] Генерация кастомной страницы: ${pageName}, модель: ${
        process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
      }${blockKeywords ? " (block keywords applied)" : ""}`
    );

    const result = await generateCustomPageContentCore({
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
    });

    res.json({
      success: true,
      data: result.data,
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

/** Достаёт массив блоков из ответа модели (устойчиво к типичным отклонениям формы). */
function extractBlocksFromSingleBlockResponse(parsed: unknown): any[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const blocks = o.blocks;
  if (Array.isArray(blocks) && blocks.length > 0) return blocks as any[];
  if (blocks && typeof blocks === "object" && !Array.isArray(blocks))
    return [blocks];
  if (typeof o.blockType === "string" && Array.isArray(o.elements))
    return [o];
  const blk = o.block;
  if (blk && typeof blk === "object") {
    if (Array.isArray(blk)) return blk.length > 0 ? (blk as any[]) : null;
    return [blk];
  }
  return null;
}

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

    const model = isCustom
      ? process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
      : getModelForPageType(pageType);

    // Получаем структуру для одного блока
    const blockStructure = getStructureForBlock(blockType, blockTemplate);
    const pageLabel = isCustom ? pageName || pageType : pageType;

    const systemPrompt = generateSingleBlockSystemPrompt(
      language,
      brand,
      country,
      domain,
      affiliateLink,
      pageLabel,
      blockStructure as Record<string, unknown>
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

Never remove or avoid the brand name entirely.${keywordsGuidance}

Reply with JSON whose ONLY top-level key is "blocks" (array of one object).`;


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

    // Извлекаем блок из ответа (поддержка альтернативных форм от модели)
    const blocksFromAi = extractBlocksFromSingleBlockResponse(parsedJSON);
    if (!blocksFromAi || blocksFromAi.length === 0) {
      return res.status(500).json({
        error: "Invalid block structure in response",
        rawResponse: responseText,
      });
    }

    const generatedBlock = blocksFromAi[0];
    generatedBlock.blockType = blockType;
    if (
      !generatedBlock ||
      typeof generatedBlock !== "object" ||
      !Array.isArray(generatedBlock.elements)
    ) {
      return res.status(500).json({
        error: "Invalid block structure in response",
        rawResponse: responseText,
      });
    }

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

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OpenAI API key is not configured",
      });
    }

    console.log(
      `[text-generation] Генерация FAQ для бренда ${brand}, язык: ${language}, страна: ${country}, количество: ${count}`
    );

    const result = await generateFaqContentCore({
      brand,
      language,
      country,
      count,
      projectName,
    });

    res.json({
      success: true,
      data: result.data,
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

/**
 * Общие структуры шаблонов без привязки к типам блоков
 * Каждая структура идентифицируется по последовательности типов элементов
 */

// Типы элементов
type ElementType = "h2" | "paragraph" | "list" | "list-large" | "glossaryList";

interface Element {
  type: ElementType;
  items?: Array<{ title: string; description: string }>;
}

interface StructureTemplate {
  id: string; // Уникальный идентификатор структуры
  elements: Element[]; // Последовательность элементов
}

/**
 * Все уникальные структуры шаблонов
 */
export const STRUCTURE_TEMPLATES: Record<string, StructureTemplate> = {
  // h2 + 4 paragraph
  h2_4p: {
    id: "h2_4p",
    elements: [
      { type: "h2" },
      { type: "paragraph" },
      { type: "paragraph" },
      { type: "paragraph" },
      { type: "paragraph" },
    ],
  },
  // h2 + 3 paragraph
  h2_3p: {
    id: "h2_3p",
    elements: [
      { type: "h2" },
      { type: "paragraph" },
      { type: "paragraph" },
      { type: "paragraph" },
    ],
  },
  // h2 + 2 paragraph
  h2_2p: {
    id: "h2_2p",
    elements: [{ type: "h2" }, { type: "paragraph" }, { type: "paragraph" }],
  },
  // h2 + list-large
  "h2_list-large": {
    id: "h2_list-large",
    elements: [
      { type: "h2" },
      {
        type: "list-large",
        items: [{ title: "", description: "" }],
      },
    ],
  },
  // h2 + paragraph + list
  h2_p_list: {
    id: "h2_p_list",
    elements: [
      { type: "h2" },
      { type: "paragraph" },
      {
        type: "list",
        items: [{ title: "", description: "" }],
      },
    ],
  },
  // h2 + list
  h2_list: {
    id: "h2_list",
    elements: [
      { type: "h2" },
      {
        type: "list",
        items: [{ title: "", description: "" }],
      },
    ],
  },
  // h2 + paragraph + glossaryList
  h2_p_glossary: {
    id: "h2_p_glossary",
    elements: [
      { type: "h2" },
      { type: "paragraph" },
      {
        type: "glossaryList",
        items: [{ title: "", description: "" }],
      },
    ],
  },
};

/**
 * Маппинг блоков на структуры для каждой страницы
 * Теперь блоки просто ссылаются на структуры по ID
 */
export const PAGE_BLOCK_STRUCTURES: Record<string, Record<string, string>> = {
  homepage: {
    start: "h2_4p",
    welcome: "h2_4p",
    features: "h2_list-large",
    popular_games: "h2_list-large",
    category: "h2_p_list",
    glossary: "h2_p_glossary",
    games_universe: "h2_4p",
    security: "h2_4p",
  },
  casino: {
    welcome: "h2_3p",
    features: "h2_p_list",
    casino_games: "h2_list",
    bonuses: "h2_3p",
    live_casino: "h2_3p",
  },
  slots: {
    welcome: "h2_3p",
    features: "h2_p_list",
    category: "h2_p_list",
    tips: "h2_3p",
  },
  games: {
    welcome: "h2_3p",
    features: "h2_p_list",
    category: "h2_p_list",
    security: "h2_3p",
    powered: "h2_2p",
    other: "h2_2p",
  },
  betting: {
    welcome: "h2_3p",
    features: "h2_list",
    start: "h2_2p",
    sports: "h2_list",
    other: "h2_2p",
  },
  app: {
    welcome: "h2_3p",
    features: "h2_p_list",
    download: "h2_2p",
    other: "h2_2p",
  },
  login: {
    security: "h2_3p",
    features: "h2_p_list",
    forgot: "h2_2p",
  },
};

/**
 * Получает структуру шаблона для страницы на основе блоков
 * @param pageType - тип страницы
 * @param blocks - массив блоков (опционально, если не указан - возвращает все блоки страницы)
 * @returns массив блоков с их структурами
 */
export const getStructureTemplateForPage = (
  pageType: string,
  blocks?: string[]
): any[] => {
  const pageBlocks = PAGE_BLOCK_STRUCTURES[pageType] || {};
  const result: any[] = [];

  // Если указаны конкретные блоки, используем их
  const blocksToProcess = blocks || Object.keys(pageBlocks);

  blocksToProcess.forEach((blockName) => {
    const structureId = pageBlocks[blockName];

    if (structureId && STRUCTURE_TEMPLATES[structureId]) {
      const structure = STRUCTURE_TEMPLATES[structureId];
      result.push({
        blockType: blockName,
        elements: structure.elements,
      });
    } else {
      // Если структура не найдена, используем дефолтную (h2 + 2 paragraph)
      console.warn(
        `[templates] Структура для блока "${blockName}" на странице "${pageType}" не найдена, используется дефолтная`
      );
      result.push({
        blockType: blockName,
        elements: STRUCTURE_TEMPLATES["h2_2p"].elements,
      });
    }
  });

  return result;
};

/**
 * Получает структуру для конкретного блока (для кастомных страниц)
 * @param blockName - название блока
 * @param templateId - опциональный ID шаблона (если указан, используется он)
 * @returns структура блока или дефолтная
 */
export const getStructureForBlock = (
  blockName: string,
  templateId?: string
): any => {
  // Если указан конкретный шаблон, используем его
  if (templateId && STRUCTURE_TEMPLATES[templateId]) {
    const structure = STRUCTURE_TEMPLATES[templateId];
    return {
      blockType: blockName,
      elements: structure.elements,
    };
  }

  // Пытаемся найти структуру в существующих страницах
  for (const pageType in PAGE_BLOCK_STRUCTURES) {
    const pageBlocks = PAGE_BLOCK_STRUCTURES[pageType];
    if (pageBlocks[blockName]) {
      const structureId = pageBlocks[blockName];
      if (STRUCTURE_TEMPLATES[structureId]) {
        const structure = STRUCTURE_TEMPLATES[structureId];
        return {
          blockType: blockName,
          elements: structure.elements,
        };
      }
    }
  }

  // Если не найдено, возвращаем дефолтную структуру
  return {
    blockType: blockName,
    elements: STRUCTURE_TEMPLATES["h2_2p"].elements,
  };
};

/**
 * Получает структуру шаблона с кастомными шаблонами для блоков
 * @param pageType - тип страницы
 * @param blocks - массив блоков
 * @param blockTemplates - маппинг блоков на ID шаблонов
 * @returns массив блоков с их структурами
 */
export const getStructureTemplateWithCustomTemplates = (
  pageType: string,
  blocks: string[],
  blockTemplates: Record<string, string>
): any[] => {
  const result: any[] = [];

  blocks.forEach((blockName) => {
    const templateId = blockTemplates[blockName];
    result.push(getStructureForBlock(blockName, templateId));
  });

  return result;
};

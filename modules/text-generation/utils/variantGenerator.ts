/**
 * Генерирует случайные варианты стилей для блоков
 */

/**
 * Генерирует случайный вариант для mainBlock (0-5, как и остальные блоки)
 */
export const generateMainBlockVariant = (): number => {
  return Math.floor(Math.random() * 6); // 0-5
};

/**
 * Генерирует случайный вариант для cardsList, glossaryList, faqBlock__list (0-5)
 */
export const generateListVariant = (): number => {
  return Math.floor(Math.random() * 6); // 0-5
};

/**
 * Генерирует все варианты стилей для страницы
 */
export const generatePageVariants = () => {
  return {
    mainBlock: generateMainBlockVariant(), // 0-5
    cardsList: generateListVariant(), // 0-5
    glossaryList: generateListVariant(), // 0-5
    faqBlock: generateListVariant(), // 0-5
  };
};

/**
 * Добавляет варианты стилей в JSON страницы
 */
export const addVariantsToPageData = (pageData: any, variants: any): any => {
  if (!pageData) return pageData;

  // Добавляем variant для mainBlock (HeroSection)
  pageData.variant = variants.mainBlock;

  // Добавляем варианты для элементов в блоках
  if (Array.isArray(pageData.blocks)) {
    pageData.blocks.forEach((block: any) => {
      if (Array.isArray(block.elements)) {
        block.elements.forEach((element: any) => {
          if (element.type === "list" || element.type === "list-large") {
            element.variant = variants.cardsList;
          } else if (element.type === "glossaryList") {
            element.variant = variants.glossaryList;
          }
        });
      }
    });
  }

  return pageData;
};

/**
 * Утилиты для работы с шаблонами на клиенте
 * Экспортируем список доступных шаблонов для выбора в UI
 */

export const STRUCTURE_TEMPLATES = {
  h2_4p: "h2 + 4 paragraph",
  h2_3p: "h2 + 3 paragraph",
  h2_2p: "h2 + 2 paragraph",
  "h2_list-large": "h2 + list-large",
  h2_p_list: "h2 + paragraph + list",
  h2_list: "h2 + list",
  h2_p_glossary: "h2 + paragraph + glossaryList",
} as const;

export type StructureTemplateId = keyof typeof STRUCTURE_TEMPLATES;

export const getTemplateDisplayName = (templateId: string): string => {
  return STRUCTURE_TEMPLATES[templateId as StructureTemplateId] || templateId;
};

export const getAllTemplateIds = (): string[] => {
  return Object.keys(STRUCTURE_TEMPLATES);
};


import { useState, useEffect } from "react";
import "./GeneratePagesModal.css";
import {
  getTemplateDisplayName,
  getAllTemplateIds,
} from "../utils/templates.js";
import {
  promptLanguageForLocale,
  formatTextGenError,
} from "../utils/locale.js";
import { fetchJson } from "../utils/api";

type PageType =
  | "homepage"
  | "casino"
  | "slots"
  | "games"
  | "betting"
  | "app"
  | "login";

interface PageBlocks {
  [key: string]: string[];
}

interface PageBlockTemplates {
  [pageType: string]: Record<string, string>;
}

// Ключевые слова на блок (через запятую). Применяется только к
// кастомным блокам (стандартные блоки уже имеют свою тему), но
// технически можно задать и для предопределённого блока.
interface PageBlockKeywords {
  [pageType: string]: Record<string, string>;
}

const PAGE_NAMES: Record<PageType, string> = {
  homepage: "Главная",
  casino: "Казино",
  slots: "Слоты",
  games: "Игры",
  betting: "Ставки",
  app: "Приложение",
  login: "Логин",
};

// Автовыбор блоков
const AUTO_BLOCKS: Record<PageType, string[]> = {
  homepage: ["start", "features", "category", "glossary", "security"],
  casino: ["welcome", "features", "casino_games"],
  slots: ["welcome", "features", "category"],
  games: ["welcome", "features", "category"],
  betting: ["welcome", "features", "sports"],
  app: ["welcome", "features", "download"],
  login: ["security", "features", "forgot"],
};

// Дефолтные шаблоны для блоков на каждой странице (должны совпадать с бэкендом)
const DEFAULT_BLOCK_TEMPLATES: Record<PageType, Record<string, string>> = {
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

// Все доступные блоки для каждой страницы
const AVAILABLE_BLOCKS: Record<PageType, string[]> = {
  homepage: [
    "start",
    "welcome",
    "features",
    "popular_games",
    "category",
    "glossary",
    "games_universe",
    "security",
  ],
  casino: ["welcome", "features", "casino_games", "bonuses", "live_casino"],
  slots: ["welcome", "features", "category", "tips"],
  games: ["welcome", "features", "category", "security", "powered", "other"],
  betting: ["welcome", "features", "start", "sports", "other"],
  app: ["welcome", "features", "download", "other"],
  login: ["security", "features", "forgot"],
};

/** Склеивает ключевые слова блока с общими для всех страниц (перед запросом generate). */
function mergeGlobalBlockKeywords(
  blocks: string[],
  keywordsForPage: Record<string, string>,
  globalKeywordsRaw: string
): Record<string, string> {
  const globalTrim = globalKeywordsRaw.trim();
  const filteredKeywords: Record<string, string> = {};
  blocks.forEach((block) => {
    const perBlock =
      typeof keywordsForPage[block] === "string"
        ? keywordsForPage[block].trim()
        : "";
    let merged = "";
    if (perBlock && globalTrim) merged = `${perBlock}, ${globalTrim}`;
    else merged = perBlock || globalTrim;
    if (merged) filteredKeywords[block] = merged;
  });
  return filteredKeywords;
}

interface GeneratePagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  projectSettings: {
    brand: string;
    language: string;
    country: string;
    domain: string;
    affiliateLink: string;
    locales?: string[];
    defaultLocale?: string;
  };
  onSuccess: () => void;
  /** После сохранения страниц запустить preview и вернуть URL (если есть). */
  openPreviewAfterGeneration?: boolean;
  onRunPreview?: () => Promise<string | undefined>;
}

const GeneratePagesModal: React.FC<GeneratePagesModalProps> = ({
  isOpen,
  onClose,
  projectName,
  projectSettings,
  onSuccess,
  openPreviewAfterGeneration,
  onRunPreview,
}) => {
  const [pageBlocks, setPageBlocks] = useState<PageBlocks>({});
  const [pageBlockTemplates, setPageBlockTemplates] =
    useState<PageBlockTemplates>({});
  const [pageBlockKeywords, setPageBlockKeywords] =
    useState<PageBlockKeywords>({});
  const [newBlockNames, setNewBlockNames] = useState<Record<string, string>>(
    {}
  ); // Имена новых блоков для каждой страницы
  const [newBlockKeywordsInputs, setNewBlockKeywordsInputs] = useState<
    Record<string, string>
  >({}); // Ключевые слова для нового блока на каждой странице
  const [showAddInputs, setShowAddInputs] = useState<Record<string, boolean>>(
    {}
  ); // Показывать ли поле ввода для каждой страницы
  const [draggedIndices, setDraggedIndices] = useState<
    Record<string, number | null>
  >({}); // Индекс перетаскиваемого блока для каждой страницы
  const [generateFaq, setGenerateFaq] = useState(false); // Генерировать ли FAQ
  const [faqCount, setFaqCount] = useState<number>(5); // Количество вопросов FAQ
  /** Общие ключевые слова (через запятую) — добавляются к каждому блоку каждой страницы при генерации. */
  const [globalKeywordsAllPages, setGlobalKeywordsAllPages] = useState("");
  const [localeScope, setLocaleScope] = useState<"current" | "all">("all");
  const [currentLocale, setCurrentLocale] = useState<string>("en");
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<Record<PageType, boolean>>({
    homepage: false,
    casino: false,
    slots: false,
    games: false,
    betting: false,
    app: false,
    login: false,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      applyAutoBlocks();
      const def =
        projectSettings.defaultLocale ||
        projectSettings.locales?.[0] ||
        "en";
      setCurrentLocale(def);
      setLocaleScope(
        projectSettings.locales && projectSettings.locales.length > 1
          ? "all"
          : "current"
      );
    }
  }, [isOpen]);

  const applyAutoBlocks = () => {
    const blocks: PageBlocks = {};
    const templates: PageBlockTemplates = {};
    Object.keys(AUTO_BLOCKS).forEach((pageType) => {
      const pageBlocksList = AUTO_BLOCKS[pageType as PageType];
      blocks[pageType] = [...pageBlocksList];
      const pageTemplates: Record<string, string> = {};
      const defaults = DEFAULT_BLOCK_TEMPLATES[pageType as PageType] || {};
      pageBlocksList.forEach((block) => {
        pageTemplates[block] = defaults[block] || "h2_2p";
      });
      templates[pageType] = pageTemplates;
    });
    setPageBlocks(blocks);
    setPageBlockTemplates(templates);
    setPageBlockKeywords({});
    setNewBlockNames({});
    setNewBlockKeywordsInputs({});
    setShowAddInputs({});
    setDraggedIndices({});
    setGenerateFaq(false);
    setFaqCount(5);
    setIsAutoMode(true);
  };

  const handleManualMode = () => {
    // При переключении на ручной режим сбрасываем все выбранные блоки
    setPageBlocks({});
    setPageBlockTemplates({});
    setPageBlockKeywords({});
    setNewBlockNames({});
    setNewBlockKeywordsInputs({});
    setShowAddInputs({});
    setDraggedIndices({});
    setGenerateFaq(false);
    setFaqCount(5);
    setIsAutoMode(false);
  };

  const toggleBlock = (pageType: PageType, block: string) => {
    if (isAutoMode) {
      handleManualMode();
    }
    setPageBlocks((prev) => {
      const pageBlocksList = prev[pageType] || [];
      if (pageBlocksList.includes(block)) {
        return {
          ...prev,
          [pageType]: pageBlocksList.filter((b) => b !== block),
        };
      } else {
        return {
          ...prev,
          [pageType]: [...pageBlocksList, block],
        };
      }
    });
    // При добавлении блока устанавливаем дефолтный шаблон
    setPageBlockTemplates((prev) => {
      const pageTemplates = prev[pageType] || {};
      if (!pageTemplates[block]) {
        return {
          ...prev,
          [pageType]: {
            ...pageTemplates,
            [block]: "h2_2p", // Дефолтный шаблон
          },
        };
      }
      return prev;
    });
  };

  const handleAddCustomBlock = (pageType: PageType) => {
    const blockName = newBlockNames[pageType]?.trim();
    if (blockName && !pageBlocks[pageType]?.includes(blockName)) {
      setPageBlocks((prev) => {
        const pageBlocksList = prev[pageType] || [];
        return {
          ...prev,
          [pageType]: [...pageBlocksList, blockName],
        };
      });
      setPageBlockTemplates((prev) => {
        const pageTemplates = prev[pageType] || {};
        return {
          ...prev,
          [pageType]: {
            ...pageTemplates,
            [blockName]: "h2_2p",
          },
        };
      });
      // Сохраняем ключевые слова для нового кастомного блока, если их ввели
      const kw = newBlockKeywordsInputs[pageType]?.trim() || "";
      if (kw) {
        setPageBlockKeywords((prev) => {
          const pageKeywords = prev[pageType] || {};
          return {
            ...prev,
            [pageType]: {
              ...pageKeywords,
              [blockName]: kw,
            },
          };
        });
      }
      setNewBlockNames((prev) => ({ ...prev, [pageType]: "" }));
      setNewBlockKeywordsInputs((prev) => ({ ...prev, [pageType]: "" }));
      setShowAddInputs((prev) => ({ ...prev, [pageType]: false }));
    }
  };

  const handleRemoveBlock = (pageType: PageType, block: string) => {
    setPageBlocks((prev) => {
      const pageBlocksList = prev[pageType] || [];
      return {
        ...prev,
        [pageType]: pageBlocksList.filter((b) => b !== block),
      };
    });
    setPageBlockTemplates((prev) => {
      const pageTemplates = prev[pageType] || {};
      const newTemplates = { ...pageTemplates };
      delete newTemplates[block];
      return {
        ...prev,
        [pageType]: newTemplates,
      };
    });
    setPageBlockKeywords((prev) => {
      const pageKeywords = prev[pageType] || {};
      if (!pageKeywords[block]) return prev;
      const newKeywords = { ...pageKeywords };
      delete newKeywords[block];
      return {
        ...prev,
        [pageType]: newKeywords,
      };
    });
  };

  const setBlockKeywordsForPage = (
    pageType: PageType,
    block: string,
    value: string
  ) => {
    setPageBlockKeywords((prev) => {
      const pageKeywords = prev[pageType] || {};
      const next = { ...pageKeywords };
      const trimmed = value.trim();
      if (trimmed) {
        next[block] = value;
      } else {
        delete next[block];
      }
      return {
        ...prev,
        [pageType]: next,
      };
    });
  };

  const handleDragStart = (pageType: PageType, index: number) => {
    setDraggedIndices((prev) => ({ ...prev, [pageType]: index }));
  };

  const handleDragOver = (
    e: React.DragEvent,
    pageType: PageType,
    index: number
  ) => {
    e.preventDefault();
    const draggedIndex = draggedIndices[pageType];
    if (draggedIndex === null || draggedIndex === undefined) return;

    const pageBlocksList = pageBlocks[pageType] || [];
    const newBlocks = [...pageBlocksList];
    const draggedBlock = newBlocks[draggedIndex];
    newBlocks.splice(draggedIndex, 1);
    newBlocks.splice(index, 0, draggedBlock);
    setPageBlocks((prev) => ({ ...prev, [pageType]: newBlocks }));
    setDraggedIndices((prev) => ({ ...prev, [pageType]: index }));
  };

  const handleDragEnd = (pageType: PageType) => {
    setDraggedIndices((prev) => ({ ...prev, [pageType]: null }));
  };

  const setBlockTemplate = (
    pageType: PageType,
    block: string,
    templateId: string
  ) => {
    setPageBlockTemplates((prev) => {
      const pageTemplates = prev[pageType] || {};
      return {
        ...prev,
        [pageType]: {
          ...pageTemplates,
          [block]: templateId,
        },
      };
    });
  };

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);

    const pageTypes: PageType[] = [
      "homepage",
      "casino",
      "slots",
      "games",
      "betting",
      "app",
      "login",
    ];

    const allResults: Record<string, any> = {};
    const pagesInfo: Record<string, any> = {};
    const localizedPages: Record<string, Record<string, any>> = {};

    try {
      const defaultLocale =
        projectSettings.defaultLocale ||
        projectSettings.locales?.[0] ||
        "en";
      const configuredLocales =
        projectSettings.locales && projectSettings.locales.length > 0
          ? projectSettings.locales
          : [defaultLocale];
      const targetLocales =
        localeScope === "all"
          ? configuredLocales
          : [currentLocale || defaultLocale];
      const multiLocaleRun = targetLocales.length > 1;
      const useLocalizedSave =
        Array.isArray(projectSettings.locales) &&
        projectSettings.locales.length > 0;

      const jobs: Array<{ pageType: PageType; locale: string }> = [];
      for (const loc of targetLocales) {
        for (const pageType of pageTypes) {
          const blocks = pageBlocks[pageType] || [];
          if (blocks.length > 0) {
            jobs.push({ pageType, locale: loc });
          }
        }
      }

      const generationPromises = jobs.map(
        async ({ pageType, locale: jobLocale }) => {
          const blocks = pageBlocks[pageType] || [];
          if (!multiLocaleRun) {
            setProgress((prev) => ({ ...prev, [pageType]: true }));
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 300000);

          const requestBody: any = {
            brand: projectSettings.brand,
            language: promptLanguageForLocale(jobLocale),
            country: projectSettings.country,
            domain: projectSettings.domain,
            affiliateLink: projectSettings.affiliateLink,
            pageType: pageType,
            blocks: blocks,
            projectName: projectName,
          };

          let usedTemplates: Record<string, string> = {};

          if (isAutoMode) {
            const defaultTemplates = DEFAULT_BLOCK_TEMPLATES[pageType] || {};
            blocks.forEach((block) => {
              usedTemplates[block] = defaultTemplates[block] || "h2_2p";
            });
          } else {
            const templatesForPage = pageBlockTemplates[pageType] || {};
            blocks.forEach((block) => {
              usedTemplates[block] = templatesForPage[block] || "h2_2p";
            });
            if (Object.keys(usedTemplates).length > 0) {
              requestBody.blockTemplates = usedTemplates;
            }
          }

          // Ключевые слова блока + общие слова для всех страниц (если указаны).
          const keywordsForPage = pageBlockKeywords[pageType] || {};
          const filteredKeywords = mergeGlobalBlockKeywords(
            blocks,
            keywordsForPage,
            globalKeywordsAllPages
          );
          if (Object.keys(filteredKeywords).length > 0) {
            requestBody.blockKeywords = filteredKeywords;
          }

          try {
            const { response, data } = await fetchJson(
              "/api/text-generation/generate",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
              }
            );

            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(
                formatTextGenError(data) ||
                  `Ошибка при генерации ${pageType} (${jobLocale})`
              );
            }

            if (!multiLocaleRun) {
              setProgress((prev) => ({ ...prev, [pageType]: false }));
            }

            return {
              pageType,
              locale: jobLocale,
              data: data.data,
              usedTemplates,
              usedKeywords: filteredKeywords,
            };
          } catch (err: any) {
            if (!multiLocaleRun) {
              setProgress((prev) => ({ ...prev, [pageType]: false }));
            }
            if (err.name === "AbortError") {
              throw new Error(
                `Превышено время ожидания: ${pageType} (${jobLocale})`
              );
            }
            throw err;
          }
        }
      );

      const faqDefaultLocale =
        localeScope === "all" ? defaultLocale : currentLocale || defaultLocale;
      const faqLanguage = promptLanguageForLocale(faqDefaultLocale);

      let faqData = null;
      if (generateFaq) {
        try {
          const { response: faqResponse, data: faqResult } = await fetchJson(
            "/api/text-generation/generate-faq",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                brand: projectSettings.brand,
                language: faqLanguage,
                country: projectSettings.country,
                count: faqCount,
              }),
            }
          );

          if (!faqResponse.ok) {
            throw new Error(formatTextGenError(faqResult) || "Ошибка FAQ");
          }

          faqData = faqResult.data;
        } catch (err: any) {
          console.error("Ошибка при генерации FAQ:", err);
          throw err;
        }
      }

      const results = await Promise.all(generationPromises);

      for (const loc of targetLocales) {
        localizedPages[loc] = {};
      }

      for (const result of results) {
        if (!result.data) continue;
        localizedPages[result.locale][result.pageType] = result.data;

        const blocksForPage = pageBlocks[result.pageType] || [];
        const usedTemplates = result.usedTemplates || {};
        const usedKeywords = result.usedKeywords || {};
        allResults[result.pageType] = result.data;
        pagesInfo[result.pageType] = {
          pageType: result.pageType,
          blocks: blocksForPage,
          generated: true,
          blockTemplates: usedTemplates,
          blockKeywords: usedKeywords,
        };
      }

      for (const pageType of pageTypes) {
        if (!pagesInfo[pageType]) {
          pagesInfo[pageType] = {
            pageType: pageType,
            blocks: [],
            generated: false,
          };
        }
      }

      const savePayload: Record<string, any> = {
        projectName: projectName,
        pagesInfo: pagesInfo,
        faq: faqData || undefined,
      };

      if (useLocalizedSave) {
        savePayload.localizedPages = localizedPages;
      } else {
        savePayload.pages = allResults;
      }

      const { response: saveResponse, data: saveData } = await fetchJson(
        "/api/build/save-pages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(savePayload),
        }
      );

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить страницы");
      }

      let previewUrl: string | undefined;
      if (openPreviewAfterGeneration && onRunPreview) {
        try {
          previewUrl = await onRunPreview();
        } catch (e) {
          console.warn("Preview after generation:", e);
        }
      }

      onSuccess();
      onClose();
      if (previewUrl) {
        window.open(previewUrl, "_blank", "noopener,noreferrer");
      }
      window.location.reload();
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при генерации");
      console.error("Error:", err);
    } finally {
      setGenerating(false);
      setProgress({
        homepage: false,
        casino: false,
        slots: false,
        games: false,
        betting: false,
        app: false,
        login: false,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Генерация страниц</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="mode-selector">
            <button
              className={`mode-button ${isAutoMode ? "active" : ""}`}
              onClick={applyAutoBlocks}
            >
              Автовыбор
            </button>
            <button
              className={`mode-button ${!isAutoMode ? "active" : ""}`}
              onClick={handleManualMode}
            >
              Ручной выбор
            </button>
          </div>

          {projectSettings.locales && projectSettings.locales.length > 1 ? (
            <div
              className="locale-scope-row"
              style={{ marginBottom: "12px", marginTop: "8px" }}
            >
              <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                Локали контента
              </div>
              <label style={{ marginRight: "16px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="localeScope"
                  checked={localeScope === "current"}
                  onChange={() => setLocaleScope("current")}
                  disabled={generating}
                />{" "}
                Текущая ({currentLocale})
              </label>
              <label style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="localeScope"
                  checked={localeScope === "all"}
                  onChange={() => setLocaleScope("all")}
                  disabled={generating}
                />{" "}
                Все локали ({projectSettings.locales.join(", ")})
              </label>
              {localeScope === "current" ? (
                <div style={{ marginTop: "8px" }}>
                  <label>
                    Локаль:{" "}
                    <select
                      value={currentLocale}
                      onChange={(e) => setCurrentLocale(e.target.value)}
                      disabled={generating}
                    >
                      {projectSettings.locales.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc} — {promptLanguageForLocale(loc)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          ) : projectSettings.locales &&
            projectSettings.locales.length === 1 ? (
            <p
              style={{ color: "#555", fontSize: "13px", margin: "8px 0" }}
            >
              Локаль проекта:{" "}
              <strong>
                {projectSettings.locales[0]} (
                {promptLanguageForLocale(projectSettings.locales[0])})
              </strong>
            </p>
          ) : null}

          <div className="global-keywords-all-pages">
            <label
              htmlFor="global-keywords-all-pages-input"
              className="global-keywords-all-pages-label"
            >
              Общие ключевые слова для всех страниц
            </label>
            <input
              id="global-keywords-all-pages-input"
              type="text"
              className="block-keywords-input-manual global-keywords-all-pages-input"
              value={globalKeywordsAllPages}
              onChange={(e) => setGlobalKeywordsAllPages(e.target.value)}
              placeholder="Через запятую: бонус, VIP, мобильное приложение…"
              disabled={generating}
            />
            <small className="global-keywords-all-pages-hint">
              Дополняют промпт для{" "}
              <strong>каждого</strong> выбранного блока на{" "}
              <strong>каждой</strong> генерируемой странице. В ручном режиме
              суммируются с ключевыми словами конкретного блока.
            </small>
          </div>

          {error && (
            <div className="error-message">
              <strong>Ошибка:</strong> {error}
            </div>
          )}

          <div className="pages-config">
            {Object.keys(PAGE_NAMES).map((pageType) => {
              const type = pageType as PageType;
              const selectedBlocks = pageBlocks[type] || [];
              const availableBlocks = AVAILABLE_BLOCKS[type];

              return (
                <div key={pageType} className="page-config-item">
                  <div className="page-config-header">
                    <h3>{PAGE_NAMES[type]}</h3>
                    {progress[type] && (
                      <span className="progress-indicator">⏳</span>
                    )}
                  </div>
                  {isAutoMode ? (
                    <div className="blocks-selector">
                      {availableBlocks.map((block) => {
                        const isSelected = selectedBlocks.includes(block);
                        return (
                          <div
                            key={block}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <label className="block-checkbox">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleBlock(type, block)}
                                disabled={generating}
                              />
                              <span>{block}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="blocks-selector-manual">
                      <div className="selected-blocks-manual">
                        {selectedBlocks.length === 0 ? (
                          <div className="empty-blocks-manual">
                            Нет выбранных блоков
                          </div>
                        ) : (
                          selectedBlocks.map((block, index) => {
                            const blockTemplate =
                              pageBlockTemplates[type]?.[block] || "h2_2p";
                            const isDragging = draggedIndices[type] === index;
                            const keywords =
                              pageBlockKeywords[type]?.[block] || "";
                            return (
                              <div
                                key={`${block}-${index}`}
                                className={`block-row-manual-wrapper ${
                                  isDragging ? "dragging" : ""
                                }`}
                                onDragOver={(e) =>
                                  handleDragOver(e, type, index)
                                }
                              >
                                <div
                                  className="block-row-manual"
                                  draggable
                                  onDragStart={() =>
                                    handleDragStart(type, index)
                                  }
                                  onDragEnd={() => handleDragEnd(type)}
                                >
                                  <span className="drag-handle-manual">☰</span>
                                  <label className="block-checkbox-manual">
                                    <input
                                      type="checkbox"
                                      checked={true}
                                      onChange={() => toggleBlock(type, block)}
                                      disabled={generating}
                                    />
                                    <span className="block-name-manual">
                                      {block}
                                    </span>
                                  </label>
                                  <select
                                    className="template-select-manual"
                                    value={blockTemplate}
                                    onChange={(e) =>
                                      setBlockTemplate(
                                        type,
                                        block,
                                        e.target.value
                                      )
                                    }
                                    disabled={generating}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {getAllTemplateIds().map((templateId) => (
                                      <option
                                        key={templateId}
                                        value={templateId}
                                      >
                                        {getTemplateDisplayName(templateId)}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    className="remove-block-btn-manual"
                                    onClick={() =>
                                      handleRemoveBlock(type, block)
                                    }
                                    type="button"
                                    disabled={generating}
                                  >
                                    ×
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  className="block-keywords-input-manual"
                                  value={keywords}
                                  onChange={(e) =>
                                    setBlockKeywordsForPage(
                                      type,
                                      block,
                                      e.target.value
                                    )
                                  }
                                  placeholder="Ключевые слова через запятую (на их основе будет сгенерирован блок)"
                                  disabled={generating}
                                />
                              </div>
                            );
                          })
                        )}
                      </div>
                      <div className="available-blocks-manual">
                        <h4>Доступные блоки:</h4>
                        <div className="available-blocks-list-manual">
                          {availableBlocks
                            .filter((block) => !selectedBlocks.includes(block))
                            .map((block) => {
                              const blockTemplate =
                                pageBlockTemplates[type]?.[block] || "h2_2p";
                              return (
                                <div key={block} className="block-row-manual">
                                  <label className="block-checkbox-manual">
                                    <input
                                      type="checkbox"
                                      checked={false}
                                      onChange={() => toggleBlock(type, block)}
                                      disabled={generating}
                                    />
                                    <span className="block-name-manual">
                                      {block}
                                    </span>
                                  </label>
                                  <select
                                    className="template-select-manual"
                                    value={blockTemplate}
                                    onChange={(e) =>
                                      setBlockTemplate(
                                        type,
                                        block,
                                        e.target.value
                                      )
                                    }
                                    disabled={generating}
                                  >
                                    {getAllTemplateIds().map((templateId) => (
                                      <option
                                        key={templateId}
                                        value={templateId}
                                      >
                                        {getTemplateDisplayName(templateId)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                      <div className="custom-block-section-manual">
                        {showAddInputs[type] ? (
                          <div className="add-custom-block-manual">
                            <input
                              type="text"
                              className="custom-block-input-manual"
                              value={newBlockNames[type] || ""}
                              onChange={(e) =>
                                setNewBlockNames((prev) => ({
                                  ...prev,
                                  [type]: e.target.value,
                                }))
                              }
                              onKeyPress={(e) => {
                                if (e.key === "Enter") {
                                  handleAddCustomBlock(type);
                                }
                              }}
                              placeholder="Название блока"
                              autoFocus
                              disabled={generating}
                            />
                            <input
                              type="text"
                              className="custom-block-input-manual"
                              value={newBlockKeywordsInputs[type] || ""}
                              onChange={(e) =>
                                setNewBlockKeywordsInputs((prev) => ({
                                  ...prev,
                                  [type]: e.target.value,
                                }))
                              }
                              onKeyPress={(e) => {
                                if (e.key === "Enter") {
                                  handleAddCustomBlock(type);
                                }
                              }}
                              placeholder="Ключевые слова через запятую (на их основе будет сгенерирован блок)"
                              disabled={generating}
                            />
                            <div className="add-custom-block-actions-manual">
                              <button
                                className="add-block-btn-manual"
                                onClick={() => handleAddCustomBlock(type)}
                                disabled={
                                  !newBlockNames[type]?.trim() ||
                                  generating ||
                                  selectedBlocks.includes(
                                    newBlockNames[type]?.trim() || ""
                                  )
                                }
                              >
                                Добавить
                              </button>
                              <button
                                className="cancel-add-btn-manual"
                                onClick={() => {
                                  setShowAddInputs((prev) => ({
                                    ...prev,
                                    [type]: false,
                                  }));
                                  setNewBlockNames((prev) => ({
                                    ...prev,
                                    [type]: "",
                                  }));
                                  setNewBlockKeywordsInputs((prev) => ({
                                    ...prev,
                                    [type]: "",
                                  }));
                                }}
                                disabled={generating}
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="add-custom-block-btn-manual"
                            onClick={() =>
                              setShowAddInputs((prev) => ({
                                ...prev,
                                [type]: true,
                              }))
                            }
                            disabled={generating}
                          >
                            + Добавить свой блок
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Отдельная секция для FAQ */}
            <div
              className="page-config-item"
              style={{
                marginTop: "20px",
                borderTop: "2px solid #ddd",
                paddingTop: "20px",
              }}
            >
              <div className="page-config-header">
                <h3>FAQ</h3>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <label className="block-checkbox">
                  <input
                    type="checkbox"
                    checked={generateFaq}
                    onChange={(e) => setGenerateFaq(e.target.checked)}
                    disabled={generating}
                  />
                  <span>Сгенерировать FAQ</span>
                </label>
                {generateFaq && (
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={faqCount}
                    onChange={(e) => setFaqCount(parseInt(e.target.value) || 5)}
                    placeholder="Количество вопросов"
                    style={{ width: "150px", padding: "6px" }}
                    disabled={generating}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="cancel-button"
            onClick={onClose}
            disabled={generating}
          >
            Отмена
          </button>
          <button
            className="generate-button"
            onClick={handleGenerate}
            disabled={
              generating ||
              (Object.values(pageBlocks).every(
                (blocks) => blocks.length === 0
              ) &&
                !generateFaq)
            }
          >
            {generating ? "Генерация..." : "Сгенерировать"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeneratePagesModal;

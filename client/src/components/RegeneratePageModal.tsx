import { useState, useEffect } from "react";
import "./RegeneratePageModal.css";
import {
  getTemplateDisplayName,
  getAllTemplateIds,
} from "../utils/templates.js";

import {
  promptLanguageForLocale,
  formatTextGenError,
} from "../utils/locale.js";

const API_URL = import.meta.env.VITE_API_URL || "";

type PageType =
  | "homepage"
  | "casino"
  | "slots"
  | "games"
  | "betting"
  | "app"
  | "login";

const PAGE_NAMES: Record<PageType, string> = {
  homepage: "Главная",
  casino: "Казино",
  slots: "Слоты",
  games: "Игры",
  betting: "Ставки",
  app: "Приложение",
  login: "Логин",
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

interface RegeneratePageModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  pageType: string; // Изменено на string для поддержки кастомных страниц
  projectSettings: {
    brand: string;
    language: string;
    country: string;
    domain: string;
    affiliateLink: string;
  };
  locales?: string[];
  defaultLocale?: string;
  currentBlocks?: string[];
  pageName?: string; // Название страницы для кастомных страниц
  isCustom?: boolean; // Флаг кастомной страницы
  onSuccess: () => void;
}

const RegeneratePageModal: React.FC<RegeneratePageModalProps> = ({
  isOpen,
  onClose,
  projectName,
  pageType,
  projectSettings,
  locales,
  defaultLocale,
  currentBlocks = [],
  pageName,
  isCustom = false,
  onSuccess,
}) => {
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>(currentBlocks);
  const [blockTemplates, setBlockTemplates] = useState<Record<string, string>>(
    {}
  );
  // Ключевые слова на блок (через запятую). Используются для уточнения,
  // на какую тему генерировать кастомный блок. Загружаются из
  // project-settings.json при открытии модалки.
  const [blockKeywords, setBlockKeywords] = useState<Record<string, string>>(
    {}
  );
  const [availableBlocks, setAvailableBlocks] = useState<string[]>([]);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockKeywords, setNewBlockKeywords] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [regeneratingBlockIndex, setRegeneratingBlockIndex] = useState<
    number | null
  >(null);
  const [ungeneratedBlocks, setUngeneratedBlocks] = useState<Set<string>>(
    new Set()
  );
  const [targetLocale, setTargetLocale] = useState<string>(
    defaultLocale || locales?.[0] || "en"
  );

  useEffect(() => {
    if (isOpen) {
      // Инициализируем состояние только при открытии модального окна
      setSelectedBlocks(currentBlocks);
      setUngeneratedBlocks(new Set()); // Сбрасываем список не сгенерированных блоков
      // Загружаем сохраненные шаблоны и ключевые слова из
      // project-settings.json, если они есть.
      const loadSavedTemplates = async () => {
        try {
          const response = await fetch(
            `${API_URL}/api/build/project/${projectName}`
          );
          const data = await response.json();
          const pageInfo = data.success
            ? data.project?.pages?.[pageType]
            : null;
          if (pageInfo?.blockTemplates) {
            setBlockTemplates(pageInfo.blockTemplates);
          } else {
            const templates: Record<string, string> = {};
            currentBlocks.forEach((block) => {
              templates[block] = "h2_2p";
            });
            setBlockTemplates(templates);
          }
          if (
            pageInfo?.blockKeywords &&
            typeof pageInfo.blockKeywords === "object"
          ) {
            setBlockKeywords(pageInfo.blockKeywords);
          } else {
            setBlockKeywords({});
          }
        } catch (err) {
          console.error("Ошибка загрузки сохраненных шаблонов:", err);
          const templates: Record<string, string> = {};
          currentBlocks.forEach((block) => {
            templates[block] = "h2_2p";
          });
          setBlockTemplates(templates);
          setBlockKeywords({});
        }
      };
      loadSavedTemplates();
      // Для кастомных страниц используем пустой массив доступных блоков
      // (все блоки будут кастомными)
      if (isCustom) {
        setAvailableBlocks([]);
      } else {
        // Для стандартных страниц используем предопределенные блоки
        const standardPageType = pageType as PageType;
        setAvailableBlocks(AVAILABLE_BLOCKS[standardPageType] || []);
      }
      setShowAddInput(false);
      setNewBlockName("");
      setNewBlockKeywords("");
      setTargetLocale(defaultLocale || locales?.[0] || "en");
    }
    // Убираем currentBlocks из зависимостей, чтобы не сбрасывать состояние при его изменении
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pageType, isCustom, projectName, defaultLocale, locales]);

  const toggleBlock = (block: string) => {
    if (selectedBlocks.includes(block)) {
      setSelectedBlocks(selectedBlocks.filter((b) => b !== block));
      // Удаляем шаблон при удалении блока
      setBlockTemplates((prev) => {
        const newTemplates = { ...prev };
        delete newTemplates[block];
        return newTemplates;
      });
      setBlockKeywords((prev) => {
        if (!prev[block]) return prev;
        const next = { ...prev };
        delete next[block];
        return next;
      });
    } else {
      setSelectedBlocks([...selectedBlocks, block]);
      // Устанавливаем дефолтный шаблон при добавлении блока
      setBlockTemplates((prev) => ({
        ...prev,
        [block]: "h2_2p",
      }));
    }
  };

  const updateBlockKeywords = (block: string, value: string) => {
    setBlockKeywords((prev) => {
      const next = { ...prev };
      const trimmed = value.trim();
      if (trimmed) {
        next[block] = value;
      } else {
        delete next[block];
      }
      return next;
    });
  };

  // Helper used by both flows below: pushes a new block name into local
  // state, persists the new block list to project-settings.json, and
  // marks the block as "ungenerated" until the user clicks ▶ on it.
  const persistNewBlock = (
    blockName: string,
    keywords?: string
  ): {
    newBlocks: string[];
    newTemplates: Record<string, string>;
    newKeywords: Record<string, string>;
  } => {
    const newBlocks = [...selectedBlocks, blockName];
    const newTemplates = {
      ...blockTemplates,
      [blockName]: "h2_2p",
    };
    const trimmedKw = keywords?.trim() || "";
    const newKeywords = { ...blockKeywords };
    if (trimmedKw) {
      newKeywords[blockName] = trimmedKw;
    }
    setSelectedBlocks(newBlocks);
    setBlockTemplates(newTemplates);
    setBlockKeywords(newKeywords);
    setUngeneratedBlocks((prev) => new Set(prev).add(blockName));

    fetch(`${API_URL}/api/build/update-blocks-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectName: projectName,
        pageType: pageType,
        blocks: newBlocks,
        blockTemplates: newTemplates,
        blockKeywords: newKeywords,
      }),
    }).catch((err) => {
      console.warn(
        "Не удалось сохранить новый блок в project-settings.json:",
        err
      );
    });

    return { newBlocks, newTemplates, newKeywords };
  };

  const handleAddCustomBlock = () => {
    if (newBlockName.trim() && !selectedBlocks.includes(newBlockName.trim())) {
      const blockName = newBlockName.trim();
      persistNewBlock(blockName, newBlockKeywords);
      setNewBlockName("");
      setNewBlockKeywords("");
      setShowAddInput(false);
    }
  };

  /**
   * "Add custom block & generate immediately" — combines the previous
   * 2-step flow (add then click ▶) into a single click. Used for pages
   * that have already been generated, so the user can extend them
   * without a full regeneration.
   */
  const handleAddCustomBlockAndGenerate = async () => {
    const blockName = newBlockName.trim();
    if (!blockName || selectedBlocks.includes(blockName)) return;

    const { newBlocks, newKeywords } = persistNewBlock(
      blockName,
      newBlockKeywords
    );
    const keywordsForBlock = newKeywords[blockName] || "";
    setNewBlockName("");
    setNewBlockKeywords("");
    setShowAddInput(false);

    const newBlockIndex = newBlocks.length - 1;
    if (regeneratingBlockIndex !== null) return;
    setRegeneratingBlockIndex(newBlockIndex);

    try {
      const response = await fetch(
        `${API_URL}/api/text-generation/generate-single-block`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand: projectSettings.brand,
            language: promptLanguageForLocale(targetLocale),
            country: projectSettings.country,
            domain: projectSettings.domain,
            affiliateLink: projectSettings.affiliateLink,
            pageType: pageType,
            blockType: blockName,
            blockTemplate: "h2_2p",
            projectName: projectName,
            blockIndex: newBlockIndex,
            pageName: pageName,
            isCustom: isCustom,
            locale: targetLocale,
            blockKeywords: keywordsForBlock || undefined,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          formatTextGenError(data) || "Ошибка при генерации блока"
        );
      }
      setUngeneratedBlocks((prev) => {
        const next = new Set(prev);
        next.delete(blockName);
        return next;
      });
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при генерации блока");
    } finally {
      setRegeneratingBlockIndex(null);
    }
  };

  const handleRemoveBlock = async (block: string) => {
    const blockIndex = selectedBlocks.indexOf(block);
    if (blockIndex === -1) return;

    const newBlocks = selectedBlocks.filter((b) => b !== block);

    // Удаляем шаблон при удалении блока
    const newTemplates = { ...blockTemplates };
    delete newTemplates[block];
    setBlockTemplates(newTemplates);

    // И удаляем ключевые слова, привязанные к этому блоку
    const newKeywords = { ...blockKeywords };
    delete newKeywords[block];
    setBlockKeywords(newKeywords);

    // Если блок ещё не был сгенерирован (был добавлен только в UI),
    // на сервере его нет ни в JSON-файле страницы, ни (часто) самой
    // страницы вообще — она ещё ни разу не генерировалась. В этом
    // случае серверный /delete-block возвращает 404 "Page not found",
    // и пользователь видит ложный алерт. Поэтому для таких блоков
    // просто обновляем локальное состояние и project-settings.json.
    const isLocalOnlyBlock = ungeneratedBlocks.has(block);

    // Сразу убираем блок из списка не сгенерированных
    setUngeneratedBlocks((prev) => {
      const newSet = new Set(prev);
      newSet.delete(block);
      return newSet;
    });

    // Обновляем список блоков в UI оптимистично — пользователь не
    // должен ждать и видеть "мигание" блока, который уже удалили.
    setSelectedBlocks(newBlocks);

    try {
      if (!isLocalOnlyBlock) {
        // Блок реально присутствует в JSON страницы — удаляем с сервера
        // (с переносом изображений/кнопок на соседние блоки).
        const deleteResponse = await fetch(`${API_URL}/api/build/delete-block`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectName: projectName,
            pageType: pageType,
            blockType: block, // Передаем название блока для поиска в JSON
            pageName: pageName,
            isCustom: isCustom,
          }),
        });

        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json().catch(() => ({}));
          // 404 на этом эндпойнте означает, что страница/блок не были
          // сохранены — это не ошибка пользователя, просто чистим UI.
          if (deleteResponse.status !== 404) {
            throw new Error(errorData.error || "Ошибка при удалении блока");
          }
        }
      }

      // Обновляем project-settings.json (всегда — и для локально
      // добавленных, и для реально удалённых).
      const saveOrderResponse = await fetch(
        `${API_URL}/api/build/update-blocks-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectName: projectName,
            pageType: pageType,
            blocks: newBlocks,
            blockTemplates: newTemplates,
            blockKeywords: newKeywords,
          }),
        }
      );

      if (!saveOrderResponse.ok) {
        console.warn(
          "Не удалось обновить project-settings.json при удалении блока"
        );
      }

      // Не вызываем onSuccess() здесь, чтобы не перезагружать модальное окно
    } catch (err: any) {
      console.error("Ошибка при удалении блока:", err);
      alert(err.message || "Произошла ошибка при удалении блока");
    }
  };

  const setBlockTemplate = (block: string, templateId: string) => {
    setBlockTemplates((prev) => ({
      ...prev,
      [block]: templateId,
    }));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    const newBlocks = [...selectedBlocks];
    const draggedBlock = newBlocks[draggedIndex];
    newBlocks.splice(draggedIndex, 1);
    newBlocks.splice(index, 0, draggedBlock);
    setSelectedBlocks(newBlocks);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex !== null) {
      // После перемещения блока нужно обновить изображения в JSON
      await updatePageBlocksOrder();
    }
    setDraggedIndex(null);
  };

  const updatePageBlocksOrder = async () => {
    try {
      // Сохраняем порядок блоков в project-settings.json
      const saveOrderResponse = await fetch(
        `${API_URL}/api/build/update-blocks-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectName: projectName,
            pageType: pageType,
            blocks: selectedBlocks,
            blockTemplates: blockTemplates,
            blockKeywords: blockKeywords,
          }),
        }
      );

      if (!saveOrderResponse.ok) {
        console.error(
          "Ошибка при сохранении порядка блоков в project-settings.json"
        );
        return;
      }

      // Загружаем текущий JSON страницы
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}`
      );
      const data = await response.json();

      if (!data.success || !data.project?.pages?.[pageType]?.filePath) {
        return;
      }

      const pageQuery =
        locales && locales.length > 1
          ? `?locale=${encodeURIComponent(targetLocale)}`
          : "";
      const pageResponse = await fetch(
        `${API_URL}/api/build/project/${projectName}/page/${pageType}${pageQuery}`
      );
      const pageDataResponse = await pageResponse.json();

      if (!pageDataResponse.success || !pageDataResponse.data?.pageData) {
        return;
      }

      const pageJson = pageDataResponse.data.pageData;
      const imgBase =
        isCustom && pageName
          ? pageName.toLowerCase().replace(/[^a-z0-9]/g, "_")
          : pageType;

      // Переупорядочиваем блоки в JSON согласно новому порядку
      const reorderedBlocks: any[] = [];
      selectedBlocks.forEach((blockType) => {
        const block = pageJson.blocks.find(
          (b: any) => b.blockType === blockType
        );
        if (block) {
          reorderedBlocks.push(block);
        }
      });

      // Обновляем изображения в блоках согласно новому порядку
      reorderedBlocks.forEach((block: any, index: number) => {
        const isFirst = index === 0;
        const isLast = index === reorderedBlocks.length - 1;

        // Удаляем старые image и button элементы
        block.elements = block.elements.filter(
          (el: any) => el.type !== "image" && el.type !== "button"
        );

        // Добавляем изображения согласно правилам
        if (isFirst) {
          block.elements.push({
            type: "image",
            src: imgBase + "1",
          });
        }

        if (isLast) {
          block.elements.push(
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
      });

      pageJson.blocks = reorderedBlocks;

      // Сохраняем обновленный JSON
      const saveResponse = await fetch(
        `${API_URL}/api/build/project/${projectName}/page/${pageType}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pageData: pageJson,
            ...(locales && locales.length > 1
              ? { locale: targetLocale }
              : {}),
          }),
        }
      );

      if (!saveResponse.ok) {
        console.error("Ошибка при сохранении порядка блоков в JSON");
      }
      // Не вызываем onSuccess() здесь, чтобы не перезагружать модальное окно
    } catch (err) {
      console.error("Ошибка при обновлении порядка блоков:", err);
    }
  };

  const handleRegenerateSingleBlock = async (blockIndex: number) => {
    if (regeneratingBlockIndex !== null) return;

    setRegeneratingBlockIndex(blockIndex);

    try {
      const blockType = selectedBlocks[blockIndex];
      const blockTemplate = blockTemplates[blockType] || "h2_2p";
      const blockKeywordsForBlock = blockKeywords[blockType] || "";

      const response = await fetch(
        `${API_URL}/api/text-generation/generate-single-block`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            brand: projectSettings.brand,
            language: promptLanguageForLocale(targetLocale),
            country: projectSettings.country,
            domain: projectSettings.domain,
            affiliateLink: projectSettings.affiliateLink,
            pageType: pageType,
            blockType: blockType,
            blockTemplate: blockTemplate,
            projectName: projectName,
            blockIndex: blockIndex,
            pageName: pageName,
            isCustom: isCustom,
            locale: targetLocale,
            blockKeywords: blockKeywordsForBlock || undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          formatTextGenError(data) || "Ошибка при перегенерации блока"
        );
      }

      // Обновляем project-settings.json с текущим порядком блоков
      const saveOrderResponse = await fetch(
        `${API_URL}/api/build/update-blocks-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectName: projectName,
            pageType: pageType,
            blocks: selectedBlocks,
            blockTemplates: blockTemplates,
            blockKeywords: blockKeywords,
          }),
        }
      );

      if (!saveOrderResponse.ok) {
        console.warn("Не удалось обновить project-settings.json");
      }

      // Убираем блок из списка не сгенерированных
      setUngeneratedBlocks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(blockType);
        return newSet;
      });

      // Не вызываем onSuccess() здесь, чтобы не перезагружать модальное окно
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при перегенерации блока");
    } finally {
      setRegeneratingBlockIndex(null);
    }
  };

  const handleGenerate = async () => {
    if (selectedBlocks.length === 0) {
      return;
    }

    setGenerating(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      // Для кастомных страниц используем специальный endpoint
      const endpoint = isCustom
        ? `${API_URL}/api/text-generation/generate-custom`
        : `${API_URL}/api/text-generation/generate`;

      // Отдельно собираем ключевые слова только для тех блоков,
      // которые сейчас в списке (на случай если что-то осталось от
      // удалённых блоков).
      const keywordsToSend: Record<string, string> = {};
      selectedBlocks.forEach((b) => {
        const v = blockKeywords[b];
        if (typeof v === "string" && v.trim()) {
          keywordsToSend[b] = v.trim();
        }
      });

      const requestBody: any = {
        brand: projectSettings.brand,
        language: promptLanguageForLocale(targetLocale),
        country: projectSettings.country,
        domain: projectSettings.domain,
        affiliateLink: projectSettings.affiliateLink,
        blocks: selectedBlocks,
        blockTemplates: blockTemplates, // Передаем выбранные шаблоны
        projectName: projectName, // Передаем projectName для получения вариантов из project-settings.json
      };
      if (Object.keys(keywordsToSend).length > 0) {
        requestBody.blockKeywords = keywordsToSend;
      }

      // Для кастомных страниц добавляем pageName
      if (isCustom && pageName) {
        requestBody.pageName = pageName;
      } else {
        requestBody.pageType = pageType;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(formatTextGenError(data) || "Ошибка при генерации");
      }

      const pageInfoPayload = {
        pageType: pageType,
        blocks: selectedBlocks,
        generated: true,
        blockTemplates: blockTemplates,
        blockKeywords: keywordsToSend,
        ...(isCustom && pageName
          ? { pageName: pageName, isCustom: true }
          : {}),
      };

      const useLocalized =
        Array.isArray(locales) && locales.length > 0;
      const saveBody: Record<string, unknown> = {
        projectName: projectName,
        pagesInfo: {
          [pageType]: pageInfoPayload,
        },
      };
      if (useLocalized) {
        saveBody.localizedPages = {
          [targetLocale]: { [pageType]: data.data },
        };
      } else {
        saveBody.pages = { [pageType]: data.data };
      }

      const saveResponse = await fetch(`${API_URL}/api/build/save-pages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(saveBody),
      });

      const saveData = await saveResponse.json();

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить страницу");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при генерации");
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  const unusedBlocks = availableBlocks.filter(
    (block) => !selectedBlocks.includes(block)
  );

  return (
    <div className="modal-overlay">
      <div
        className="regenerate-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            Перегенерировать:{" "}
            {isCustom
              ? pageName || pageType
              : PAGE_NAMES[pageType as PageType] || pageType}
          </h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {locales && locales.length > 1 ? (
            <div style={{ marginBottom: "12px" }}>
              <label>
                Локаль текста:{" "}
                <select
                  value={targetLocale}
                  onChange={(e) => setTargetLocale(e.target.value)}
                  disabled={generating}
                >
                  {locales.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc} — {promptLanguageForLocale(loc)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="blocks-section">
            <div className="selected-blocks-section">
              <h3>Выбранные блоки (порядок генерации)</h3>
              <div className="selected-blocks-list">
                {selectedBlocks.length === 0 ? (
                  <div className="empty-blocks">Нет выбранных блоков</div>
                ) : (
                  selectedBlocks.map((block, index) => (
                    <div
                      key={`${block}-${index}`}
                      className={`selected-block-item-wrapper ${
                        draggedIndex === index ? "dragging" : ""
                      }`}
                      onDragOver={(e) => handleDragOver(e, index)}
                    >
                      <div
                        className="selected-block-item"
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragEnd={handleDragEnd}
                      >
                        <span className="drag-handle">☰</span>
                        <span
                          className={`block-name ${
                            ungeneratedBlocks.has(block)
                              ? "ungenerated-block"
                              : ""
                          }`}
                        >
                          {block}
                          {ungeneratedBlocks.has(block) && (
                            <span className="ungenerated-badge">
                              {" "}
                              (не сгенерирован)
                            </span>
                          )}
                        </span>
                        <select
                          className="template-select"
                          value={blockTemplates[block] || "h2_2p"}
                          onChange={(e) =>
                            setBlockTemplate(block, e.target.value)
                          }
                          disabled={
                            generating || regeneratingBlockIndex !== null
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          {getAllTemplateIds().map((templateId) => (
                            <option key={templateId} value={templateId}>
                              {getTemplateDisplayName(templateId)}
                            </option>
                          ))}
                        </select>
                        <button
                          className={`regenerate-block-btn ${
                            ungeneratedBlocks.has(block)
                              ? "generate-new-block-btn"
                              : ""
                          }`}
                          onClick={() => handleRegenerateSingleBlock(index)}
                          disabled={
                            generating || regeneratingBlockIndex !== null
                          }
                          title={
                            ungeneratedBlocks.has(block)
                              ? "Сгенерировать этот блок"
                              : "Перегенерировать этот блок"
                          }
                          type="button"
                        >
                          {regeneratingBlockIndex === index
                            ? "..."
                            : ungeneratedBlocks.has(block)
                            ? "▶"
                            : "↻"}
                        </button>
                        <button
                          className="remove-block-btn"
                          onClick={() => handleRemoveBlock(block)}
                          type="button"
                          disabled={
                            generating || regeneratingBlockIndex !== null
                          }
                        >
                          ×
                        </button>
                      </div>
                      <input
                        type="text"
                        className="block-keywords-input"
                        value={blockKeywords[block] || ""}
                        onChange={(e) =>
                          updateBlockKeywords(block, e.target.value)
                        }
                        placeholder="Ключевые слова через запятую (на их основе будет сгенерирован блок)"
                        disabled={
                          generating || regeneratingBlockIndex !== null
                        }
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            {!isCustom && (
              <div className="available-blocks-section">
                <h3>Доступные блоки</h3>
                <div className="available-blocks-list">
                  {unusedBlocks.map((block) => (
                    <label key={block} className="block-checkbox">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleBlock(block)}
                        disabled={generating}
                      />
                      <span>{block}</span>
                    </label>
                  ))}
                  {unusedBlocks.length === 0 && (
                    <div className="empty-blocks">Все блоки выбраны</div>
                  )}
                </div>
              </div>
            )}

            <div className="custom-block-section">
              {showAddInput ? (
                <div className="add-custom-block">
                  <input
                    type="text"
                    className="custom-block-input"
                    value={newBlockName}
                    onChange={(e) => setNewBlockName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        handleAddCustomBlockAndGenerate();
                      }
                    }}
                    placeholder="Название блока"
                    autoFocus
                  />
                  <input
                    type="text"
                    className="custom-block-input"
                    value={newBlockKeywords}
                    onChange={(e) => setNewBlockKeywords(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        handleAddCustomBlockAndGenerate();
                      }
                    }}
                    placeholder="Ключевые слова через запятую (на их основе будет сгенерирован блок)"
                  />
                  <div className="add-custom-block-actions">
                    <button
                      className="add-block-btn"
                      onClick={handleAddCustomBlockAndGenerate}
                      disabled={
                        !newBlockName.trim() ||
                        generating ||
                        regeneratingBlockIndex !== null
                      }
                      title="Добавить блок и сразу сгенерировать его в текущую страницу"
                    >
                      + Сгенерировать сейчас
                    </button>
                    <button
                      className="add-block-btn"
                      onClick={handleAddCustomBlock}
                      disabled={!newBlockName.trim() || generating}
                      style={{
                        background: "var(--ui-surface-3)",
                        color: "var(--ui-fg-soft)",
                      }}
                      title="Добавить блок в список без генерации"
                    >
                      Только добавить
                    </button>
                    <button
                      className="cancel-add-btn"
                      onClick={() => {
                        setShowAddInput(false);
                        setNewBlockName("");
                        setNewBlockKeywords("");
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="add-custom-block-btn"
                  onClick={() => setShowAddInput(true)}
                  disabled={generating}
                >
                  + Добавить свой блок
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="cancel-button"
            onClick={onClose}
            disabled={generating || regeneratingBlockIndex !== null}
          >
            Отмена
          </button>
          <button
            className="save-order-button"
            onClick={async () => {
              await updatePageBlocksOrder();
            }}
            disabled={
              generating ||
              regeneratingBlockIndex !== null ||
              selectedBlocks.length === 0
            }
            style={{ marginRight: "10px" }}
          >
            Сохранить порядок
          </button>
          <button
            className="generate-button"
            onClick={handleGenerate}
            disabled={
              generating ||
              selectedBlocks.length === 0 ||
              regeneratingBlockIndex !== null
            }
          >
            {generating ? "Генерация..." : "Перегенерировать"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegeneratePageModal;

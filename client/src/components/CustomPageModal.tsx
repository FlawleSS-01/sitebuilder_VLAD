import { useState, useEffect } from "react";
import "./CustomPageModal.css";
import {
  getTemplateDisplayName,
  getAllTemplateIds,
} from "../utils/templates.js";

const API_URL = import.meta.env.VITE_API_URL || "";

interface CustomPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  projectSettings: {
    brand: string;
    language: string;
    country: string;
    domain: string;
    affiliateLink: string;
  };
  onSuccess: () => void;
}

const CustomPageModal: React.FC<CustomPageModalProps> = ({
  isOpen,
  onClose,
  projectName,
  projectSettings,
  onSuccess,
}) => {
  const [pageName, setPageName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [blockTemplates, setBlockTemplates] = useState<Record<string, string>>(
    {}
  );
  // Ключевые слова на каждый кастомный блок (хранятся как введённая
  // пользователем строка через запятую — на сервер уходит тем же
  // форматом, бэкенд сам сплитит и нормализует).
  const [blockKeywords, setBlockKeywords] = useState<Record<string, string>>(
    {}
  );
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockKeywords, setNewBlockKeywords] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"page" | "faq">("page");
  const [faqCount, setFaqCount] = useState<number>(5);
  const [generatingFaq, setGeneratingFaq] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPageName("");
      setDisplayName("");
      setSelectedBlocks([]);
      setBlockTemplates({});
      setBlockKeywords({});
      setShowAddInput(false);
      setNewBlockName("");
      setNewBlockKeywords("");
      setError(null);
      setActiveTab("page");
      setFaqCount(5);
    }
  }, [isOpen]);

  // Автоматически обновляем displayName при изменении pageName
  useEffect(() => {
    if (pageName && !displayName) {
      // Генерируем displayName из pageName: заменяем тире на пробелы и капитализируем
      const generated = pageName
        .replace(/[-_]/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
      setDisplayName(generated);
    }
  }, [pageName]);

  const handleAddCustomBlock = () => {
    if (newBlockName.trim() && !selectedBlocks.includes(newBlockName.trim())) {
      const blockName = newBlockName.trim();
      setSelectedBlocks([...selectedBlocks, blockName]);
      // Устанавливаем дефолтный шаблон для нового блока
      setBlockTemplates((prev) => ({
        ...prev,
        [blockName]: "h2_2p",
      }));
      // Сохраняем введённые ключевые слова для этого блока (если есть)
      const kw = newBlockKeywords.trim();
      if (kw) {
        setBlockKeywords((prev) => ({
          ...prev,
          [blockName]: kw,
        }));
      }
      setNewBlockName("");
      setNewBlockKeywords("");
      setShowAddInput(false);
    }
  };

  const handleRemoveBlock = (block: string) => {
    setSelectedBlocks(selectedBlocks.filter((b) => b !== block));
    // Удаляем шаблон при удалении блока
    setBlockTemplates((prev) => {
      const newTemplates = { ...prev };
      delete newTemplates[block];
      return newTemplates;
    });
    setBlockKeywords((prev) => {
      const next = { ...prev };
      delete next[block];
      return next;
    });
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

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleGenerate = async () => {
    if (!pageName.trim()) {
      setError("Введите название страницы");
      return;
    }

    if (!displayName.trim()) {
      setError("Введите название для меню/хэдера");
      return;
    }

    if (selectedBlocks.length === 0) {
      setError("Выберите хотя бы один блок");
      return;
    }

    setError(null);
    setGenerating(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      // Генерируем кастомную страницу с использованием общей модели
      const response = await fetch(
        `${API_URL}/api/text-generation/generate-custom`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            brand: projectSettings.brand,
            language: projectSettings.language,
            country: projectSettings.country,
            domain: projectSettings.domain,
            affiliateLink: projectSettings.affiliateLink,
            pageName: pageName.trim(),
            blocks: selectedBlocks,
            blockTemplates: blockTemplates, // Передаем выбранные шаблоны
            blockKeywords: blockKeywords, // Передаем ключевые слова для блоков
            projectName: projectName, // Передаем projectName для получения вариантов из project-settings.json
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка при генерации страницы");
      }

      // Создаем идентификатор для кастомной страницы из названия
      const customPageId = pageName.toLowerCase().replace(/[^a-z0-9]/g, "-");

      // Сохраняем страницу в проект
      const saveResponse = await fetch(`${API_URL}/api/build/save-pages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName: projectName,
          pages: {
            [customPageId]: data.data,
          },
          pagesInfo: {
            [customPageId]: {
              pageType: customPageId,
              pageName: pageName.trim(),
              displayName: displayName.trim() || pageName.trim(),
              blocks: selectedBlocks,
              generated: true,
              isCustom: true,
              blockTemplates: blockTemplates, // Сохраняем выбранные шаблоны
              blockKeywords: blockKeywords, // Сохраняем ключевые слова блоков для последующих перегенераций
            },
          },
        }),
      });

      const saveData = await saveResponse.json();

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить страницу");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при генерации");
      console.error("Error:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateFAQ = async () => {
    if (faqCount < 1 || faqCount > 50) {
      setError("Количество вопросов должно быть от 1 до 50");
      return;
    }

    setError(null);
    setGeneratingFaq(true);

    try {
      const response = await fetch(
        `${API_URL}/api/text-generation/generate-faq`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            brand: projectSettings.brand,
            language: projectSettings.language,
            country: projectSettings.country,
            count: faqCount,
            projectName: projectName, // Передаем projectName для получения вариантов из project-settings.json
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка при генерации FAQ");
      }

      // Сохраняем FAQ в проект
      const saveResponse = await fetch(`${API_URL}/api/build/save-pages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName: projectName,
          faq: data.data,
        }),
      });

      const saveData = await saveResponse.json();

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить FAQ");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при генерации FAQ");
      console.error("Error:", err);
    } finally {
      setGeneratingFaq(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div
        className="custom-page-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Создать кастомную страницу</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab-button ${activeTab === "page" ? "active" : ""}`}
            onClick={() => setActiveTab("page")}
            disabled={generating || generatingFaq}
          >
            Страница
          </button>
          <button
            className={`tab-button ${activeTab === "faq" ? "active" : ""}`}
            onClick={() => setActiveTab("faq")}
            disabled={generating || generatingFaq}
          >
            FAQ
          </button>
        </div>

        <div className="modal-body">
          {activeTab === "page" && (
            <>
              <div className="page-name-section">
                <label htmlFor="page-name">Название страницы *</label>
                <input
                  id="page-name"
                  type="text"
                  className="page-name-input"
                  value={pageName}
                  onChange={(e) => setPageName(e.target.value)}
                  placeholder="Введите название страницы"
                  disabled={generating}
                />
                <small className="page-url-hint">
                  URL страницы: /{pageName ? pageName.toLowerCase().replace(/[^a-z0-9]/g, "-") : "..."}
                </small>
              </div>

              <div className="display-name-section">
                <label htmlFor="display-name">Название в меню/хэдере *</label>
                <input
                  id="display-name"
                  type="text"
                  className="display-name-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Название для отображения в меню"
                  disabled={generating}
                />
                <small className="display-name-hint">
                  Это название будет отображаться в навигации сайта
                </small>
              </div>

              {error && (
                <div className="error-message">
                  <strong>Ошибка:</strong> {error}
                </div>
              )}

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
                            <span className="block-name">{block}</span>
                            <select
                              className="template-select"
                              value={blockTemplates[block] || "h2_2p"}
                              onChange={(e) =>
                                setBlockTemplate(block, e.target.value)
                              }
                              disabled={generating}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {getAllTemplateIds().map((templateId) => (
                                <option key={templateId} value={templateId}>
                                  {getTemplateDisplayName(templateId)}
                                </option>
                              ))}
                            </select>
                            <button
                              className="remove-block-btn"
                              onClick={() => handleRemoveBlock(block)}
                              type="button"
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
                            disabled={generating}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>

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
                            handleAddCustomBlock();
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
                            handleAddCustomBlock();
                          }
                        }}
                        placeholder="Ключевые слова через запятую (на их основе будет сгенерирован блок)"
                      />
                      <div className="add-custom-block-actions">
                        <button
                          className="add-block-btn"
                          onClick={handleAddCustomBlock}
                          disabled={!newBlockName.trim() || generating}
                        >
                          Добавить
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
                      + Добавить блок
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "faq" && (
            <div className="faq-tab-content">
              {error && (
                <div className="error-message">
                  <strong>Ошибка:</strong> {error}
                </div>
              )}

              <div className="faq-form">
                <div className="form-group">
                  <label htmlFor="faq-count">Количество вопросов *</label>
                  <input
                    id="faq-count"
                    type="number"
                    min="1"
                    max="50"
                    value={faqCount}
                    onChange={(e) => setFaqCount(parseInt(e.target.value) || 5)}
                    placeholder="От 1 до 50"
                    disabled={generatingFaq}
                  />
                  <small>Введите количество вопросов FAQ (от 1 до 50)</small>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="cancel-button"
            onClick={onClose}
            disabled={generating || generatingFaq}
          >
            Отмена
          </button>
          {activeTab === "page" && (
            <button
              className="generate-button"
              onClick={handleGenerate}
              disabled={
                generating || !pageName.trim() || selectedBlocks.length === 0
              }
            >
              {generating ? "Генерация..." : "Сгенерировать"}
            </button>
          )}
          {activeTab === "faq" && (
            <button
              className="generate-button"
              onClick={handleGenerateFAQ}
              disabled={generatingFaq || faqCount < 1 || faqCount > 50}
            >
              {generatingFaq ? "Генерация..." : "Сгенерировать FAQ"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomPageModal;

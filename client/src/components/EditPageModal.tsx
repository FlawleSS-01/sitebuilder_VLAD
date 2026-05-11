import { useState, useEffect } from "react";
import "./EditPageModal.css";

const API_URL = import.meta.env.VITE_API_URL || "";

interface EditPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  pageType: string;
  onSuccess: () => void;
}

interface PageElement {
  type: string;
  text?: string;
  title?: string;
  description?: string;
  items?: string[] | Array<{ title: string; description: string }>;
  src?: string;
}

interface PageBlock {
  blockType: string;
  elements: PageElement[];
}

interface PageData {
  title: string;
  description: string;
  h1: string;
  h1Description: string;
  blocks: PageBlock[];
}

interface FAQData {
  h2: string;
  text: string;
  items: Array<{
    question: string;
    answer: string;
  }>;
  variant?: number;
}

const EditPageModal: React.FC<EditPageModalProps> = ({
  isOpen,
  onClose,
  projectName,
  pageType,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [pageName, setPageName] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [faqData, setFaqData] = useState<FAQData | null>(null);
  const isHomepage = pageType === "homepage" || pageType === "main";

  useEffect(() => {
    if (isOpen && projectName && pageType) {
      loadPageData();
    }
  }, [isOpen, projectName, pageType]);

  const loadPageData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/page/${pageType}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить страницу");
      }

      setPageData(data.data.pageData);
      if (data.data.pageInfo) {
        setPageName(data.data.pageInfo.pageName || "");
        setDisplayName(data.data.pageInfo.displayName || "");
      }
      // Загружаем FAQ если это главная страница
      if (isHomepage && data.data.faq) {
        setFaqData(data.data.faq);
      } else {
        setFaqData(null);
      }
    } catch (err: any) {
      console.error("Error loading page:", err);
      setError(err.message || "Произошла ошибка при загрузке страницы");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!pageData) return;

    setSaving(true);
    setError(null);

    try {
      // Сначала сохраняем данные страницы
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/page/${pageType}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pageData,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить страницу");
      }

      // Затем обновляем slug и displayName если они изменились
      if (pageName.trim() || displayName.trim()) {
        const updateResponse = await fetch(
          `${API_URL}/api/build/project/${projectName}/page/${pageType}/metadata`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              pageName: pageName.trim() || undefined,
              displayName: displayName.trim() || undefined,
            }),
          }
        );

        const updateData = await updateResponse.json();

        if (!updateResponse.ok) {
          throw new Error(updateData.error || "Не удалось сохранить метаданные страницы");
        }
      }

      // Сохраняем FAQ если это главная страница и FAQ существует
      if (isHomepage && faqData) {
        const faqResponse = await fetch(
          `${API_URL}/api/build/project/${projectName}/faq`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              faq: {
                faq: faqData,
              },
            }),
          }
        );

        const faqResponseData = await faqResponse.json();

        if (!faqResponse.ok) {
          throw new Error(faqResponseData.error || "Не удалось сохранить FAQ");
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error saving page:", err);
      setError(err.message || "Произошла ошибка при сохранении страницы");
    } finally {
      setSaving(false);
    }
  };

  const updateElement = (
    blockIndex: number,
    elementIndex: number,
    field: string,
    value: string
  ) => {
    if (!pageData) return;

    const updatedData = { ...pageData };
    const block = updatedData.blocks[blockIndex];
    const element = block.elements[elementIndex];

    if (field === "text" || field === "title" || field === "description") {
      (element as any)[field] = value;
    } else if (field === "items") {
      // Для списков - разбиваем по строкам и создаем объекты
      const lines = value.split("\n").filter((item) => item.trim());
      // Проверяем, были ли элементы объектами или строками
      const isObjectFormat = Array.isArray(element.items) && element.items.length > 0 && typeof element.items[0] === "object";
      
      if (isObjectFormat) {
        // Если были объектами, сохраняем как объекты
        element.items = lines.map((line) => {
          // Пытаемся разбить строку на title и description (разделитель - двоеточие или табуляция)
          const parts = line.split(/[:：]\s*/);
          if (parts.length >= 2) {
            return { title: parts[0].trim(), description: parts.slice(1).join(":").trim() };
          }
          return { title: line.trim(), description: "" };
        });
      } else {
        // Если были строками, сохраняем как строки
        element.items = lines;
      }
    }

    setPageData(updatedData);
  };

  const updateListItem = (
    blockIndex: number,
    elementIndex: number,
    itemIndex: number,
    field: "title" | "description",
    value: string
  ) => {
    if (!pageData) return;

    const updatedData = { ...pageData };
    const block = updatedData.blocks[blockIndex];
    const element = block.elements[elementIndex];

    if (Array.isArray(element.items) && element.items[itemIndex]) {
      const item = element.items[itemIndex];
      if (typeof item === "object" && item !== null) {
        (item as any)[field] = value;
      }
    }

    setPageData(updatedData);
  };

  const updatePageField = (field: string, value: string) => {
    if (!pageData) return;
    setPageData({ ...pageData, [field]: value });
  };

  const updateFAQField = (field: "h2" | "text", value: string) => {
    if (!faqData) return;
    setFaqData({ ...faqData, [field]: value });
  };

  const updateFAQItem = (index: number, field: "question" | "answer", value: string) => {
    if (!faqData) return;
    const updatedItems = [...faqData.items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };
    setFaqData({ ...faqData, items: updatedItems });
  };

  const addFAQItem = () => {
    if (!faqData) return;
    setFaqData({
      ...faqData,
      items: [...faqData.items, { question: "", answer: "" }],
    });
  };

  const removeFAQItem = (index: number) => {
    if (!faqData) return;
    const updatedItems = faqData.items.filter((_, i) => i !== index);
    setFaqData({ ...faqData, items: updatedItems });
  };

  if (!isOpen) return null;

  return (
    <div className="edit-page-modal-overlay">
      <div
        className="edit-page-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edit-page-modal-header">
          <h2>Редактирование страницы: {pageType}</h2>
          <button className="edit-page-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {loading && (
          <div className="edit-page-modal-loading">Загрузка страницы...</div>
        )}

        {error && (
          <div className="edit-page-modal-error">
            <strong>Ошибка:</strong> {error}
          </div>
        )}

        {pageData && !loading && (
          <div className="edit-page-modal-body">
            {/* Поля для slug и displayName */}
            <div className="edit-page-section">
              <h3>Настройки страницы</h3>
              <div className="edit-page-field">
                <label>Slug (URL страницы):</label>
                <input
                  type="text"
                  value={pageName}
                  onChange={(e) => {
                    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                    setPageName(value);
                  }}
                  placeholder={pageType}
                  disabled={saving}
                />
                <small>URL страницы: /{pageName || pageType}</small>
              </div>
              <div className="edit-page-field">
                <label>Название в меню/хэдере:</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Название для отображения в меню"
                  disabled={saving}
                />
                <small>Это название будет отображаться в навигации сайта</small>
              </div>
            </div>

            {/* Основные поля страницы */}
            <div className="edit-page-section">
              <h3>Основная информация</h3>
              <div className="edit-page-field">
                <label>Title:</label>
                <input
                  type="text"
                  value={pageData.title}
                  onChange={(e) => updatePageField("title", e.target.value)}
                />
              </div>
              <div className="edit-page-field">
                <label>Description:</label>
                <textarea
                  value={pageData.description}
                  onChange={(e) =>
                    updatePageField("description", e.target.value)
                  }
                  rows={3}
                />
              </div>
              <div className="edit-page-field">
                <label>H1:</label>
                <input
                  type="text"
                  value={pageData.h1}
                  onChange={(e) => updatePageField("h1", e.target.value)}
                />
              </div>
              <div className="edit-page-field">
                <label>H1 Description:</label>
                <textarea
                  value={pageData.h1Description}
                  onChange={(e) =>
                    updatePageField("h1Description", e.target.value)
                  }
                  rows={3}
                />
              </div>
            </div>

            {/* Блоки */}
            <div className="edit-page-section">
              <h3>Блоки</h3>
              {pageData.blocks.map((block, blockIndex) => (
                <div key={blockIndex} className="edit-page-block">
                  <h4>Блок: {block.blockType}</h4>
                  {block.elements.map((element, elementIndex) => (
                    <div key={elementIndex} className="edit-page-element">
                      <div className="edit-page-element-type">
                        Тип: {element.type}
                      </div>
                      {element.type === "h2" && element.text && (
                        <div className="edit-page-field">
                          <label>Заголовок:</label>
                          <input
                            type="text"
                            value={element.text}
                            onChange={(e) =>
                              updateElement(
                                blockIndex,
                                elementIndex,
                                "text",
                                e.target.value
                              )
                            }
                          />
                        </div>
                      )}
                      {element.type === "paragraph" && element.text && (
                        <div className="edit-page-field">
                          <label>Параграф:</label>
                          <textarea
                            value={element.text}
                            onChange={(e) =>
                              updateElement(
                                blockIndex,
                                elementIndex,
                                "text",
                                e.target.value
                              )
                            }
                            rows={4}
                          />
                        </div>
                      )}
                      {(element.type === "list" || element.type === "list-large" || element.type === "glossaryList") && 
                       element.items && 
                       Array.isArray(element.items) && (
                        <div className="edit-page-field">
                          <label>
                            {element.type === "list" && "Список"}
                            {element.type === "list-large" && "Большой список"}
                            {element.type === "glossaryList" && "Глоссарий"}
                            {typeof element.items[0] === "object" && " (title: description)"}:
                          </label>
                          {typeof element.items[0] === "object" ? (
                            // Если элементы - объекты с title и description
                            <div className="edit-page-list-items">
                              {element.items.map((item: any, itemIndex: number) => (
                                <div key={itemIndex} className="edit-page-list-item">
                                  <div className="edit-page-list-item-header">
                                    Элемент {itemIndex + 1}
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Title"
                                    value={item.title || ""}
                                    onChange={(e) =>
                                      updateListItem(
                                        blockIndex,
                                        elementIndex,
                                        itemIndex,
                                        "title",
                                        e.target.value
                                      )
                                    }
                                    className="edit-page-list-item-title"
                                  />
                                  <textarea
                                    placeholder="Description"
                                    value={item.description || ""}
                                    onChange={(e) =>
                                      updateListItem(
                                        blockIndex,
                                        elementIndex,
                                        itemIndex,
                                        "description",
                                        e.target.value
                                      )
                                    }
                                    rows={2}
                                    className="edit-page-list-item-description"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            // Если элементы - строки
                            <textarea
                              value={element.items.join("\n")}
                              onChange={(e) =>
                                updateElement(
                                  blockIndex,
                                  elementIndex,
                                  "items",
                                  e.target.value
                                )
                              }
                              rows={element.type === "glossaryList" ? 10 : element.type === "list-large" ? 8 : 6}
                            />
                          )}
                        </div>
                      )}
                      {element.type === "image" && (
                        <div className="edit-page-field">
                          <label>Изображение:</label>
                          <input
                            type="text"
                            value={element.src || ""}
                            disabled
                            className="edit-page-disabled"
                          />
                          <small>Путь к изображению (не редактируется)</small>
                        </div>
                      )}
                      {element.type === "button" && element.text && (
                        <div className="edit-page-field">
                          <label>Текст кнопки:</label>
                          <input
                            type="text"
                            value={element.text}
                            onChange={(e) =>
                              updateElement(
                                blockIndex,
                                elementIndex,
                                "text",
                                e.target.value
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Секция FAQ для главной страницы */}
            {isHomepage && faqData && (
              <div className="edit-page-section">
                <h3>FAQ (Часто задаваемые вопросы)</h3>
                <div className="edit-page-field">
                  <label>Заголовок FAQ (H2):</label>
                  <input
                    type="text"
                    value={faqData.h2}
                    onChange={(e) => updateFAQField("h2", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="edit-page-field">
                  <label>Описание FAQ:</label>
                  <textarea
                    value={faqData.text}
                    onChange={(e) => updateFAQField("text", e.target.value)}
                    rows={3}
                    disabled={saving}
                  />
                </div>
                <div className="edit-page-field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <label>Вопросы и ответы:</label>
                    <button
                      type="button"
                      onClick={addFAQItem}
                      className="edit-page-add-btn"
                      disabled={saving}
                      style={{
                        padding: "5px 10px",
                        backgroundColor: "#28a745",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      + Добавить вопрос
                    </button>
                  </div>
                  {faqData.items.map((item, index) => (
                    <div
                      key={index}
                      className="edit-page-faq-item"
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: "4px",
                        padding: "15px",
                        marginBottom: "15px",
                        backgroundColor: "#f9f9f9",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <strong>Вопрос {index + 1}</strong>
                        <button
                          type="button"
                          onClick={() => removeFAQItem(index)}
                          disabled={saving}
                          style={{
                            padding: "3px 8px",
                            backgroundColor: "#dc3545",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "11px",
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                      <div className="edit-page-field" style={{ marginBottom: "10px" }}>
                        <label>Вопрос:</label>
                        <input
                          type="text"
                          value={item.question}
                          onChange={(e) => updateFAQItem(index, "question", e.target.value)}
                          disabled={saving}
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div className="edit-page-field">
                        <label>Ответ:</label>
                        <textarea
                          value={item.answer}
                          onChange={(e) => updateFAQItem(index, "answer", e.target.value)}
                          rows={3}
                          disabled={saving}
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="edit-page-modal-footer">
          <button
            className="edit-page-cancel-btn"
            onClick={onClose}
            disabled={saving}
          >
            Отмена
          </button>
          <button
            className="edit-page-save-btn"
            onClick={handleSave}
            disabled={saving || !pageData}
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPageModal;


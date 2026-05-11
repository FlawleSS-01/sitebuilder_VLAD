import { useState, useEffect } from "react";
import "./ImageModal.css";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: {
    name: string;
    url: string;
    path: string;
    prompt?: string | null;
    alt?: string;
    title?: string;
  };
  pageType: string;
  pageInfo: any;
  imageIndex: number;
  projectName: string;
  onRegenerate: (pageType: string, pageInfo: any, imageIndex: number) => void;
  onRegenerateWithPrompt: (
    pageType: string,
    pageInfo: any,
    imageIndex: number,
    prompt: string
  ) => void;
  onUpload: (
    e: React.ChangeEvent<HTMLInputElement>,
    pageType: string,
    pageInfo: any,
    imageIndex: number
  ) => void;
  onRegenerateAltTitle: (
    pageType: string,
    pageInfo: any,
    imageIndex: number
  ) => void;
  onSaveAltTitle: (
    pageType: string,
    pageInfo: any,
    imageIndex: number,
    alt: string,
    title: string
  ) => void;
  generating?: boolean;
}

const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  onClose,
  image,
  pageType,
  pageInfo,
  imageIndex,
  onRegenerate,
  onRegenerateWithPrompt,
  onUpload,
  onRegenerateAltTitle,
  onSaveAltTitle,
  generating = false,
}) => {
  const [alt, setAlt] = useState(image.alt || "");
  const [title, setTitle] = useState(image.title || "");
  const [imageSize, setImageSize] = useState<string>("");
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(image.prompt || "");
  const [savingAltTitle, setSavingAltTitle] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAlt(image.alt || "");
      setTitle(image.title || "");
      setCustomPrompt(image.prompt || "");
      // Загружаем размер изображения при изменении URL
      loadImageSize();
    }
  }, [isOpen, image.url, image.alt, image.title, image.prompt]);

  const loadImageSize = () => {
    // Очищаем размер при загрузке нового изображения
    setImageSize("");
    const img = new Image();
    img.onload = () => {
      setImageSize(`${img.width} × ${img.height} px`);
    };
    img.onerror = () => {
      setImageSize("Ошибка загрузки");
    };
    // Убираем timestamp из URL для загрузки размера
    const urlWithoutTimestamp = image.url.split('?')[0];
    img.src = urlWithoutTimestamp;
  };

  const handleSaveAltTitle = async () => {
    setSavingAltTitle(true);
    try {
      await onSaveAltTitle(pageType, pageInfo, imageIndex, alt, title);
    } finally {
      setSavingAltTitle(false);
    }
  };

  const handleRegenerateAltTitle = async () => {
    setSavingAltTitle(true);
    try {
      await onRegenerateAltTitle(pageType, pageInfo, imageIndex);
    } finally {
      setSavingAltTitle(false);
    }
  };

  const handleRegenerateWithCustomPrompt = () => {
    if (customPrompt.trim()) {
      onRegenerateWithPrompt(pageType, pageInfo, imageIndex, customPrompt.trim());
      setShowCustomPrompt(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="image-modal-overlay">
      <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="image-modal-close" onClick={onClose}>
          ×
        </button>

        <div className="image-modal-image-container">
          {generating && (
            <div className="image-modal-loader">
              <div className="image-modal-spinner"></div>
              <div className="image-modal-loader-text">Генерация изображения...</div>
            </div>
          )}
          <img 
            src={image.url} 
            alt={alt || image.name} 
            className={`image-modal-image ${generating ? 'image-loading' : ''}`}
            style={{ opacity: generating ? 0.5 : 1 }}
          />
        </div>

        <div className="image-modal-actions">
          <button
            className="image-modal-btn regenerate-btn"
            onClick={() => onRegenerate(pageType, pageInfo, imageIndex)}
            disabled={generating}
          >
            {generating ? "⏳ Генерация..." : "↻ Перегенерировать"}
          </button>
          <label className="image-modal-btn upload-btn">
            📁 Загрузить свою
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                onUpload(e, pageType, pageInfo, imageIndex);
              }}
            />
          </label>
          <button
            className="image-modal-btn custom-prompt-btn"
            onClick={() => setShowCustomPrompt(!showCustomPrompt)}
            disabled={generating}
          >
            ✏️ Со своим промтом
          </button>
        </div>

        {showCustomPrompt && (
          <div className="image-modal-custom-prompt">
            <textarea
              className="image-modal-prompt-input"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Введите промт для генерации изображения"
              rows={3}
            />
            <div className="image-modal-prompt-actions">
              <button
                className="image-modal-btn confirm-btn"
                onClick={handleRegenerateWithCustomPrompt}
                disabled={!customPrompt.trim() || generating}
              >
                Генерировать
              </button>
              <button
                className="image-modal-btn cancel-btn"
                onClick={() => setShowCustomPrompt(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        <div className="image-modal-info">
          <div className="image-modal-info-row">
            <span className="image-modal-info-label">Название:</span>
            <span className="image-modal-info-value">{image.name}</span>
          </div>
          <div className="image-modal-info-row">
            <span className="image-modal-info-label">Размер:</span>
            <span className="image-modal-info-value">{imageSize || "Загрузка..."}</span>
          </div>
          <div className="image-modal-info-row">
            <span className="image-modal-info-label">Формат:</span>
            <span className="image-modal-info-value">WebP</span>
          </div>
          <div className="image-modal-info-row">
            <span className="image-modal-info-label">ALT:</span>
            <textarea
              className="image-modal-textarea"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Введите ALT текст"
              rows={2}
            />
          </div>
          <div className="image-modal-info-row">
            <span className="image-modal-info-label">TITLE:</span>
            <textarea
              className="image-modal-textarea"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите TITLE текст"
              rows={2}
            />
          </div>
          <div className="image-modal-alt-title-actions">
            <button
              className="image-modal-btn save-alt-title-btn"
              onClick={handleSaveAltTitle}
              disabled={savingAltTitle}
            >
              {savingAltTitle ? "Сохранение..." : "💾 Сохранить ALT/TITLE"}
            </button>
            <button
              className="image-modal-btn regenerate-alt-title-btn"
              onClick={handleRegenerateAltTitle}
              disabled={savingAltTitle}
            >
              {savingAltTitle ? "Генерация..." : "🔄 Перегенерировать ALT/TITLE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageModal;


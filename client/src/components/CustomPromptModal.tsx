import { useState } from "react";
import "./CustomPromptModal.css";

interface CustomPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (prompt: string) => void;
  currentPrompt?: string;
}

const CustomPromptModal: React.FC<CustomPromptModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentPrompt,
}) => {
  const [prompt, setPrompt] = useState(currentPrompt || "");

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (prompt.trim()) {
      onConfirm(prompt.trim());
      setPrompt("");
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content custom-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Введите промт для генерации</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="prompt-input-group">
            <label>Промт:</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Введите описание изображения..."
              rows={5}
              className="prompt-textarea"
            />
            {currentPrompt && (
              <div className="current-prompt-hint">
                <strong>Текущий промт:</strong> {currentPrompt}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>
            Отмена
          </button>
          <button
            className="save-button"
            onClick={handleSubmit}
            disabled={!prompt.trim()}
          >
            Сгенерировать
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomPromptModal;


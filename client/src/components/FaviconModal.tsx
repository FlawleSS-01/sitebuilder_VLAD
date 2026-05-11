import { useState } from "react";
import "./FaviconModal.css";

interface FaviconModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  projectBrand: string;
  onSuccess: () => void;
}

type FaviconSource = "upload" | "logo" | "homepage";

const FaviconModal: React.FC<FaviconModalProps> = ({
  isOpen,
  onClose,
  projectName,
  projectBrand,
  onSuccess,
}) => {
  const [source, setSource] = useState<FaviconSource>("logo");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || "";

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadedFile(e.target.files[0]);
    }
  };

  const handleGenerate = async () => {
    if (source === "upload" && !uploadedFile) {
      setError("Выберите файл для загрузки");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("projectName", projectName);
      formData.append("source", source);
      formData.append("brand", projectBrand);

      if (source === "upload" && uploadedFile) {
        formData.append("file", uploadedFile);
      }

      const response = await fetch(`${API_URL}/api/build/generate-favicon`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка при генерации favicon");
      }

      alert("Favicon успешно сгенерирован!");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при генерации favicon");
      console.error("Error:", err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content favicon-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Генерация Favicon</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message" style={{ marginBottom: "15px" }}>
              <strong>Ошибка:</strong> {error}
            </div>
          )}

          <div className="favicon-source-selector">
            <label className="favicon-source-option">
              <input
                type="radio"
                name="faviconSource"
                value="logo"
                checked={source === "logo"}
                onChange={(e) => {
                  setSource(e.target.value as FaviconSource);
                  setUploadedFile(null);
                }}
                disabled={generating}
              />
              <span>Использовать logo.webp</span>
            </label>

            <label className="favicon-source-option">
              <input
                type="radio"
                name="faviconSource"
                value="homepage"
                checked={source === "homepage"}
                onChange={(e) => {
                  setSource(e.target.value as FaviconSource);
                  setUploadedFile(null);
                }}
                disabled={generating}
              />
              <span>Использовать homepage.webp</span>
            </label>

            <label className="favicon-source-option">
              <input
                type="radio"
                name="faviconSource"
                value="upload"
                checked={source === "upload"}
                onChange={(e) => {
                  setSource(e.target.value as FaviconSource);
                }}
                disabled={generating}
              />
              <span>Загрузить свой файл</span>
            </label>
          </div>

          {source === "upload" && (
            <div className="favicon-upload-section">
              <label className="file-upload-label">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={generating}
                  style={{ display: "none" }}
                />
                <span className="file-upload-button">
                  {uploadedFile ? uploadedFile.name : "Выбрать файл"}
                </span>
              </label>
            </div>
          )}
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
            disabled={generating || (source === "upload" && !uploadedFile)}
          >
            {generating ? "Генерация..." : "Сгенерировать"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FaviconModal;


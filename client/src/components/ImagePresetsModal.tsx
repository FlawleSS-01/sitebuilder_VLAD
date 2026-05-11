import { useState, useEffect } from "react";
import "./ImagePresetsModal.css";

const API_URL = import.meta.env.VITE_API_URL || "";

interface ImagePreset {
  id: string;
  name: string;
  sizes: {
    image1: string; // "1024x1024"
    image2: string; // "1280x704"
    image3: string; // "1280x704"
  };
}

interface ImagePresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  currentPresets?: ImagePreset[];
  onSave: (presets: ImagePreset[]) => void;
}

const AVAILABLE_SIZES = [
  "1024x1024",
  "1792x1024",
  "1024x1792",
  "1536x512",
  "1280x704",
  "512x512",
];

const DEFAULT_PRESET: ImagePreset = {
  id: "default",
  name: "По умолчанию",
  sizes: {
    image1: "1024x1024",
    image2: "1280x704",
    image3: "1280x704",
  },
};

const ImagePresetsModal: React.FC<ImagePresetsModalProps> = ({
  isOpen,
  onClose,
  projectName,
  currentPresets,
  onSave,
}) => {
  const [presets, setPresets] = useState<ImagePreset[]>([DEFAULT_PRESET]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Загружаем текущие пресеты или используем дефолтный
      if (currentPresets && currentPresets.length > 0) {
        setPresets(currentPresets);
      } else {
        setPresets([DEFAULT_PRESET]);
      }
    }
  }, [isOpen, currentPresets]);

  const handleSizeChange = (
    presetId: string,
    imageIndex: "image1" | "image2" | "image3",
    size: string
  ) => {
    setPresets((prev) =>
      prev.map((preset) =>
        preset.id === presetId
          ? {
              ...preset,
              sizes: {
                ...preset.sizes,
                [imageIndex]: size,
              },
            }
          : preset
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(
        `${API_URL}/api/build/save-image-presets`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectName,
            presets,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить пресеты");
      }

      onSave(presets);
      onClose();
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при сохранении пресетов");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content image-presets-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Настройки пресетов для картинок</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {presets.map((preset) => (
            <div key={preset.id} className="preset-card">
              <h3>{preset.name}</h3>
              <div className="preset-sizes">
                <div className="size-setting">
                  <label>Первая картинка:</label>
                  <select
                    value={preset.sizes.image1}
                    onChange={(e) =>
                      handleSizeChange(preset.id, "image1", e.target.value)
                    }
                  >
                    {AVAILABLE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} px
                      </option>
                    ))}
                  </select>
                </div>
                <div className="size-setting">
                  <label>Вторая картинка:</label>
                  <select
                    value={preset.sizes.image2}
                    onChange={(e) =>
                      handleSizeChange(preset.id, "image2", e.target.value)
                    }
                  >
                    {AVAILABLE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} px
                      </option>
                    ))}
                  </select>
                </div>
                <div className="size-setting">
                  <label>Третья картинка:</label>
                  <select
                    value={preset.sizes.image3}
                    onChange={(e) =>
                      handleSizeChange(preset.id, "image3", e.target.value)
                    }
                  >
                    {AVAILABLE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} px
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button className="save-button" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImagePresetsModal;


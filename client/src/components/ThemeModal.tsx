import { useState, useEffect } from "react";
import "./ThemeModal.css";
import {
  themeDisplayName,
  themeDisplayNameRu,
  themeTaglineRu,
} from "../constants/themeLabels";

const API_URL = import.meta.env.VITE_API_URL || "";

/**
 * Small palette preview rendered on each theme card so the user can see
 * at-a-glance what the theme looks like, without opening the preview.
 * Matches the --sb-bg / --sb-accent / --sb-accent-2 of each theme preset.
 */
const THEME_SWATCHES: Record<string, [string, string, string]> = {
  default: ["#0b0f24", "#ffd166", "#ef476f"],
  "blue-pink": ["#050b2e", "#ff3da5", "#5cd1ff"],
  "blue-violet": ["#07061f", "#a259ff", "#ff66c4"],
  "emerald-skyblue": ["#02180f", "#36e2c8", "#5cc8ff"],
  "green-yellow": ["#061a07", "#f9e655", "#82e668"],
  "grey-red": ["#121212", "#ff3b3f", "#ffb86b"],
  theme1: ["#1a0510", "#ffb347", "#ff5e62"],
  theme2: ["#14001a", "#ff4dd2", "#b14dff"],
  theme3: ["#02180f", "#ffd166", "#5be79b"],
  theme4: ["#050614", "#00f5d4", "#a3ff00"],
  theme5: ["#050d24", "#f5d76e", "#c0c8de"],
  theme6: ["#1a0606", "#ffae00", "#ff3b3f"],
};

const swatchFor = (themeId: string): [string, string, string] =>
  THEME_SWATCHES[themeId] ?? ["#1a1244", "#ffd166", "#ef476f"];

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
}

const AVAILABLE_THEMES = [
  "default",
  "blue-pink",
  "blue-violet",
  "emerald-skyblue",
  "green-yellow",
  "grey-red",
  "theme1",
  "theme2",
  "theme3",
  "theme4",
  "theme5",
  "theme6",
];

const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  projectName,
}) => {
  const [themeMode, setThemeMode] = useState<"preset" | "custom">("preset");
  const [selectedTheme, setSelectedTheme] = useState<string>("default");
  const [colors, setColors] = useState<string[]>(Array(7).fill(""));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetThemes, setPresetThemes] = useState<string[]>(AVAILABLE_THEMES);

  useEffect(() => {
    if (isOpen) {
      loadCurrentTheme();
      (async () => {
        try {
          const r = await fetch(`${API_URL}/api/build/themes`);
          const j = await r.json();
          if (r.ok && Array.isArray(j.themes) && j.themes.length > 0) {
            setPresetThemes(j.themes);
          } else {
            setPresetThemes(AVAILABLE_THEMES);
          }
        } catch {
          setPresetThemes(AVAILABLE_THEMES);
        }
      })();
    }
  }, [isOpen, projectName]);

  const loadCurrentTheme = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/theme`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.mode === "custom") {
          setThemeMode("custom");
          setColors(data.colors || Array(7).fill(""));
        } else {
          setThemeMode("preset");
          setSelectedTheme(data.theme || "default");
        }
      }
    } catch (err) {
      console.error("Error loading theme:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/theme`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: themeMode,
            theme: themeMode === "preset" ? selectedTheme : null,
            colors: themeMode === "custom" ? colors : null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        const msg = [errorData.error, errorData.message]
          .filter(Boolean)
          .join(": ");
        throw new Error(msg || "Failed to save theme");
      }

      onClose();
    } catch (err: any) {
      setError(err.message || "Ошибка при сохранении темы");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="theme-modal-overlay">
      <div className="theme-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="theme-modal-header">
          <h2>Настройка темы</h2>
          <button className="theme-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <div className="theme-modal-loading">Загрузка...</div>
        ) : (
          <>
            <div className="theme-modal-mode-selector">
              <label>
                <input
                  type="radio"
                  value="preset"
                  checked={themeMode === "preset"}
                  onChange={(e) => setThemeMode(e.target.value as "preset")}
                />
                Выбрать из списка
              </label>
              <label>
                <input
                  type="radio"
                  value="custom"
                  checked={themeMode === "custom"}
                  onChange={(e) => setThemeMode(e.target.value as "custom")}
                />
                Кастомные стили
              </label>
            </div>

            {themeMode === "preset" ? (
              <div className="theme-modal-presets">
                <h3>Выберите тему:</h3>
                <div className="theme-presets-grid">
                  {presetThemes.map((theme) => {
                    const [bg, accent, accent2] = swatchFor(theme);
                    const tagline = themeTaglineRu(theme);
                    return (
                      <div
                        key={theme}
                        className={`theme-preset-item ${
                          selectedTheme === theme ? "selected" : ""
                        }`}
                        onClick={() => setSelectedTheme(theme)}
                        title={`${themeDisplayNameRu(theme)} / ${themeDisplayName(theme)} · id: ${theme}`}
                        style={
                          {
                            "--theme-preview-bg": bg,
                            "--theme-preview-accent": accent,
                            "--theme-preview-accent-2": accent2,
                          } as React.CSSProperties
                        }
                      >
                        <span className="theme-preset-preview" aria-hidden>
                          <span className="theme-preset-swatch theme-preset-swatch--bg" />
                          <span className="theme-preset-swatch theme-preset-swatch--accent" />
                          <span className="theme-preset-swatch theme-preset-swatch--accent-2" />
                        </span>
                        <span className="theme-preset-label">
                          {themeDisplayNameRu(theme)}
                        </span>
                        <span className="theme-preset-sub-en">
                          {themeDisplayName(theme)}
                        </span>
                        {tagline && (
                          <span className="theme-preset-tagline">{tagline}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="theme-modal-custom">
                <h3>Кастомные цвета:</h3>
                <div className="theme-color-inputs">
                  <div className="theme-color-group">
                    <label>Цвет 1 (--main-color):</label>
                    <input
                      type="color"
                      value={colors[0] || "#000000"}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[0] = e.target.value;
                        setColors(newColors);
                      }}
                    />
                    <input
                      type="text"
                      value={colors[0] || ""}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[0] = e.target.value;
                        setColors(newColors);
                      }}
                      placeholder="#000000"
                    />
                  </div>

                  <div className="theme-color-group">
                    <label>Цвет 2 (--main-section-background):</label>
                    <input
                      type="color"
                      value={colors[1] || "#000000"}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[1] = e.target.value;
                        setColors(newColors);
                      }}
                    />
                    <input
                      type="text"
                      value={colors[1] || ""}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[1] = e.target.value;
                        setColors(newColors);
                      }}
                      placeholder="#000000"
                    />
                  </div>

                  <div className="theme-color-group">
                    <label>Цвет 3 (--bg-color):</label>
                    <input
                      type="color"
                      value={colors[2] || "#000000"}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[2] = e.target.value;
                        setColors(newColors);
                      }}
                    />
                    <input
                      type="text"
                      value={colors[2] || ""}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[2] = e.target.value;
                        setColors(newColors);
                      }}
                      placeholder="#000000"
                    />
                  </div>

                  <div className="theme-color-group">
                    <label>Цвет 4 (--text-color, --footer-text, --title-color, --faq-color):</label>
                    <input
                      type="color"
                      value={colors[3] || "#000000"}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[3] = e.target.value;
                        setColors(newColors);
                      }}
                    />
                    <input
                      type="text"
                      value={colors[3] || ""}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[3] = e.target.value;
                        setColors(newColors);
                      }}
                      placeholder="#000000"
                    />
                  </div>

                  <div className="theme-color-group">
                    <label>Цвет 5 (--hero-color):</label>
                    <input
                      type="color"
                      value={colors[4] || "#000000"}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[4] = e.target.value;
                        setColors(newColors);
                      }}
                    />
                    <input
                      type="text"
                      value={colors[4] || ""}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[4] = e.target.value;
                        setColors(newColors);
                      }}
                      placeholder="#000000"
                    />
                  </div>

                  <div className="theme-color-group">
                    <label>
                      Цвет 6 (--title-color-hover, --card-background,
                      --glossary-background, --glossary-border-color,
                      --icon-background, --icon-background-hover,
                      --mainBtn-background, --mainBtnSpecial-background,
                      --mainBtnSpecial-border, --pulse-color-first,
                      --pulse-color-second, --faq-color-active, --pulse-box-shadow):
                    </label>
                    <input
                      type="color"
                      value={colors[5] || "#000000"}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[5] = e.target.value;
                        setColors(newColors);
                      }}
                    />
                    <input
                      type="text"
                      value={colors[5] || ""}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[5] = e.target.value;
                        setColors(newColors);
                      }}
                      placeholder="#000000"
                    />
                    <small>
                      Для --pulse-box-shadow будет использован RGB формат этого цвета
                      (например: 218, 161, 18)
                    </small>
                  </div>

                  <div className="theme-color-group">
                    <label>
                      Цвет 7 (--card-color, --mainBtn-color):
                    </label>
                    <input
                      type="color"
                      value={colors[6] || "#000000"}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[6] = e.target.value;
                        setColors(newColors);
                      }}
                    />
                    <input
                      type="text"
                      value={colors[6] || ""}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[6] = e.target.value;
                        setColors(newColors);
                      }}
                      placeholder="#000000"
                    />
                  </div>
                </div>
              </div>
            )}

            {error && <div className="theme-modal-error">{error}</div>}

            <div className="theme-modal-actions">
              <button
                className="theme-modal-cancel"
                onClick={onClose}
                disabled={saving}
              >
                Отмена
              </button>
              <button
                className="theme-modal-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ThemeModal;


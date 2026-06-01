import { useState, useEffect } from "react";
import "./ThemeModal.css";
import {
  buildFallbackThemeCatalog,
  getThemeMeta,
  type ThemeCatalogCard,
} from "../constants/themeLabels";

const API_URL = import.meta.env.VITE_API_URL || "";

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
}

function normalizeThemesFromApi(raw: unknown): ThemeCatalogCard[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  if (typeof raw[0] === "string") {
    const order = new Map(
      buildFallbackThemeCatalog().map((t, i) => [t.id, i])
    );
    return (raw as string[])
      .map((id) => ({ id, ...getThemeMeta(id) }))
      .sort((a, b) => {
        const ai = order.get(a.id) ?? 999;
        const bi = order.get(b.id) ?? 999;
        if (ai !== bi) return ai - bi;
        return a.nameRu.localeCompare(b.nameRu, "ru");
      });
  }

  const cards: ThemeCatalogCard[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const sw = row.swatches;
    const swatches: [string, string, string] =
      Array.isArray(sw) &&
      sw.length >= 3 &&
      typeof sw[0] === "string" &&
      typeof sw[1] === "string" &&
      typeof sw[2] === "string"
        ? [sw[0], sw[1], sw[2]]
        : getThemeMeta(id).swatches;
    cards.push({
      id,
      name:
        typeof row.name === "string" ? row.name : getThemeMeta(id).name,
      nameRu:
        typeof row.nameRu === "string"
          ? row.nameRu
          : getThemeMeta(id).nameRu,
      taglineRu:
        typeof row.taglineRu === "string"
          ? row.taglineRu
          : getThemeMeta(id).taglineRu,
      swatches,
    });
  }
  return cards.length > 0 ? cards : null;
}

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
  const [presetThemes, setPresetThemes] = useState<ThemeCatalogCard[]>(
    buildFallbackThemeCatalog
  );

  useEffect(() => {
    if (isOpen) {
      loadCurrentTheme();
      (async () => {
        try {
          const r = await fetch(`${API_URL}/api/build/themes`);
          const j = await r.json();
          const normalized = normalizeThemesFromApi(j.themes);
          if (r.ok && normalized) {
            setPresetThemes(normalized);
          } else {
            setPresetThemes(buildFallbackThemeCatalog());
          }
        } catch {
          setPresetThemes(buildFallbackThemeCatalog());
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
                    const [bg, accent, accent2] = theme.swatches;
                    const tagline = theme.taglineRu;
                    return (
                      <div
                        key={theme.id}
                        className={`theme-preset-item ${
                          selectedTheme === theme.id ? "selected" : ""
                        }`}
                        onClick={() => setSelectedTheme(theme.id)}
                        title={`${theme.nameRu} / ${theme.name} · id: ${theme.id}`}
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
                          {theme.nameRu}
                        </span>
                        <span className="theme-preset-sub-en">
                          {theme.name}
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

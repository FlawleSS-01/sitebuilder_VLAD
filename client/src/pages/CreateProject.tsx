import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";
import {
  FALLBACK_GEO_PRESETS,
  FALLBACK_LANG_OPTIONS,
} from "../constants/createProjectFallback";

interface FormData {
  brand: string;
  country: string;
  domain: string;
  affiliateLink: string;
  templateName: string;
}

interface GeoPresetRow {
  geoCode: string;
  geoLabel: string;
  recommendedPrimary: string;
  recommendedSecondary: string[];
  locales: string[];
  defaultLocale: string;
  defaultMultiLanguage: boolean;
  languageCount: number;
  templateCampaignId?: string | null;
}

interface LangOpt {
  label: string;
  locale: string;
}

const API_URL = import.meta.env.VITE_API_URL || "";
const MAX_APK_SIZE_BYTES = 20 * 1024 * 1024;
const CUSTOM_GEO = "__CUSTOM__";
/** Если GET /api/build/templates недоступен или пустой — всё равно можно создать проект */
const FALLBACK_TEMPLATES = ["default-template"];

function normLoc(locale: string): string {
  return (locale || "en").toLowerCase().replace(/_/g, "-");
}

function labelForLocale(opts: LangOpt[], locale: string): string {
  const L = normLoc(locale);
  return opts.find((o) => normLoc(o.locale) === L)?.label || locale;
}

function arraysEqualAsSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...new Set(a.map(normLoc))].sort();
  const sb = [...new Set(b.map(normLoc))].sort();
  return sa.every((v, i) => v === sb[i]);
}

const CreateProject: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
    brand: "",
    country: "",
    domain: "",
    affiliateLink: "",
    templateName: "default-template",
  });
  const [noCountry, setNoCountry] = useState(false);
  /** Пустая строка только до первой успешной загрузки списка GEO */
  const [geoSelect, setGeoSelect] = useState<string>("");
  const [geoPresets, setGeoPresets] = useState<GeoPresetRow[]>([]);
  const [langOptions, setLangOptions] = useState<LangOpt[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  const [multiLanguage, setMultiLanguage] = useState(false);
  const [primaryLocale, setPrimaryLocale] = useState("en");
  const [secondaryLocales, setSecondaryLocales] = useState<string[]>([]);
  const [defaultLocale, setDefaultLocale] = useState("en");
  const [presetSnapshot, setPresetSnapshot] = useState<{
    multiLanguage: boolean;
    primaryLocale: string;
    secondaryLocales: string[];
    defaultLocale: string;
    locales: string[];
  } | null>(null);

  const [alwaysOpenPreview, setAlwaysOpenPreview] = useState(false);
  const [askBeforeBuild, setAskBeforeBuild] = useState(true);
  const [languageDirty, setLanguageDirty] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<string[]>(FALLBACK_TEMPLATES);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatesFromApi, setTemplatesFromApi] = useState(false);
  const [apkFile, setApkFile] = useState<File | null>(null);

  const selectedGeo = useMemo(
    () =>
      geoSelect && geoSelect !== CUSTOM_GEO
        ? geoPresets.find((g) => g.geoCode === geoSelect)
        : undefined,
    [geoPresets, geoSelect]
  );

  const applyFromGeoRow = useCallback((g: GeoPresetRow) => {
    const normLocs = g.locales.map(normLoc);
    const primary = normLocs[0] || "en";
    const secondary = g.defaultMultiLanguage ? normLocs.slice(1) : [];
    const def = normLoc(g.defaultLocale);
    setMultiLanguage(g.defaultMultiLanguage);
    setPrimaryLocale(primary);
    setSecondaryLocales(secondary);
    setDefaultLocale(def);
    setPresetSnapshot({
      multiLanguage: g.defaultMultiLanguage,
      primaryLocale: primary,
      secondaryLocales: secondary,
      defaultLocale: def,
      locales: [...normLocs],
    });
    setLanguageDirty(false);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoadingPresets(true);
      setPresetsError(null);
      try {
        const r = await fetch(`${API_URL}/api/build/geo-presets`);
        const j = await r.json();
        if (!r.ok) {
          throw new Error(j.message || j.error || `HTTP ${r.status}`);
        }
        if (j.success && Array.isArray(j.data) && j.data.length > 0) {
          setGeoPresets(j.data as GeoPresetRow[]);
          if (Array.isArray(j.languageOptions) && j.languageOptions.length > 0) {
            setLangOptions(j.languageOptions);
          } else {
            setLangOptions(FALLBACK_LANG_OPTIONS);
          }
        } else {
          throw new Error("Сервер вернул пустой список GEO");
        }
      } catch (e: unknown) {
        console.error(e);
        const msg =
          e instanceof Error ? e.message : "Ошибка загрузки пресетов GEO";
        setPresetsError(
          `${msg}. Используется локальный список GEO — проверьте, что API (${API_URL || "прокси /api"}) доступен.`
        );
        setGeoPresets(FALLBACK_GEO_PRESETS as GeoPresetRow[]);
        setLangOptions(FALLBACK_LANG_OPTIONS);
      } finally {
        setLoadingPresets(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      setTemplatesError(null);
      setTemplatesFromApi(false);
      const controller = new AbortController();
      const timeoutMs = 15000;
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${API_URL}/api/build/templates`, {
          signal: controller.signal,
        });
        let data: {
          success?: boolean;
          data?: unknown;
          error?: string;
          message?: string;
        } | null = null;
        try {
          data = await response.json();
        } catch {
          throw new Error("Ответ сервера не является JSON");
        }

        if (!response.ok) {
          throw new Error(
            (data && (data.message || data.error)) ||
              `HTTP ${response.status} при загрузке шаблонов`
          );
        }

        if (
          data?.success &&
          Array.isArray(data.data) &&
          data.data.length > 0
        ) {
          const list = data.data as string[];
          setTemplates(list);
          setTemplatesFromApi(true);
          const preferred = list.includes("default-template")
            ? "default-template"
            : list[0];
          setFormData((prev) => ({
            ...prev,
            templateName: preferred,
          }));
          return;
        }

        setTemplates(FALLBACK_TEMPLATES);
        setTemplatesError(
          "Сервер вернул пустой список шаблонов. Используется default-template."
        );
        setFormData((prev) => ({
          ...prev,
          templateName: FALLBACK_TEMPLATES.includes(prev.templateName)
            ? prev.templateName
            : "default-template",
        }));
      } catch (err: unknown) {
        const aborted =
          err instanceof Error && err.name === "AbortError";
        const base = aborted
          ? `Таймаут ${timeoutMs / 1000} с — сервер не ответил`
          : err instanceof Error
            ? err.message
            : "Сетевая ошибка";
        const hint =
          API_URL.trim() === ""
            ? "Запустите API (корень: npm run server, порт 3001) и клиент через Vite (npm run dev в client — прокси /api). Либо задайте VITE_API_URL на рабочий http://localhost:3001"
            : `Проверьте VITE_API_URL=${API_URL} и доступность сервера (CORS, порт)`;
        setTemplatesError(
          `${base}. ${hint}. Можно выбрать default-template ниже — это нормально.`
        );
        setTemplates(FALLBACK_TEMPLATES);
        setFormData((prev) => ({
          ...prev,
          templateName: "default-template",
        }));
        console.error("Ошибка загрузки шаблонов:", err);
      } finally {
        window.clearTimeout(timeoutId);
        setLoadingTemplates(false);
      }
    };
    loadTemplates();
  }, []);

  useEffect(() => {
    if (loadingPresets || geoPresets.length === 0) return;
    setGeoSelect((prev) => {
      if (prev === "") return "MULTI";
      if (geoPresets.some((g) => g.geoCode === prev) || prev === CUSTOM_GEO) {
        return prev;
      }
      return "MULTI";
    });
  }, [loadingPresets, geoPresets]);

  useEffect(() => {
    if (loadingPresets || geoPresets.length === 0) return;
    if (noCountry) {
      const multi = geoPresets.find((x) => x.geoCode === "MULTI");
      if (multi) applyFromGeoRow(multi);
      return;
    }
    if (geoSelect === "" || geoSelect === CUSTOM_GEO) {
      if (geoSelect === CUSTOM_GEO) {
        setPresetSnapshot(null);
      }
      return;
    }
    const g = geoPresets.find((x) => x.geoCode === geoSelect);
    if (g) applyFromGeoRow(g);
  }, [
    geoSelect,
    noCountry,
    loadingPresets,
    geoPresets,
    applyFromGeoRow,
  ]);

  const activeLocales = useMemo(() => {
    if (!multiLanguage) {
      return [normLoc(primaryLocale)];
    }
    const set = new Set<string>();
    set.add(normLoc(primaryLocale));
    secondaryLocales.forEach((s) => set.add(normLoc(s)));
    return [...set];
  }, [multiLanguage, primaryLocale, secondaryLocales]);

  const primaryLabel = labelForLocale(langOptions, primaryLocale);
  const secondaryLabels = secondaryLocales.map((loc) =>
    labelForLocale(langOptions, loc)
  );

  const languageCount = activeLocales.length;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleNoCountryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setNoCountry(checked);
    if (checked) {
      setFormData((prev) => ({
        ...prev,
        country: "NO COUNTRY",
      }));
      setGeoSelect("MULTI");
    } else {
      setFormData((prev) => ({
        ...prev,
        country: "",
      }));
      setGeoSelect((prev) => (prev === "" ? "MULTI" : prev));
    }
  };

  const handleGeoSelectChange = (value: string) => {
    setGeoSelect(value);
    if (value === CUSTOM_GEO) {
      setLanguageDirty(true);
      setPresetSnapshot(null);
      setMultiLanguage(false);
      setPrimaryLocale("en");
      setSecondaryLocales([]);
      setDefaultLocale("en");
    }
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      templateName: e.target.value,
    }));
  };

  const handleApkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApkFile(e.target.files?.[0] || null);
  };

  const toggleSecondary = (loc: string) => {
    setLanguageDirty(true);
    const L = normLoc(loc);
    const p = normLoc(primaryLocale);
    if (L === p) return;
    setSecondaryLocales((prev) =>
      prev.some((x) => normLoc(x) === L)
        ? prev.filter((x) => normLoc(x) !== L)
        : [...prev, normLoc(loc)]
    );
  };

  const matchesPreset =
    presetSnapshot != null &&
    presetSnapshot.multiLanguage === multiLanguage &&
    normLoc(presetSnapshot.primaryLocale) === normLoc(primaryLocale) &&
    arraysEqualAsSet(presetSnapshot.secondaryLocales, secondaryLocales) &&
    normLoc(presetSnapshot.defaultLocale) === normLoc(defaultLocale) &&
    arraysEqualAsSet(presetSnapshot.locales, activeLocales);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.brand || !formData.domain || !formData.affiliateLink) {
      setError("Пожалуйста, заполните все обязательные поля");
      return;
    }

    if (loadingPresets) {
      setError("Дождитесь загрузки списка GEO и языков");
      return;
    }

    if (!langOptions.length) {
      setError("Список языков пуст. Обновите страницу или проверьте сервер.");
      return;
    }

    const primaryNorm = normLoc(primaryLocale);
    const primaryValid = langOptions.some(
      (o) => normLoc(o.locale) === primaryNorm
    );
    if (!primaryNorm || !primaryValid) {
      setError("Выберите основной язык из списка");
      return;
    }

    if (!noCountry && (!geoSelect || geoSelect === "")) {
      setError("Выберите GEO");
      return;
    }

    if (!noCountry && geoSelect === CUSTOM_GEO && !formData.country.trim()) {
      setError("Укажите метку / название региона для режима «Другой / вручную»");
      return;
    }

    if (
      formData.domain.includes("http://") ||
      formData.domain.includes("https://")
    ) {
      setError("Домен должен быть без https:// (например: example.com)");
      return;
    }

    if (!formData.affiliateLink.startsWith("https://")) {
      setError("Ссылка на партнерку должна начинаться с https://");
      return;
    }

    if (apkFile) {
      if (!apkFile.name.toLowerCase().endsWith(".apk")) {
        setError("Можно загрузить только .apk файл");
        return;
      }
      if (apkFile.size > MAX_APK_SIZE_BYTES) {
        setError("Размер APK не должен превышать 20MB");
        return;
      }
    }

    if (!activeLocales.some((l) => normLoc(l) === normLoc(defaultLocale))) {
      setError("Язык по умолчанию должен входить в список локалей проекта");
      return;
    }

    setLoading(true);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const sanitizedBrand = formData.brand
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const projectName = `${sanitizedBrand}-${timestamp}`;

      const geoCode =
        noCountry ? "MULTI" : geoSelect === CUSTOM_GEO ? undefined : geoSelect;

      const geoLabel = noCountry
        ? "Multi-GEO"
        : geoSelect === CUSTOM_GEO
          ? formData.country.trim()
          : selectedGeo?.geoLabel || formData.country.trim() || "—";

      const country = noCountry
        ? "NO COUNTRY"
        : geoSelect === CUSTOM_GEO
          ? formData.country.trim()
          : selectedGeo?.geoLabel || formData.country.trim();

      const languagePresetSource: "geo" | "user" | "manual" =
        geoSelect === CUSTOM_GEO
          ? "manual"
          : languageDirty || !matchesPreset
            ? "user"
            : "geo";

      const metadata = {
        brand: formData.brand,
        language: primaryLabel,
        country,
        domain: formData.domain,
        affiliateLink: formData.affiliateLink,
        geoCode,
        geoLabel,
        primaryLanguage: primaryLabel,
        secondaryLanguages: secondaryLabels,
        locales: activeLocales.map(normLoc),
        defaultLocale: normLoc(defaultLocale),
        languageCount: activeLocales.length,
        languagePresetSource,
        alwaysOpenPreviewAfterGeneration: alwaysOpenPreview,
        askBeforeBuild,
      };

      const formPayload = new FormData();
      formPayload.append("projectName", projectName);
      formPayload.append("templateName", formData.templateName);
      formPayload.append("metadata", JSON.stringify(metadata));
      if (apkFile) {
        formPayload.append("apk", apkFile);
      }

      const createResponse = await fetch(`${API_URL}/api/build/create-project`, {
        method: "POST",
        body: formPayload,
      });

      const createData = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(createData.error || "Не удалось создать проект");
      }

      navigate(`/project/${projectName}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Произошла ошибка при создании проекта";
      setError(message);
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const availableSecondaries = langOptions.filter(
    (o) => normLoc(o.locale) !== normLoc(primaryLocale)
  );

  const geoOptionLabel = (g: GeoPresetRow) => {
    const camp =
      g.templateCampaignId != null && String(g.templateCampaignId).trim() !== ""
        ? ` · campaign ${g.templateCampaignId}`
        : "";
    return `${g.geoCode} — ${g.geoLabel}${camp}`;
  };

  const showLanguageBlock = !loadingPresets && geoPresets.length > 0;

  return (
    <div className="App">
      <div className="container">
        <h1>Создание нового проекта</h1>

        <form onSubmit={handleCreateProject} className="form">
          <div className="form-group">
            <label htmlFor="brand">Название бренда *</label>
            <input
              type="text"
              id="brand"
              name="brand"
              value={formData.brand}
              onChange={handleInputChange}
              placeholder="Введите название бренда"
              required
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={noCountry}
                onChange={handleNoCountryChange}
                style={{ marginRight: "8px" }}
              />
              NO COUNTRY (как MULTI / Multi-GEO)
            </label>
          </div>

          {!noCountry && (
            <div className="form-group">
              <label htmlFor="geoSelect">GEO (регион кампании) *</label>
              <select
                id="geoSelect"
                value={loadingPresets ? "" : geoSelect}
                onChange={(e) => handleGeoSelectChange(e.target.value)}
                disabled={loadingPresets}
                required
              >
                {loadingPresets ? (
                  <option value="">Загрузка списка GEO…</option>
                ) : (
                  <>
                    {geoPresets.map((g) => (
                      <option key={g.geoCode} value={g.geoCode}>
                        {geoOptionLabel(g)}
                      </option>
                    ))}
                    <option value={CUSTOM_GEO}>Другой / вручную</option>
                  </>
                )}
              </select>
              {presetsError && (
                <small style={{ color: "#b45309", display: "block", marginTop: 6 }}>
                  {presetsError}
                </small>
              )}
            </div>
          )}

          {!noCountry && geoSelect === CUSTOM_GEO && (
            <div className="form-group">
              <label htmlFor="country">Метка GEO / страна (вручную) *</label>
              <input
                type="text"
                id="country"
                name="country"
                value={formData.country}
                onChange={handleInputChange}
                placeholder="Например: Custom Region"
                required
              />
              <small>
                Настройка языков ниже сохраняется как{" "}
                <strong>languagePresetSource: manual</strong>
              </small>
            </div>
          )}

          <div
            className="language-setup-block form-group"
            style={{
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "16px",
              background: "#fafafa",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Языки сайта</h3>
            {!showLanguageBlock ? (
              <p style={{ margin: 0 }}>Загрузка пресетов GEO…</p>
            ) : (
              <>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#333",
                    marginBottom: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  <div>
                    <strong>GEO:</strong>{" "}
                    {noCountry
                      ? "MULTI — Multi-GEO"
                      : geoSelect === CUSTOM_GEO
                        ? `CUSTOM — ${formData.country.trim() || "…"}`
                        : selectedGeo
                          ? geoOptionLabel(selectedGeo)
                          : "—"}
                  </div>
                  {!((!noCountry && geoSelect === CUSTOM_GEO) || noCountry) &&
                  selectedGeo ? (
                    <>
                      <div>
                        <strong>Рекомендуемый основной:</strong>{" "}
                        {selectedGeo.recommendedPrimary}
                      </div>
                      <div>
                        <strong>Рекомендуемые доп.:</strong>{" "}
                        {selectedGeo.recommendedSecondary.length > 0
                          ? selectedGeo.recommendedSecondary.join(", ")
                          : "—"}
                      </div>
                      <div>
                        <strong>Локали (пресет):</strong>{" "}
                        {selectedGeo.locales.join(", ")}
                      </div>
                      <div>
                        <strong>Default locale (пресет):</strong>{" "}
                        {selectedGeo.defaultLocale}
                      </div>
                    </>
                  ) : geoSelect === CUSTOM_GEO && !noCountry ? (
                    <div style={{ color: "#555" }}>
                      Ручной режим: выберите языки ниже. Локали формируются из
                      основного и дополнительных.
                    </div>
                  ) : null}
                  <div>
                    <strong>Текущие локали:</strong>{" "}
                    {activeLocales.length > 0
                      ? activeLocales.join(", ")
                      : "—"}
                  </div>
                  <div>
                    <strong>Число языков:</strong> {languageCount}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: "12px" }}>
                  <label style={{ marginRight: "16px" }}>
                    <input
                      type="radio"
                      checked={!multiLanguage}
                      onChange={() => {
                        setLanguageDirty(true);
                        setMultiLanguage(false);
                        setSecondaryLocales([]);
                        setDefaultLocale(normLoc(primaryLocale));
                      }}
                    />{" "}
                    Один язык
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={multiLanguage}
                      onChange={() => {
                        setLanguageDirty(true);
                        setMultiLanguage(true);
                      }}
                    />{" "}
                    Несколько языков
                  </label>
                </div>

                <div className="form-group">
                  <label htmlFor="primaryLocale">Основной язык *</label>
                  <select
                    id="primaryLocale"
                    value={normLoc(primaryLocale)}
                    onChange={(e) => {
                      setLanguageDirty(true);
                      const loc = normLoc(e.target.value);
                      if (!multiLanguage) {
                        setPrimaryLocale(loc);
                        setDefaultLocale(loc);
                        setSecondaryLocales([]);
                        return;
                      }
                      const nextSec = secondaryLocales.filter(
                        (x) => normLoc(x) !== loc
                      );
                      setPrimaryLocale(loc);
                      setSecondaryLocales(nextSec);
                      const uniq = [...new Set([loc, ...nextSec.map(normLoc)])];
                      if (!uniq.includes(normLoc(defaultLocale))) {
                        setDefaultLocale(loc);
                      }
                    }}
                    disabled={langOptions.length === 0}
                  >
                    {langOptions.length === 0 ? (
                      <option value="">Нет опций языка</option>
                    ) : (
                      langOptions.map((o) => (
                        <option key={normLoc(o.locale)} value={normLoc(o.locale)}>
                          {o.label} ({normLoc(o.locale)})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {multiLanguage && (
                  <>
                    <div className="form-group">
                      <span style={{ display: "block", marginBottom: "8px" }}>
                        Дополнительные языки
                      </span>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        {availableSecondaries.map((o) => (
                          <label
                            key={normLoc(o.locale)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={secondaryLocales.some(
                                (s) => normLoc(s) === normLoc(o.locale)
                              )}
                              onChange={() => toggleSecondary(o.locale)}
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="defaultLocale">Язык по умолчанию *</label>
                      <select
                        id="defaultLocale"
                        value={normLoc(defaultLocale)}
                        onChange={(e) => {
                          setLanguageDirty(true);
                          setDefaultLocale(normLoc(e.target.value));
                        }}
                      >
                        {activeLocales.map((loc) => (
                          <option key={loc} value={loc}>
                            {labelForLocale(langOptions, loc)} ({loc})
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {!multiLanguage && (
                  <div className="form-group" style={{ fontSize: "13px" }}>
                    <strong>Язык по умолчанию:</strong>{" "}
                    {labelForLocale(langOptions, primaryLocale)} ({normLoc(primaryLocale)})
                  </div>
                )}
              </>
            )}
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={alwaysOpenPreview}
                onChange={(e) => setAlwaysOpenPreview(e.target.checked)}
              />{" "}
              Всегда открывать preview после генерации страниц
            </label>
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={askBeforeBuild}
                onChange={(e) => setAskBeforeBuild(e.target.checked)}
              />{" "}
              Спрашивать подтверждение перед скачиванием build / archive
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="templateName">Шаблон проекта *</label>
            <select
              id="templateName"
              name="templateName"
              value={
                templates.includes(formData.templateName)
                  ? formData.templateName
                  : templates[0] || "default-template"
              }
              onChange={handleTemplateChange}
              disabled={loading}
              required
              title={
                loadingTemplates
                  ? "Идёт запрос списка с сервера; выбор default-template уже доступен"
                  : undefined
              }
            >
              {templates.map((template) => (
                <option key={template} value={template}>
                  {template}
                  {!templatesFromApi && template === "default-template"
                    ? " (фолбэк)"
                    : ""}
                </option>
              ))}
            </select>
            {loadingTemplates && (
              <small
                style={{ display: "block", marginTop: 6, color: "#555" }}
              >
                Обновление списка с API… Можно уже выбрать шаблон из списка
                (есть минимум default-template).
              </small>
            )}
            <small>
              Каталоги в <code>modules/source</code> (см.{" "}
              <code>modules/source/TEMPLATES.txt</code>). В запрос уходит id каталога.
              {API_URL.trim() === "" ? (
                <>
                  {" "}
                  При <code>npm run dev</code> в client запросы к{" "}
                  <code>/api</code> проксируются на{" "}
                  <code>http://localhost:3001</code>.
                </>
              ) : (
                <>
                  {" "}
                  <code>VITE_API_URL</code> задан абсолютным URL — сервер должен
                  отвечать на этом адресе (CORS включён в API).
                </>
              )}
            </small>
            {templatesError && (
              <small
                style={{
                  color: "#b45309",
                  display: "block",
                  marginTop: 8,
                }}
              >
                {templatesError}
              </small>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="domain">Домен *</label>
            <input
              type="text"
              id="domain"
              name="domain"
              value={formData.domain}
              onChange={handleInputChange}
              placeholder="example.com (без https://)"
              required
            />
            <small>Введите домен без https://</small>
          </div>

          <div className="form-group">
            <label htmlFor="affiliateLink">Ссылка на партнерку *</label>
            <input
              type="text"
              id="affiliateLink"
              name="affiliateLink"
              value={formData.affiliateLink}
              onChange={handleInputChange}
              placeholder="https://example.com/affiliate"
              required
            />
            <small>Ссылка должна начинаться с https://</small>
          </div>

          <div className="form-group">
            <label htmlFor="apkFile">APK файл (до 20MB)</label>
            <input
              type="file"
              id="apkFile"
              name="apkFile"
              accept=".apk"
              onChange={handleApkChange}
              disabled={loading}
            />
            <small>Если файл не выбран, будет использован /go</small>
          </div>

          <button
            type="submit"
            className="submit-button"
            disabled={
              loading ||
              loadingPresets ||
              !langOptions.length ||
              !showLanguageBlock
            }
          >
            {loading ? "Создание проекта..." : "Создать проект"}
          </button>
        </form>

        {error && (
          <div className="error-message">
            <strong>Ошибка:</strong> {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateProject;

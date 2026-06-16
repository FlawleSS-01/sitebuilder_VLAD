/** Форма SEO Entity Layer (schema.org) — см. hack.txt */

export interface SeoEntityData {
  brandAliases?: string[];
  officialProfiles?: string[];
  reviewSources?: string[];
  supportEmail?: string;
  phone?: string;
  foundingDate?: string;
  knowsAbout?: string[];
  homeAbout?: string[];
  homeKeywords?: string[];
  organizationDescription?: string;
  brandSeparated?: string;
}

export interface SeoEntityFormState {
  brandAliases: string;
  officialProfiles: string;
  reviewSources: string;
  supportEmail: string;
  phone: string;
  foundingDate: string;
  knowsAbout: string;
  homeAbout: string;
  homeKeywords: string;
  organizationDescription: string;
}

export function listToTextarea(items?: string[]): string {
  return (items || []).join("\n");
}

export function textareaToList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function seoEntityToForm(data?: SeoEntityData | null): SeoEntityFormState {
  return {
    brandAliases: listToTextarea(data?.brandAliases),
    officialProfiles: listToTextarea(data?.officialProfiles),
    reviewSources: listToTextarea(data?.reviewSources),
    supportEmail: data?.supportEmail || "",
    phone: data?.phone || "",
    foundingDate: data?.foundingDate || "",
    knowsAbout: listToTextarea(data?.knowsAbout),
    homeAbout: listToTextarea(data?.homeAbout),
    homeKeywords: listToTextarea(data?.homeKeywords),
    organizationDescription: data?.organizationDescription || "",
  };
}

export function formToSeoEntityPayload(
  form: SeoEntityFormState
): Record<string, unknown> {
  return {
    brandAliases: textareaToList(form.brandAliases),
    officialProfiles: textareaToList(form.officialProfiles),
    reviewSources: textareaToList(form.reviewSources),
    supportEmail: form.supportEmail.trim() || undefined,
    phone: form.phone.trim() || undefined,
    foundingDate: form.foundingDate.trim() || undefined,
    knowsAbout: textareaToList(form.knowsAbout),
    homeAbout: textareaToList(form.homeAbout),
    homeKeywords: textareaToList(form.homeKeywords),
    organizationDescription: form.organizationDescription.trim() || undefined,
  };
}

interface SeoEntityPanelProps {
  form: SeoEntityFormState;
  onChange: (patch: Partial<SeoEntityFormState>) => void;
  readOnly?: boolean;
}

const SeoEntityPanel: React.FC<SeoEntityPanelProps> = ({
  form,
  onChange,
  readOnly = false,
}) => {
  const field = (
    label: string,
    key: keyof SeoEntityFormState,
    hint?: string,
    rows = 2
  ) => (
    <div className="info-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
      <span className="info-label">{label}</span>
      {readOnly ? (
        <span className="info-value" style={{ whiteSpace: "pre-wrap" }}>
          {(form[key] as string) || "—"}
        </span>
      ) : (
        <textarea
          className="info-input"
          rows={rows}
          style={{ width: "100%", maxWidth: "560px", resize: "vertical" }}
          value={form[key] as string}
          onChange={(e) => onChange({ [key]: e.target.value })}
        />
      )}
      {hint && (
        <span style={{ fontSize: "12px", color: "var(--ui-fg-soft, #666)" }}>
          {hint}
        </span>
      )}
    </div>
  );

  return (
    <div
      className="seo-entity-panel"
      style={{
        marginTop: "12px",
        padding: "14px",
        border: "1px solid var(--ui-border, #ddd)",
        borderRadius: "8px",
        background: "var(--ui-surface-2, #f8f9fa)",
      }}
    >
      <h3 style={{ margin: "0 0 10px", fontSize: "1.05em" }}>
        SEO Entity Layer (schema.org)
      </h3>
      <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--ui-fg-soft)" }}>
        Organization / WebSite / WebPage в index.html. sameAs — только официальные
        профили; reviewSources — для /verification/, не в sameAs.
      </p>
      {field(
        "Альтернативные названия бренда (brandAliases)",
        "brandAliases",
        "По одному на строку"
      )}
      {field(
        "Официальные профили (officialProfiles → sameAs)",
        "officialProfiles",
        "URL соцсетей, Wikipedia и т.д.",
        3
      )}
      {field(
        "Источники отзывов (reviewSources)",
        "reviewSources",
        "Не попадают в sameAs",
        2
      )}
      {field(
        "Темы бренда (knowsAbout)",
        "knowsAbout",
        "Обобщённые темы: Online casino, Sports betting…",
        4
      )}
      {field("О чём главная (homeAbout → WebPage.about)", "homeAbout", undefined, 3)}
      {field("Ключевые слова главной (homeKeywords)", "homeKeywords", undefined, 2)}
      {field(
        "Описание Organization",
        "organizationDescription",
        "Кратко о бренде и GEO",
        2
      )}
      <div className="info-row" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div style={{ flex: "1 1 200px" }}>
          <span className="info-label">Email поддержки</span>
          {readOnly ? (
            <div className="info-value">{form.supportEmail || "—"}</div>
          ) : (
            <input
              type="email"
              className="info-input"
              style={{ width: "100%" }}
              value={form.supportEmail}
              onChange={(e) => onChange({ supportEmail: e.target.value })}
            />
          )}
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <span className="info-label">Телефон</span>
          {readOnly ? (
            <div className="info-value">{form.phone || "—"}</div>
          ) : (
            <input
              type="text"
              className="info-input"
              style={{ width: "100%" }}
              value={form.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
            />
          )}
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <span className="info-label">foundingDate</span>
          {readOnly ? (
            <div className="info-value">{form.foundingDate || "—"}</div>
          ) : (
            <input
              type="text"
              className="info-input"
              placeholder="2015-04-12"
              style={{ width: "100%" }}
              value={form.foundingDate}
              onChange={(e) => onChange({ foundingDate: e.target.value })}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SeoEntityPanel;

import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { pagesByLocale } from "../data/pagesByLocale.js";
import { DEFAULT_LOCALE } from "../data/siteConfig.js";
import { useLocale } from "../context/LocaleContext";
import { PageView } from "./PageView";

export function PageRoute({ fixedKey }: { fixedKey?: string }) {
  const { pageKey } = useParams<{ pageKey: string }>();
  const { locale } = useLocale();

  const key = fixedKey || pageKey || "main";

  const pageData = useMemo(() => {
    const byLoc = pagesByLocale as Record<string, Record<string, unknown>>;
    const primary = byLoc[locale]?.[key];
    if (primary) return primary;
    const fb = byLoc[normalize(DEFAULT_LOCALE)]?.[key];
    if (fb) return fb;
    const firstLoc = Object.keys(byLoc)[0];
    return firstLoc ? byLoc[firstLoc]?.[key] : undefined;
  }, [locale, key]);

  const byAll = pagesByLocale as Record<string, Record<string, unknown>>;
  const hasAnyPages =
    byAll &&
    typeof byAll === "object" &&
    Object.values(byAll).some(
      (obj) => obj && typeof obj === "object" && Object.keys(obj).length > 0
    );

  if (!hasAnyPages) {
    return (
      <div className="sb-placeholder sb-placeholder--hero">
        <h1>Нет страниц</h1>
        <p>
          Создайте проект в Site Builder, сгенерируйте страницы и сохраните их —
          затем откройте этот проект заново или выполните{" "}
          <code>npm run dev</code>.
        </p>
      </div>
    );
  }

  if (pageData === undefined) {
    return (
      <div className="sb-placeholder">
        <h2>Страница не найдена</h2>
        <p>
          Маршрут <strong>/{key === "main" ? "" : key}</strong> не сопоставлен с
          данными (<code>pagesByLocale[{locale}]</code>).
        </p>
      </div>
    );
  }

  return <PageView data={pageData as any} />;
}

function normalize(l: string): string {
  return String(l || "").toLowerCase().replace(/_/g, "-");
}

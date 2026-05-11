/**
 * Единое место: schema.org JSON-LD (@graph) для сгенерированных сайтов.
 * Только поля из данных проекта / JSON страниц — без выдуманных рейтингов и адресов.
 */

export type PageSeoSummary = {
  /** Путь маршрута: "/" или "/casino" */
  path: string;
  name: string;
  description: string;
};

/** Базовый URL сайта https://domain без завершающего слэша */
export function normalizeSiteOrigin(domain: string | undefined | null): string {
  const raw = (domain || "").trim();
  if (!raw) return "https://example.com";
  const noProto = raw.replace(/^https?:\/\//i, "").split("/")[0];
  return `https://${noProto}`;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

export function summaryFromPageJson(data: unknown): { name: string; description: string } {
  if (!data || typeof data !== "object") {
    return { name: "", description: "" };
  }
  const o = data as Record<string, unknown>;
  const title = typeof o.title === "string" ? stripHtml(o.title) : "";
  const desc = typeof o.description === "string" ? stripHtml(o.description) : "";
  const h1 = typeof o.h1 === "string" ? stripHtml(o.h1) : "";
  const h1d = typeof o.h1Description === "string" ? stripHtml(o.h1Description) : "";
  const name = title || h1 || "Page";
  let description = desc || h1d || "";
  if (!description && h1) description = h1;
  return {
    name: truncate(name, 110),
    description: truncate(description, 300),
  };
}

export interface BuildJsonLdGraphInput {
  origin: string;
  /** BCP-47, напр. en, pt-br */
  inLanguage: string;
  brand: string;
  pages: PageSeoSummary[];
}

/**
 * @graph: Organization, WebSite, WebPage для каждого маршрута, BreadcrumbList для вложенных путей.
 */
export function buildJsonLdGraph(input: BuildJsonLdGraphInput): Record<string, unknown> {
  const { origin, inLanguage, brand, pages } = input;
  const orgId = `${origin}/#organization`;
  const websiteId = `${origin}/#website`;

  const organization: Record<string, unknown> = {
    "@type": "Organization",
    "@id": orgId,
    name: brand || "Site",
    url: `${origin}/`,
  };

  const website: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": websiteId,
    name: brand || "Site",
    url: `${origin}/`,
    inLanguage,
    publisher: { "@id": orgId },
  };

  const graph: Record<string, unknown>[] = [organization, website];

  const sorted = [...pages].sort((a, b) => a.path.localeCompare(b.path));

  for (const p of sorted) {
    const pageUrl =
      p.path === "/" ? `${origin}/` : `${origin}${p.path.startsWith("/") ? "" : "/"}${p.path}`;
    const pageId = `${pageUrl}#webpage`;
    const wp: Record<string, unknown> = {
      "@type": "WebPage",
      "@id": pageId,
      url: pageUrl,
      name: p.name,
      description: p.description || undefined,
      inLanguage,
      isPartOf: { "@id": websiteId },
    };
    if (p.path !== "/") {
      const segments = p.path.split("/").filter(Boolean);
      if (segments.length > 0) {
        const crumbs: Record<string, unknown> = {
          "@type": "BreadcrumbList",
          "@id": `${pageUrl}#breadcrumb`,
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: `${origin}/`,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: p.name,
              item: pageUrl,
            },
          ],
        };
        graph.push(crumbs);
      }
    }
    graph.push(wp);
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

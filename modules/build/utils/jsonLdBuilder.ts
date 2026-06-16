/**
 * schema.org JSON-LD (@graph) для сгенерированных сайтов + SEO Entity Layer.
 */

import type { SeoEntityConfig } from "./seoEntity.js";

export type FaqItem = { question: string; answer: string };

export type PageSeoSummary = {
  /** Путь маршрута: "/" или "/casino" */
  path: string;
  name: string;
  description: string;
  /** Тип страницы (homepage, casino, custom slug…) */
  pageKey?: string;
  /** Нормализованный pageType для about-маппинга */
  pageType?: string;
  isCustom?: boolean;
  hasFaq?: boolean;
  faqItems?: FaqItem[];
};

/**
 * about по типу страницы (hack.txt п.11). Пустой массив — для home/custom/unknown.
 */
export function aboutForPageType(
  pageType: string | undefined,
  brand: string,
  geo?: string
): string[] {
  const g = (geo || "").trim();
  const withGeo = (label: string) => (g ? `${label} ${g}` : label);
  const key = (pageType || "").toLowerCase();

  switch (key) {
    case "login":
      return [`${brand} Login`, withGeo("Casino Login"), `${brand} Account Access`];
    case "app":
      return [`${brand} App`, withGeo("Casino App"), withGeo("Mobile Gaming")];
    case "casino":
      return [`${brand} Casino`, withGeo("Online Casino"), withGeo("Casino Games")];
    case "bet":
    case "betting":
      return [`${brand} Bet`, withGeo("Sports Betting")];
    case "games":
      return [`${brand} Games`, withGeo("Casino Games")];
    case "slot":
    case "slots":
      return [`${brand} Slot`, withGeo("Online Slots")];
    default:
      return [];
  }
}

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
  inLanguage: string;
  brand: string;
  pages: PageSeoSummary[];
  entity?: SeoEntityConfig;
}

function pageUrl(origin: string, routePath: string): string {
  return routePath === "/"
    ? `${origin}/`
    : `${origin}${routePath.startsWith("/") ? "" : "/"}${routePath}`;
}

function buildOrganization(
  origin: string,
  entity: SeoEntityConfig
): Record<string, unknown> {
  const org: Record<string, unknown> = {
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: entity.brand,
    url: `${origin}/`,
    description: entity.organizationDescription,
  };

  if (entity.brandAliases.length > 0) {
    org.alternateName = entity.brandAliases;
  }

  if (entity.logoAbsoluteUrl) {
    org.logo = {
      "@type": "ImageObject",
      url: entity.logoAbsoluteUrl,
      width: 600,
      height: 60,
    };
  }

  if (entity.geo) {
    org.areaServed = entity.countryCode
      ? [{ "@type": "Country", name: entity.geo }]
      : entity.geo;
  } else if (entity.countryCode) {
    org.areaServed = entity.countryCode;
  }

  if (entity.languages.length > 0) {
    org.availableLanguage = entity.languages;
  }

  if (entity.officialProfiles.length > 0) {
    org.sameAs = entity.officialProfiles;
  }

  if (entity.knowsAbout.length > 0) {
    org.knowsAbout = entity.knowsAbout;
  }

  if (entity.foundingDate) {
    org.foundingDate = entity.foundingDate;
  }

  const email = entity.supportEmail?.trim();
  const phone = entity.phone?.trim();
  if (email || phone) {
    const cp: Record<string, unknown> = {
      "@type": "ContactPoint",
      contactType: "customer support",
    };
    if (email) cp.email = email;
    if (phone) cp.telephone = phone;
    if (entity.geo || entity.countryCode) {
      cp.areaServed = entity.countryCode || entity.geo;
    }
    if (entity.languages.length > 0) {
      cp.availableLanguage = entity.languages;
    }
    org.contactPoint = cp;
  }

  return org;
}

function buildWebSite(
  origin: string,
  entity: SeoEntityConfig,
  inLanguage: string,
  orgId: string
): Record<string, unknown> {
  const site: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: entity.brand,
    url: `${origin}/`,
    inLanguage,
    publisher: { "@id": orgId },
  };
  if (entity.brandAliases.length > 0) {
    site.alternateName = entity.brandAliases;
  }
  return site;
}

function buildWebPageNode(input: {
  origin: string;
  page: PageSeoSummary;
  inLanguage: string;
  websiteId: string;
  orgId: string;
  isHome: boolean;
  entity: SeoEntityConfig;
}): Record<string, unknown> {
  const { origin, page, inLanguage, websiteId, orgId, isHome, entity } = input;
  const url = pageUrl(origin, page.path);
  const pageId = isHome ? `${origin}/#webpage` : `${url}#webpage`;

  const wp: Record<string, unknown> = {
    "@type": "WebPage",
    "@id": pageId,
    url,
    name: page.name,
    inLanguage,
    isPartOf: { "@id": websiteId },
    publisher: { "@id": orgId },
  };

  if (page.description) {
    wp.description = page.description;
  }

  let about: string[] = [];
  if (isHome) {
    about = entity.homeAbout;
    if (entity.homeKeywords.length > 0) {
      wp.keywords = entity.homeKeywords.join(", ");
    }
  } else if (page.isCustom) {
    // custom → about из настроек/описания страницы
    about = page.description ? [page.description] : [];
  } else {
    about = aboutForPageType(page.pageType, entity.brand, entity.geo);
    if (about.length === 0 && page.description) {
      about = [page.description];
    }
  }

  if (about.length === 1) {
    wp.about = about[0];
  } else if (about.length > 1) {
    wp.about = about;
  }

  return wp;
}

/** FAQPage node — только при наличии реальных FAQ-элементов на странице. */
function buildFaqNode(
  origin: string,
  page: PageSeoSummary,
  isHome: boolean
): Record<string, unknown> | null {
  if (!page.hasFaq || !page.faqItems || page.faqItems.length === 0) {
    return null;
  }
  const url = isHome ? `${origin}/` : pageUrl(origin, page.path);
  const mainEntity = page.faqItems
    .filter((it) => it.question?.trim() && it.answer?.trim())
    .map((it) => ({
      "@type": "Question",
      name: it.question.trim(),
      acceptedAnswer: {
        "@type": "Answer",
        text: it.answer.trim(),
      },
    }));
  if (mainEntity.length === 0) return null;
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    isPartOf: { "@id": isHome ? `${origin}/#webpage` : `${url}#webpage` },
    mainEntity,
  };
}

/**
 * @graph: Organization, WebSite, WebPage (+ BreadcrumbList для вложенных путей).
 */
export function buildJsonLdGraph(input: BuildJsonLdGraphInput): Record<string, unknown> {
  const { origin, inLanguage, brand, pages } = input;
  const entity: SeoEntityConfig = input.entity || {
    brand,
    domain: origin.replace(/^https:\/\//, ""),
    languages: [inLanguage],
    officialProfiles: [],
    reviewSources: [],
    homeKeywords: [],
    brandAliases: [brand],
    knowsAbout: [],
    homeAbout: [],
  };

  const orgId = `${origin}/#organization`;
  const websiteId = `${origin}/#website`;

  const graph: Record<string, unknown>[] = [
    buildOrganization(origin, entity),
    buildWebSite(origin, entity, inLanguage, orgId),
  ];

  const sorted = [...pages].sort((a, b) => a.path.localeCompare(b.path));

  for (const p of sorted) {
    const isHome = p.path === "/";
    const url = pageUrl(origin, p.path);

    const wpNode = buildWebPageNode({
      origin,
      page: p,
      inLanguage,
      websiteId,
      orgId,
      isHome,
      entity,
    });

    if (!isHome) {
      wpNode.breadcrumb = { "@id": `${url}#breadcrumb` };
    }

    graph.push(wpNode);

    if (!isHome) {
      const segments = p.path.split("/").filter(Boolean);
      if (segments.length > 0) {
        graph.push({
          "@type": "BreadcrumbList",
          "@id": `${url}#breadcrumb`,
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
              item: url,
            },
          ],
        });
      }
    }

    const faqNode = buildFaqNode(origin, p, isHome);
    if (faqNode) {
      graph.push(faqNode);
    }
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

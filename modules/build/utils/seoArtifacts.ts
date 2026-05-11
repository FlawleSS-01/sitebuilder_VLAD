/**
 * SEO artefacts that live OUTSIDE index.html: robots.txt, sitemap.xml.
 *
 * These are written into the project's `public/` directory so Vite copies
 * them as-is into the final build. We rebuild them every time pages are
 * saved or the project is updated, so the sitemap always reflects the
 * latest set of generated pages and active locales.
 */
import fs from "fs";
import path from "path";
import { normalizeSiteOrigin, type PageSeoSummary } from "./jsonLdBuilder.js";

export interface SitemapInput {
  origin: string;
  /** Routes that are actually present in the project (pages already generated). */
  pages: PageSeoSummary[];
  /** All BCP-47 locales for the project, e.g. ["en","pt-br"]. Empty = single-locale. */
  locales: string[];
  defaultLocale: string;
  /**
   * Whether the project actually serves locales as separate URLs. Most
   * generators here use a single SPA per project and switch locales via
   * the LocaleContext (no URL change). In that case we still emit
   * hreflang annotations but every URL points to the same path.
   */
  multiLocale: boolean;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds a sitemap.xml string with optional xhtml:link hreflang
 * annotations per URL. Sitemaps support up to 50k URLs; for the
 * generator's scale (≈10 pages × ≈10 locales) we never need pagination.
 */
export function buildSitemapXml(input: SitemapInput): string {
  const { origin, pages, locales, defaultLocale, multiLocale } = input;
  const today = new Date().toISOString().slice(0, 10);

  const seenPaths = new Set<string>();
  const uniquePages = pages.filter((p) => {
    if (seenPaths.has(p.path)) return false;
    seenPaths.add(p.path);
    return true;
  });

  const includeXhtml = multiLocale && locales.length > 1;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' +
      (includeXhtml
        ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"'
        : "") +
      ">"
  );

  for (const p of uniquePages) {
    const fullUrl =
      p.path === "/"
        ? `${origin}/`
        : `${origin}${p.path.startsWith("/") ? "" : "/"}${p.path}`;

    const priority = p.path === "/" ? "1.0" : "0.7";
    const changefreq = p.path === "/" ? "weekly" : "monthly";

    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(fullUrl)}</loc>`);
    lines.push(`    <lastmod>${today}</lastmod>`);
    lines.push(`    <changefreq>${changefreq}</changefreq>`);
    lines.push(`    <priority>${priority}</priority>`);

    if (includeXhtml) {
      // Same SPA path for every locale (no /en/, /pt-br/ prefix in the
      // generator's routes). Emit hreflang anchors so search engines
      // know each locale is the same canonical document. If the project
      // ever moves to per-locale URL prefixes, only the href below has
      // to change.
      for (const loc of locales) {
        lines.push(
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(
            loc
          )}" href="${escapeXml(fullUrl)}" />`
        );
      }
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(
          fullUrl
        )}" />`
      );
    }

    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return lines.join("\n") + "\n";
}

export function buildRobotsTxt(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

export interface WriteSeoArtifactsInput extends SitemapInput {
  projectPath: string;
}

/**
 * Writes robots.txt and sitemap.xml to the project's public/ directory.
 * Vite (the project's bundler) copies public/ verbatim into dist/, so
 * `<host>/robots.txt` and `<host>/sitemap.xml` work after build.
 */
export function writeSeoArtifacts(input: WriteSeoArtifactsInput): void {
  const { projectPath, origin } = input;
  const publicDir = path.join(projectPath, "public");
  ensureDir(publicDir);

  fs.writeFileSync(
    path.join(publicDir, "robots.txt"),
    buildRobotsTxt(origin),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(publicDir, "sitemap.xml"),
    buildSitemapXml(input),
    "utf-8"
  );
}

export function originForSettings(
  settings: Record<string, unknown>
): string {
  return normalizeSiteOrigin(settings.domain as string | undefined);
}

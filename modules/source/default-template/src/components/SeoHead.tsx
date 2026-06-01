import { useEffect } from "react";
import { titleWithBrandLeading } from "../../page-title-brand-first";

const SITE_NAME =
  (import.meta.env.VITE_SITE_NAME as string | undefined) || "Casino";

/**
 * Per-route SEO sync: updates `<title>`, `<meta name="description">`,
 * `<link rel="canonical">` and the Open Graph / Twitter Card pair so
 * each route has its own preview when shared/crawled.
 *
 * The static `index.html` ships with the home-page meta block (rendered
 * by `indexHtmlSync` on the server). When the user clicks into a route,
 * this hook overrides those tags with the active page's data, then
 * restores the home meta when the route unmounts.
 */
export function useSeoHead({
  title,
  description,
  pathname,
}: {
  title?: string;
  description?: string;
  pathname?: string;
}): void {
  useEffect(() => {
    const fullTitle = title?.trim()
      ? titleWithBrandLeading(SITE_NAME, title.trim())
      : SITE_NAME;

    const previousTitle = document.title;
    document.title = fullTitle;

    const upsertMeta = (
      selector: string,
      attrName: "name" | "property",
      attrValue: string,
      content: string
    ): { node: HTMLMetaElement; previous: string | null } => {
      let node = document.head.querySelector<HTMLMetaElement>(selector);
      let previous: string | null = null;
      if (node) {
        previous = node.getAttribute("content");
      } else {
        node = document.createElement("meta");
        node.setAttribute(attrName, attrValue);
        document.head.appendChild(node);
      }
      node.setAttribute("content", content);
      return { node, previous };
    };

    const upsertLink = (
      rel: string,
      href: string
    ): { node: HTMLLinkElement; previous: string | null } => {
      let node = document.head.querySelector<HTMLLinkElement>(
        `link[rel="${rel}"]`
      );
      let previous: string | null = null;
      if (node) {
        previous = node.getAttribute("href");
      } else {
        node = document.createElement("link");
        node.setAttribute("rel", rel);
        document.head.appendChild(node);
      }
      node.setAttribute("href", href);
      return { node, previous };
    };

    const desc =
      (description || "").trim() || `${SITE_NAME} — official site.`;

    const updates: Array<{
      restore: () => void;
    }> = [];

    const descMeta = upsertMeta(
      'meta[name="description"]',
      "name",
      "description",
      desc
    );
    updates.push({
      restore: () => {
        if (descMeta.previous != null) {
          descMeta.node.setAttribute("content", descMeta.previous);
        }
      },
    });

    const ogTitle = upsertMeta(
      'meta[property="og:title"]',
      "property",
      "og:title",
      fullTitle
    );
    updates.push({
      restore: () => {
        if (ogTitle.previous != null) {
          ogTitle.node.setAttribute("content", ogTitle.previous);
        }
      },
    });

    const ogDesc = upsertMeta(
      'meta[property="og:description"]',
      "property",
      "og:description",
      desc
    );
    updates.push({
      restore: () => {
        if (ogDesc.previous != null) {
          ogDesc.node.setAttribute("content", ogDesc.previous);
        }
      },
    });

    const twTitle = upsertMeta(
      'meta[name="twitter:title"]',
      "name",
      "twitter:title",
      fullTitle
    );
    updates.push({
      restore: () => {
        if (twTitle.previous != null) {
          twTitle.node.setAttribute("content", twTitle.previous);
        }
      },
    });

    const twDesc = upsertMeta(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
      desc
    );
    updates.push({
      restore: () => {
        if (twDesc.previous != null) {
          twDesc.node.setAttribute("content", twDesc.previous);
        }
      },
    });

    if (pathname) {
      // Anchor canonical to the active route. We use the location host
      // to keep this working in both dev (localhost) and prod (real
      // domain) without server-side knowledge of the deploy target.
      const canonicalHref = `${window.location.origin}${pathname}`;
      const canonical = upsertLink("canonical", canonicalHref);
      const ogUrl = upsertMeta(
        'meta[property="og:url"]',
        "property",
        "og:url",
        canonicalHref
      );
      updates.push({
        restore: () => {
          if (canonical.previous != null) {
            canonical.node.setAttribute("href", canonical.previous);
          }
          if (ogUrl.previous != null) {
            ogUrl.node.setAttribute("content", ogUrl.previous);
          }
        },
      });
    }

    return () => {
      document.title = previousTitle;
      for (const u of updates) u.restore();
    };
  }, [title, description, pathname]);
}

import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { pageMetadata } from "../data/pageMetadata.js";
import { useLocale } from "../context/LocaleContext";

const SITE_NAME = (import.meta.env.VITE_SITE_NAME as string | undefined) || "Casino";
const AFFILIATE =
  (import.meta.env.VITE_AFFILIATE_URL as string | undefined) ||
  (import.meta.env.VITE_AFFILIATE_LINK as string | undefined) ||
  "#";
const CTA_TEXT =
  (import.meta.env.VITE_BUTTON1_TEXT as string | undefined) || `Play ${SITE_NAME}`;
const LOGO_URL = "/images/logo.webp";

function orderedNavKeys(meta: Record<string, string>): string[] {
  const keys = Object.keys(meta || {});
  if (keys.length === 0) return [];
  const rest = keys.filter((k) => k !== "main").sort();
  return keys.includes("main") ? ["main", ...rest] : [...keys].sort();
}

function brandInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "★";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

const MARQUEE_ITEMS = [
  "100% Welcome Bonus",
  "Fast & Secure Payouts",
  "Free Spins Daily",
  "Live Dealers 24/7",
  "Mobile Ready",
  "Top Slots & Jackpots",
];

/**
 * Reads the active theme's structural variant id from a CSS custom
 * property (`--sb-style-id`) and reflects it onto <body data-sb-style="...">.
 *
 * This lets each theme pick its own hero/card/decoration treatment by
 * setting just one CSS variable, while all variant rules live centrally
 * in `index.css` and we don't need a router-level config.
 */
function useThemeStructuralVariant() {
  useEffect(() => {
    let lastStyle = "";
    let lastAlign = "";
    const readVar = (name: string) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    const apply = () => {
      const styleId = readVar("--sb-style-id") || "spotlight";
      // Per-theme hero text alignment ("left" | "right" | "center").
      // Default left; themes can opt into right/centre by setting
      // `--sb-hero-align`. Reflected as <body data-sb-align="..."> so
      // selectors in index.css can adapt the hero layout cleanly.
      const align = (readVar("--sb-hero-align") || "left").toLowerCase();
      if (styleId !== lastStyle) {
        document.body.setAttribute("data-sb-style", styleId);
        lastStyle = styleId;
      }
      if (align !== lastAlign) {
        document.body.setAttribute("data-sb-align", align);
        lastAlign = align;
      }
    };

    apply();

    // Vite HMR swaps the imported CSS by inserting/removing <style> and
    // <link> nodes in <head>. Watch those mutations so theme switches
    // (from the build UI) re-apply the structural variant instantly,
    // without requiring a manual reload.
    const observer = new MutationObserver(() => apply());
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"],
    });

    document.addEventListener("visibilitychange", apply);
    window.addEventListener("focus", apply);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
      window.removeEventListener("focus", apply);
    };
  }, []);
}

export function Layout() {
  const location = useLocation();
  const { locale, setLocale, locales } = useLocale();
  const keys = orderedNavKeys(pageMetadata as Record<string, string>);
  const multiLocale = locales.length > 1;
  const [logoOk, setLogoOk] = useState(true);
  const [navOpen, setNavOpen] = useState(false);

  useThemeStructuralVariant();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="sb-app">
      <div className="sb-marquee" aria-hidden="true">
        <div className="sb-marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i}>{item}</span>
          ))}
        </div>
      </div>

      <header className="sb-header">
        <div className="sb-header-inner">
          <Link to="/" className="sb-brand" aria-label={SITE_NAME}>
            <span className="sb-brand-mark">
              {logoOk ? (
                <img
                  src={LOGO_URL}
                  alt={`${SITE_NAME} logo`}
                  loading="eager"
                  decoding="async"
                  onError={() => setLogoOk(false)}
                />
              ) : (
                <span className="sb-brand-mark--text">
                  {brandInitials(SITE_NAME)}
                </span>
              )}
            </span>
            <span>{SITE_NAME}</span>
          </Link>

          {keys.length > 0 && (
            <nav
              className={navOpen ? "sb-nav is-open" : "sb-nav"}
              aria-label="Primary"
            >
              <ul className="sb-nav-list">
                {keys.map((key) => {
                  const target = key === "main" ? "/" : `/${key}`;
                  const active = location.pathname === target;
                  return (
                    <li key={key}>
                      <Link
                        to={target}
                        className={
                          active ? "sb-nav-link is-active" : "sb-nav-link"
                        }
                      >
                        {(pageMetadata as Record<string, string>)[key] || key}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          <div className="sb-header-actions">
            {multiLocale && (
              <label className="sb-locale">
                <span className="visually-hidden">Language</span>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  aria-label="Language"
                >
                  {locales.map((code) => (
                    <option key={code} value={code}>
                      {code.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <a
              className="sb-header-cta"
              href={AFFILIATE}
              rel="noopener noreferrer"
            >
              {CTA_TEXT}
            </a>
            <button
              type="button"
              className={navOpen ? "sb-burger is-open" : "sb-burger"}
              aria-label="Toggle menu"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <span />
            </button>
          </div>
        </div>
      </header>

      <main className="sb-main">
        <Outlet />
      </main>

      <footer className="sb-footer">
        <div className="sb-footer-strip">
          <span className="sb-footer-chip">18+</span>
          <span className="sb-footer-chip">Play Responsibly</span>
          <span className="sb-footer-chip">Secure SSL</span>
        </div>
        <small>
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </small>
      </footer>
    </div>
  );
}

import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "modules/source/theme-presets");
const presets = [
  { n: "theme7", style: "spotlight", bg: "#0a1628", accent: "#00d4aa", accent2: "#7c3aed" },
  { n: "theme8", style: "glass", bg: "#1a1a2e", accent: "#e94560", accent2: "#533483" },
  { n: "theme9", style: "magazine", bg: "#2d132c", accent: "#ee4540", accent2: "#801336" },
  { n: "theme10", style: "cyber", bg: "#0f0f23", accent: "#00ff88", accent2: "#0088ff" },
  { n: "theme11", style: "deco", bg: "#1c2833", accent: "#f39c12", accent2: "#d35400" },
  { n: "theme12", style: "diagonal", bg: "#2c1810", accent: "#c0392b", accent2: "#922b21" },
  { n: "crimson-gold", style: "spotlight", bg: "#12080a", accent: "#ffd700", accent2: "#b22222" },
  { n: "ocean-teal", style: "glass", bg: "#051923", accent: "#00b4d8", accent2: "#0077b6" },
];

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

for (const p of presets) {
  const heroOverlay = `linear-gradient(115deg, rgba(${hexToRgb(p.bg)}, 0.94) 0%, rgba(${hexToRgb(p.bg)}, 0.72) 48%, rgba(${hexToRgb(p.accent2)}, 0.38) 100%)`;
  const extra =
    p.n === "theme9"
      ? `
  --sb-hero-panel-content: "Live Tables · Top Slots · Instant Payouts";
  --sb-hero-panel-color: rgba(255, 240, 240, 0.95);`
      : p.n === "theme12"
        ? `
  --sb-marquee-fg: #ff8a65;
  --sb-marquee-bullet: #ffb74d;
  --sb-marquee-border: #e64a19;
  --sb-marquee-border-2: #ff7043;`
        : "";
  const css = `:root {
  --sb-style-id: "${p.style}";
  --sb-hero-align: center;
  --sb-bg: ${p.bg};
  --sb-bg-2: ${p.accent2};
  --sb-fg: #f5f5f5;
  --sb-fg-soft: rgba(245, 245, 245, 0.82);
  --sb-accent: ${p.accent};
  --sb-accent-2: ${p.accent2};
  --sb-accent-3: ${p.accent};
  --sb-card: rgba(255,255,255,0.06);
  --sb-card-border: rgba(255,255,255,0.12);
  --sb-header-bg: rgba(0,0,0,0.75);
  --sb-hero-overlay: ${heroOverlay};
  --main-color: ${p.accent2};
  --text-color: #f5f5f5;
  --hero-color: #f5f5f5;${extra}
  --card-background: ${p.accent};
  --mainBtn-background: ${p.accent};
  --mainBtn-color: ${p.bg};
  --faq-color-active: ${p.accent};
}
body { background: var(--sb-bg); color: var(--sb-fg); }
`;
  fs.writeFileSync(path.join(dir, `${p.n}.css`), css);
}
console.log(`wrote ${presets.length} presets`);

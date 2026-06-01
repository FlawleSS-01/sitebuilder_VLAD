import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const THEME_PRESETS_DIR = path.join(
  __dirname,
  "..",
  "..",
  "source",
  "theme-presets"
);

export interface ThemeCatalogEntry {
  id: string;
  name: string;
  nameRu: string;
  taglineRu?: string;
  swatches: [string, string, string];
}

/** Порядок карточек в модалке (по палитре, не по алфавиту id). */
export const THEME_SORT_ORDER: string[] = [
  "default",
  "crimson-gold",
  "theme1",
  "theme6",
  "theme12",
  "grey-red",
  "theme9",
  "blue-pink",
  "blue-violet",
  "theme5",
  "theme7",
  "theme10",
  "ocean-teal",
  "emerald-skyblue",
  "theme3",
  "green-yellow",
  "theme4",
  "theme8",
  "theme11",
  "theme2",
];

const CATALOG: Record<string, Omit<ThemeCatalogEntry, "id">> = {
  default: {
    name: "Royal Gold",
    nameRu: "Королевское золото",
    taglineRu: "Тёмно-синий с золотом и маджентой",
    swatches: ["#0b0f24", "#ffd166", "#ef476f"],
  },
  "blue-pink": {
    name: "Neon Boulevard",
    nameRu: "Неоновый бульвар",
    taglineRu: "Глубокий синий с розовым неоном",
    swatches: ["#050b2e", "#ff3da5", "#5cd1ff"],
  },
  "blue-violet": {
    name: "Twilight Velvet",
    nameRu: "Сумеречный бархат",
    taglineRu: "Индиго с фиолетовым свечением",
    swatches: ["#07061f", "#a259ff", "#ff66c4"],
  },
  "emerald-skyblue": {
    name: "Tropical Resort",
    nameRu: "Тропический курорт",
    taglineRu: "Изумруд с небесно-голубым",
    swatches: ["#02180f", "#36e2c8", "#5cc8ff"],
  },
  "green-yellow": {
    name: "Lucky Clover",
    nameRu: "Счастливый клевер",
    taglineRu: "Лесная зелень с золотым",
    swatches: ["#061a07", "#f9e655", "#82e668"],
  },
  "grey-red": {
    name: "Onyx & Ruby",
    nameRu: "Оникс и рубин",
    taglineRu: "Графит с алым акцентом",
    swatches: ["#121212", "#ff3b3f", "#ffb86b"],
  },
  "crimson-gold": {
    name: "Crimson Gold",
    nameRu: "Багровое золото",
    taglineRu: "Чёрно-бордовый с золотом",
    swatches: ["#12080a", "#ffd700", "#b22222"],
  },
  "ocean-teal": {
    name: "Ocean Teal",
    nameRu: "Океанский бирюза",
    taglineRu: "Тёмный морской с бирюзой",
    swatches: ["#051923", "#00b4d8", "#0077b6"],
  },
  theme1: {
    name: "Sunset Vegas",
    nameRu: "Закатный Вегас",
    taglineRu: "Бордо с оранжевым неоном",
    swatches: ["#1a0510", "#ffb347", "#ff5e62"],
  },
  theme2: {
    name: "Magenta Dreams",
    nameRu: "Сны в маджента",
    taglineRu: "Фиолетовый с розовым",
    swatches: ["#14001a", "#ff4dd2", "#b14dff"],
  },
  theme3: {
    name: "Emerald Lounge",
    nameRu: "Изумрудный лаунж",
    taglineRu: "Зелень с мятой и золотом",
    swatches: ["#02180f", "#ffd166", "#5be79b"],
  },
  theme4: {
    name: "Cyber Neon",
    nameRu: "Кибер-неон",
    taglineRu: "Чёрный с цианом и лаймом",
    swatches: ["#050614", "#00f5d4", "#a3ff00"],
  },
  theme5: {
    name: "Sapphire Royale",
    nameRu: "Сапфировый рояль",
    taglineRu: "Синий с серебром и золотом",
    swatches: ["#050d24", "#f5d76e", "#c0c8de"],
  },
  theme6: {
    name: "Volcanic Ruby",
    nameRu: "Вулканический рубин",
    taglineRu: "Бордовый с янтарным",
    swatches: ["#1a0606", "#ffae00", "#ff3b3f"],
  },
  theme7: {
    name: "Aurora Violet",
    nameRu: "Северное сияние",
    taglineRu: "Ночной синий с фиолетом и мятой",
    swatches: ["#0a1628", "#00d4aa", "#7c3aed"],
  },
  theme8: {
    name: "Velvet Rose",
    nameRu: "Бархатная роза",
    taglineRu: "Индиго с малиновым стеклом",
    swatches: ["#1a1a2e", "#e94560", "#533483"],
  },
  theme9: {
    name: "Royal Plum",
    nameRu: "Королевская слива",
    taglineRu: "Сливовый с алым и золотом",
    swatches: ["#2d132c", "#ee4540", "#801336"],
  },
  theme10: {
    name: "Matrix Pulse",
    nameRu: "Матричный пульс",
    taglineRu: "Кибер-чёрный с лаймом и синим",
    swatches: ["#0f0f23", "#00ff88", "#0088ff"],
  },
  theme11: {
    name: "Amber Forge",
    nameRu: "Янтарная кузня",
    taglineRu: "Графит с оранжевым и золотом",
    swatches: ["#1c2833", "#f39c12", "#d35400"],
  },
  theme12: {
    name: "Ember Flame",
    nameRu: "Угольное пламя",
    taglineRu: "Тёплый коричневый с алым",
    swatches: ["#2c1810", "#c0392b", "#922b21"],
  },
};

function parseSwatchesFromCss(css: string): [string, string, string] | null {
  const bg = css.match(/--sb-bg:\s*(#[0-9a-fA-F]{3,8})/)?.[1];
  const a1 = css.match(/--sb-accent:\s*(#[0-9a-fA-F]{3,8})/)?.[1];
  const a2 = css.match(/--sb-accent-2:\s*(#[0-9a-fA-F]{3,8})/)?.[1];
  if (bg && a1 && a2) return [bg, a1, a2];
  return null;
}

function readPresetCss(id: string): string | null {
  const p = path.join(THEME_PRESETS_DIR, `${id}.css`);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf-8");
}

function fallbackMeta(id: string): Omit<ThemeCatalogEntry, "id"> {
  const pretty = id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const css = readPresetCss(id);
  const swatches = (css && parseSwatchesFromCss(css)) || [
    "#1a1244",
    "#ffd166",
    "#ef476f",
  ];
  return { name: pretty, nameRu: pretty, swatches };
}

export function getThemeCatalogEntry(id: string): ThemeCatalogEntry {
  const base = CATALOG[id] ?? fallbackMeta(id);
  const css = readPresetCss(id);
  const parsed = css ? parseSwatchesFromCss(css) : null;
  return {
    id,
    ...base,
    swatches: parsed ?? base.swatches,
  };
}

export function listPresetThemeIds(): string[] {
  const names = new Set<string>();
  if (fs.existsSync(THEME_PRESETS_DIR)) {
    for (const file of fs.readdirSync(THEME_PRESETS_DIR)) {
      if (file.endsWith(".css") && file !== "castom.css") {
        names.add(file.replace(/\.css$/, ""));
      }
    }
  }
  return Array.from(names);
}

export function getThemesCatalog(): ThemeCatalogEntry[] {
  const ids = listPresetThemeIds();
  const orderIndex = new Map(THEME_SORT_ORDER.map((id, i) => [id, i]));

  return ids
    .map((id) => getThemeCatalogEntry(id))
    .sort((a, b) => {
      const ai = orderIndex.get(a.id) ?? 999;
      const bi = orderIndex.get(b.id) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.nameRu.localeCompare(b.nameRu, "ru");
    });
}

export function sortThemeIds(ids: string[]): string[] {
  const orderIndex = new Map(THEME_SORT_ORDER.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => {
    const ai = orderIndex.get(a) ?? 999;
    const bi = orderIndex.get(b) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

/**
 * Подписи и превью-палитры тем (fallback, если API /themes недоступен).
 * Основной источник на сервере: modules/build/utils/themeCatalog.ts
 */

export interface ThemePresetMeta {
  name: string;
  nameRu: string;
  tagline?: string;
  taglineRu?: string;
  swatches: [string, string, string];
}

const THEME_META: Record<string, ThemePresetMeta> = {
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

const FALLBACK_SORT: string[] = [
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

const DEFAULT_SWATCHES: [string, string, string] = [
  "#1a1244",
  "#ffd166",
  "#ef476f",
];

const fallbackMeta = (themeId: string): ThemePresetMeta => {
  const pretty = themeId
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
  return { name: pretty, nameRu: pretty, swatches: DEFAULT_SWATCHES };
};

export const getThemeMeta = (themeId: string): ThemePresetMeta =>
  THEME_META[themeId] ?? fallbackMeta(themeId);

export function themeDisplayName(themeId: string): string {
  return getThemeMeta(themeId).name;
}

export function themeDisplayNameRu(themeId: string): string {
  return getThemeMeta(themeId).nameRu;
}

export function themeTaglineRu(themeId: string): string | undefined {
  return getThemeMeta(themeId).taglineRu;
}

export function themeSwatches(themeId: string): [string, string, string] {
  return getThemeMeta(themeId).swatches;
}

export type ThemeCatalogCard = ThemePresetMeta & { id: string };

export function buildFallbackThemeCatalog(): ThemeCatalogCard[] {
  const order = new Map(FALLBACK_SORT.map((id, i) => [id, i]));
  return Object.keys(THEME_META)
    .map((id) => ({ id, ...getThemeMeta(id) }))
    .sort((a, b) => {
      const ai = order.get(a.id) ?? 999;
      const bi = order.get(b.id) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.nameRu.localeCompare(b.nameRu, "ru");
    });
}

export const THEME_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(THEME_META).map(([id, meta]) => [id, meta.name])
);

export const THEME_LABELS_RU: Record<string, string> = Object.fromEntries(
  Object.entries(THEME_META).map(([id, meta]) => [id, meta.nameRu])
);

/**
 * Подписи для тем шаблонов сайта-казино.
 * Ключ — id темы (имя файла .css в `modules/source/theme-presets`).
 *
 * Имена соответствуют визуальной палитре каждой темы — это помогает
 * быстро узнать тему по карточке без необходимости каждый раз
 * запускать превью.
 */

interface ThemeMeta {
  /** Английское название темы (отображается в карточке). */
  name: string;
  /** Русское название (вторая строка в карточке). */
  nameRu: string;
  /** Краткое описание палитры. */
  tagline?: string;
  /** Краткое описание палитры (RU). */
  taglineRu?: string;
}

const THEME_META: Record<string, ThemeMeta> = {
  default: {
    name: "Royal Gold",
    nameRu: "Королевское золото",
    tagline: "Navy stage with gold + magenta neon",
    taglineRu: "Тёмно-синий с золотом и неоном",
  },
  "blue-pink": {
    name: "Neon Boulevard",
    nameRu: "Неоновый бульвар",
    tagline: "Deep blue with hot pink highlights",
    taglineRu: "Глубокий синий с горячим розовым",
  },
  "blue-violet": {
    name: "Twilight Velvet",
    nameRu: "Сумеречный бархат",
    tagline: "Indigo with vivid violet glow",
    taglineRu: "Индиго с фиолетовым свечением",
  },
  "emerald-skyblue": {
    name: "Tropical Resort",
    nameRu: "Тропический курорт",
    tagline: "Emerald with cool sky-blue trim",
    taglineRu: "Изумруд с холодным небесно-голубым",
  },
  "green-yellow": {
    name: "Lucky Clover",
    nameRu: "Счастливый клевер",
    tagline: "Forest green with golden yellow",
    taglineRu: "Лесная зелень с золотым жёлтым",
  },
  "grey-red": {
    name: "Onyx & Ruby",
    nameRu: "Оникс и рубин",
    tagline: "Charcoal stage with vivid red",
    taglineRu: "Графитовый с яркой рубиновой деталью",
  },
  theme1: {
    name: "Sunset Vegas",
    nameRu: "Закатный Вегас",
    tagline: "Crimson stage with orange neon and gold",
    taglineRu: "Бордо с оранжевым неоном и золотом",
  },
  theme2: {
    name: "Magenta Dreams",
    nameRu: "Сны в маджента",
    tagline: "Violet stage with hot pink and aqua",
    taglineRu: "Фиолетовый с розовым и аквамарином",
  },
  theme3: {
    name: "Emerald Lounge",
    nameRu: "Изумрудный лаунж",
    tagline: "Forest green with mint and gold",
    taglineRu: "Лесная зелень с мятой и золотом",
  },
  theme4: {
    name: "Cyber Neon",
    nameRu: "Кибер-неон",
    tagline: "Near-black with electric cyan and lime",
    taglineRu: "Почти чёрный с циановым и лаймовым",
  },
  theme5: {
    name: "Sapphire Royale",
    nameRu: "Сапфировый рояль",
    tagline: "Deep blue with platinum silver and gold",
    taglineRu: "Глубокий синий с платиной и золотом",
  },
  theme6: {
    name: "Volcanic Ruby",
    nameRu: "Вулканический рубин",
    tagline: "Deep maroon with hot red and amber",
    taglineRu: "Тёмно-бордовый с алым и янтарным",
  },
};

const fallback = (themeId: string): ThemeMeta => {
  const pretty = themeId
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
  return { name: pretty, nameRu: pretty };
};

const getMeta = (themeId: string): ThemeMeta =>
  THEME_META[themeId] ?? fallback(themeId);

/** EN labels (id темы = ключ API / имя файла .css). */
export const THEME_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(THEME_META).map(([id, meta]) => [id, meta.name])
);

/** RU labels для сетки пресетов. */
export const THEME_LABELS_RU: Record<string, string> = Object.fromEntries(
  Object.entries(THEME_META).map(([id, meta]) => [id, meta.nameRu])
);

export function themeDisplayName(themeId: string): string {
  return getMeta(themeId).name;
}

export function themeDisplayNameRu(themeId: string): string {
  return getMeta(themeId).nameRu;
}

export function themeTagline(themeId: string): string | undefined {
  return getMeta(themeId).tagline;
}

export function themeTaglineRu(themeId: string): string | undefined {
  return getMeta(themeId).taglineRu;
}

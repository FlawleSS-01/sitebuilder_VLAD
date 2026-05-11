/**
 * Словарь для преобразования названий стран в прилагательные
 * Используется для замены плейсхолдеров в промтах
 */
export const COUNTRY_ADJECTIVES: Record<string, string> = {
  // Азия
  bangladesh: "Bangladeshi",
  india: "Indian",
  pakistan: "Pakistani",
  sri_lanka: "Sri Lankan",
  nepal: "Nepalese",
  bhutan: "Bhutanese",
  maldives: "Maldivian",
  afghanistan: "Afghan",
  china: "Chinese",
  japan: "Japanese",
  korea: "Korean",
  thailand: "Thai",
  vietnam: "Vietnamese",
  philippines: "Filipino",
  indonesia: "Indonesian",
  malaysia: "Malaysian",
  singapore: "Singaporean",
  myanmar: "Myanmar",
  cambodia: "Cambodian",
  laos: "Lao",

  // Ближний Восток
  saudi_arabia: "Saudi",
  uae: "Emirati",
  qatar: "Qatari",
  kuwait: "Kuwaiti",
  bahrain: "Bahraini",
  oman: "Omani",
  jordan: "Jordanian",
  lebanon: "Lebanese",
  israel: "Israeli",
  turkey: "Turkish",
  iran: "Iranian",
  iraq: "Iraqi",

  // Европа
  russia: "Russian",
  ukraine: "Ukrainian",
  poland: "Polish",
  germany: "German",
  france: "French",
  spain: "Spanish",
  italy: "Italian",
  greece: "Greek",
  portugal: "Portuguese",
  netherlands: "Dutch",
  belgium: "Belgian",
  switzerland: "Swiss",
  austria: "Austrian",
  sweden: "Swedish",
  norway: "Norwegian",
  denmark: "Danish",
  finland: "Finnish",
  uk: "British",
  ireland: "Irish",

  // Америка
  usa: "American",
  canada: "Canadian",
  mexico: "Mexican",
  brazil: "Brazilian",
  argentina: "Argentine",
  chile: "Chilean",
  colombia: "Colombian",
  peru: "Peruvian",
  venezuela: "Venezuelan",

  // Африка
  egypt: "Egyptian",
  south_africa: "South African",
  nigeria: "Nigerian",
  kenya: "Kenyan",
  morocco: "Moroccan",
  algeria: "Algerian",
  ethiopia: "Ethiopian",

  // Океания
  australia: "Australian",
  new_zealand: "New Zealand",
};

/**
 * Преобразует название страны в нормализованный ключ для словаря
 */
const normalizeCountryName = (country: string): string => {
  return country
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z_]/g, "");
};

/**
 * Получает прилагательное для страны
 */
export const getCountryAdjective = (country: string): string => {
  if (!country) {
    return "Bangladeshi"; // Дефолтное значение
  }

  const normalized = normalizeCountryName(country);
  return COUNTRY_ADJECTIVES[normalized] || country;
};

/**
 * Получает название страны (для плейсхолдера {COUNTRY})
 */
export const getCountryName = (country: string): string => {
  if (!country) {
    return "Bangladesh"; // Дефолтное значение
  }
  return country;
};

/**
 * Карта стран к популярным видам спорта для betting страниц
 */
export const COUNTRY_SPORTS: Record<string, string> = {
  // Азия - крикет популярен
  bangladesh: "cricket",
  india: "cricket",
  pakistan: "cricket",
  sri_lanka: "cricket",
  nepal: "cricket",
  afghanistan: "cricket",
  
  // Китай, Япония, Корея - футбол и другие
  china: "football",
  japan: "baseball",
  korea: "football",
  
  // Юго-Восточная Азия - футбол
  thailand: "football",
  vietnam: "football",
  philippines: "basketball",
  indonesia: "football",
  malaysia: "football",
  singapore: "football",
  myanmar: "football",
  cambodia: "football",
  laos: "football",
  
  // Ближний Восток - футбол
  saudi_arabia: "football",
  uae: "football",
  qatar: "football",
  kuwait: "football",
  bahrain: "football",
  oman: "football",
  jordan: "football",
  lebanon: "football",
  israel: "football",
  turkey: "football",
  iran: "football",
  iraq: "football",
  
  // Европа - футбол
  russia: "football",
  ukraine: "football",
  poland: "football",
  germany: "football",
  france: "football",
  spain: "football",
  italy: "football",
  greece: "football",
  portugal: "football",
  netherlands: "football",
  belgium: "football",
  switzerland: "football",
  austria: "football",
  sweden: "football",
  norway: "football",
  denmark: "football",
  finland: "ice hockey",
  uk: "football",
  ireland: "football",
  
  // Америка
  usa: "american football",
  canada: "ice hockey",
  mexico: "football",
  brazil: "football",
  argentina: "football",
  chile: "football",
  colombia: "football",
  peru: "football",
  venezuela: "football",
  
  // Африка - футбол
  egypt: "football",
  south_africa: "cricket",
  nigeria: "football",
  kenya: "football",
  morocco: "football",
  algeria: "football",
  ethiopia: "football",
  
  // Океания
  australia: "cricket",
  new_zealand: "rugby",
};

/**
 * Получает популярный вид спорта для страны
 */
export const getCountrySport = (country: string): string => {
  if (!country) {
    return "cricket"; // Дефолтное значение
  }

  const normalized = normalizeCountryName(country);
  return COUNTRY_SPORTS[normalized] || "football"; // Дефолт - футбол
};

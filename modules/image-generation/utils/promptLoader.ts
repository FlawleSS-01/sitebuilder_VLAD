import fs from "fs";
import path from "path";
import {
  getCountryAdjective,
  getCountryName,
  getCountrySport,
} from "./countryMapper.js";

/**
 * Маппинг типов страниц на файлы с промтами
 */
const PROMPT_FILE_MAP: Record<string, string> = {
  homepage: "main.json",
  casino: "casino.json",
  slots: "slots.json",
  games: "games.json",
  betting: "betting.json",
  app: "app.json",
  login: "login.json",
};

/**
 * Заменяет плейсхолдеры в промте на значения из настроек проекта
 */
const replacePlaceholders = (
  prompt: string,
  country?: string,
  pageType?: string
): string => {
  if (!country) {
    // Если страна не указана, используем дефолтные значения
    let result = prompt
      .replace(/{COUNTRY_ADJECTIVE}/g, "Bangladeshi")
      .replace(/{COUNTRY}/g, "Bangladesh");

    // Для betting страниц заменяем спорт на дефолтный
    if (pageType === "betting") {
      result = result.replace(/{SPORT}/g, "cricket");
    }

    return result;
  }

  const countryAdjective = getCountryAdjective(country);
  const countryName = getCountryName(country);

  let result = prompt
    .replace(/{COUNTRY_ADJECTIVE}/g, countryAdjective)
    .replace(/{COUNTRY}/g, countryName);

  // Для betting страниц заменяем спорт на основе страны
  if (pageType === "betting") {
    const sport = getCountrySport(country);
    result = result.replace(/{SPORT}/g, sport);
  }

  return result;
};

/**
 * Загружает промты для указанного типа страницы с учетом гео
 */
export const loadPromptsForPage = (
  pageType: string,
  country?: string
): string[] => {
  const fileName = PROMPT_FILE_MAP[pageType];

  // Если country === "NO COUNTRY", используем промты из папки no-geo
  const useNoGeo = country === "NO COUNTRY";

  if (!fileName) {
    // Для кастомных страниц используем промты из main.json
    return loadPromptsFromFile("main.json", country, pageType, useNoGeo);
  }

  return loadPromptsFromFile(fileName, country, pageType, useNoGeo);
};

/**
 * Загружает промты из JSON файла и заменяет плейсхолдеры
 */
const loadPromptsFromFile = (
  fileName: string,
  country?: string,
  pageType?: string,
  useNoGeo: boolean = false
): string[] => {
  try {
    // Путь к файлам с промтами (в папке проекта site-builder/modules/image-generation/prompts)
    const promptsDir = path.join(
      process.cwd(),
      "modules",
      "image-generation",
      "prompts"
    );
    
    // Если useNoGeo === true, используем папку no-geo
    const baseDir = useNoGeo ? path.join(promptsDir, "no-geo") : promptsDir;
    const filePath = path.join(baseDir, fileName);

    if (!fs.existsSync(filePath)) {
      console.warn(`[image-generation] Файл с промтами не найден: ${filePath}`);
      // Fallback на main.json
      if (fileName !== "main.json") {
        return loadPromptsFromFile("main.json", country, pageType, useNoGeo);
      }
      return [];
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const prompts = JSON.parse(fileContent) as string[];

    if (!Array.isArray(prompts) || prompts.length === 0) {
      console.warn(
        `[image-generation] Файл с промтами пуст или неверный формат: ${filePath}`
      );
      return [];
    }

    // Заменяем плейсхолдеры в каждом промте
    return prompts.map((prompt) =>
      replacePlaceholders(prompt, country, pageType)
    );
  } catch (error: any) {
    console.error(
      `[image-generation] Ошибка при загрузке промтов из ${fileName}:`,
      error
    );
    return [];
  }
};

/**
 * Выбирает случайный промт из массива
 */
export const getRandomPrompt = (prompts: string[]): string => {
  if (prompts.length === 0) {
    return "Beautiful casino scene with neon lights, glamorous atmosphere, cinematic lighting, digital art";
  }
  const randomIndex = Math.floor(Math.random() * prompts.length);
  return prompts[randomIndex];
};

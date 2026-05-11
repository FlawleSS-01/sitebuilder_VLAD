import OpenAI from "openai";
import { modelSupportsCustomTemperature } from "../../shared/openaiModel.js";

/**
 * Генерирует ALT и TITLE для изображения через OpenAI API
 */
export const generateAltTitle = async (
  imagePrompt: string,
  language: string,
  country: string,
  brand: string,
  pageType: string
): Promise<{ alt: string; title: string } | null> => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn(
        "[image-generation] OpenAI API key не настроен, пропускаем генерацию alt/title"
      );
      return null;
    }

    // Если country === "NO COUNTRY", используем специальную модель
    const model = country === "NO COUNTRY" 
      ? (process.env.OPENAI_MODEL_ALTTITLE_NO_GEO || process.env.OPENAI_MODEL_ALTTITLE || "gpt-5")
      : (process.env.OPENAI_MODEL_ALTTITLE || "gpt-5");

    // Создаем клиент OpenAI
    const openai = new OpenAI({
      apiKey: apiKey.trim(),
    });

    // Формируем промты согласно примеру
    const systemPrompt =
      "You generate SEO-optimized ALT and TITLE attributes for casino website images. Always respond in valid JSON with keys alt and title.";

    const userPrompt = `Image prompt: ${imagePrompt}\nLanguage: ${language}\nGeo: ${country}\nBrand: ${brand}\nPage: ${pageType}`;

    console.log(
      `[image-generation] Генерация alt/title для изображения (модель: ${model})`
    );

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(modelSupportsCustomTemperature(model) ? { temperature: 0.7 } : {}),
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content;
    if (!responseText) {
      console.warn(
        "[image-generation] Пустой ответ от OpenAI при генерации alt/title"
      );
      return null;
    }

    // Парсим JSON ответ
    try {
      const parsed = JSON.parse(responseText);
      if (parsed.alt && parsed.title) {
        // Не обрезаем результат, используем как есть
        return { alt: parsed.alt, title: parsed.title };
      } else {
        console.warn(
          "[image-generation] Неверный формат ответа от OpenAI для alt/title:",
          parsed
        );
        return null;
      }
    } catch (parseError) {
      console.error(
        "[image-generation] Ошибка парсинга JSON для alt/title:",
        parseError
      );
      return null;
    }
  } catch (error: any) {
    console.error(
      "[image-generation] Ошибка при генерации alt/title:",
      error.message || error
    );
    // Не прерываем процесс генерации картинок из-за ошибки alt/title
    return null;
  }
};

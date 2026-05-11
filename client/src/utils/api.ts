/**
 * Безопасный парсинг JSON из fetch Response.
 * Обрабатывает случай, когда сервер возвращает HTML вместо JSON
 * (например, 404 страница, ошибка прокси, SPA fallback).
 */
export async function parseResponseJson(response: Response): Promise<any> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  // Сервер вернул HTML вместо JSON — типично при 404, ошибке прокси или неправильной настройке
  if (
    text.trim().startsWith("<") ||
    text.includes("<!DOCTYPE") ||
    (!contentType.includes("json") && text.includes("<html"))
  ) {
    throw new Error(
      `Сервер вернул HTML вместо JSON (статус: ${response.status}). ` +
        `Возможно API недоступен или прокси настроен неправильно. ` +
        `Проверьте: 1) Запущен ли бэкенд (npm run dev или pm2); ` +
        `2) Правильно ли указан VITE_API_URL в .env`
    );
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(
      `Ошибка парсинга ответа сервера: ${text.substring(0, 150)}...`
    );
  }
}

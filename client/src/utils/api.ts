/** Базовый URL API из VITE_API_URL (пусто = относительные пути, Vite проксирует /api). */
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
}

export function buildApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
}

/**
 * fetch + безопасный JSON. При HTML вместо JSON — понятная ошибка (прокси, бэкенд не запущен).
 */
export async function fetchJson(
  path: string,
  init?: RequestInit
): Promise<{ response: Response; data: any }> {
  const response = await fetch(buildApiUrl(path), init);
  const data = await parseResponseJson(response);
  return { response, data };
}

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

export const AUTO_ERRORS = {
  missingServer: "Не указан сервер для деплоя (хост, пользователь, пароль).",
  missingDomain: "Не указан домен проекта.",
  missingAffiliate: "Не указана партнёрская ссылка.",
  missingOpenAiKey: "OpenAI API key не настроен.",
  missingRunwareKey:
    "Runware API key не настроен. Укажите RUNWARE_API_KEY или IMAGE_PROVIDER=placeholder.",
  pageTextFailed: (page: string, locale: string, detail?: string) =>
    `Ошибка генерации текста: страница «${page}» (${locale})${detail ? `: ${detail}` : ""}.`,
  pageImageFailed: (page: string, detail?: string) =>
    `Ошибка генерации изображений: страница «${page}»${detail ? `: ${detail}` : ""}.`,
  faviconFailed: (detail?: string) =>
    `Ошибка генерации favicon${detail ? `: ${detail}` : ""}.`,
  logoFailed: (detail?: string) =>
    `Ошибка генерации логотипа${detail ? `: ${detail}` : ""}.`,
  buildFailed: (detail?: string) =>
    `Ошибка сборки build${detail ? `: ${detail}` : ""}.`,
  archiveFailed: (detail?: string) =>
    `Ошибка создания archive${detail ? `: ${detail}` : ""}.`,
  uploadFailed: (detail?: string) =>
    `Ошибка загрузки на сервер${detail ? `: ${detail}` : ""}.`,
  qcFailed: (detail: string) => `Проверка качества не пройдена: ${detail}.`,
  alreadyRunning: "Автогенерация уже выполняется для этого проекта.",
  projectNotFound: "Проект не найден.",
} as const;

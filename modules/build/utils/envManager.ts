import fs from "fs";
import path from "path";

interface ProjectEnvVars {
  affiliateLink: string;
  brand: string;
  domain: string;
  app?: string;
  button1Text?: string;
  button2Text?: string;
}

/**
 * Получает путь к .env файлу в проекте
 */
const getEnvPath = (projectPath: string): string => {
  return path.join(projectPath, ".env");
};

/**
 * Создает или обновляет .env файл в проекте
 */
export const updateProjectEnv = (
  projectPath: string,
  vars: ProjectEnvVars
): void => {
  const envPath = getEnvPath(projectPath);
  const existingVars = readProjectEnv(projectPath);

  // Формируем значения переменных
  const brand = vars.brand || "";
  const brandUpper = brand.toUpperCase();
  const siteUrl = vars.domain ? `https://${vars.domain}` : "";
  const appValue = vars.app ?? existingVars.VITE_APP ?? "/go";

  // Формируем содержимое .env файла
  const button1Text = vars.button1Text || `Join ${brandUpper} Now`;
  const button2Text = vars.button2Text || "Download APK";
  
  const envContent = `VITE_AFFILIATE_URL=${vars.affiliateLink || ""}
VITE_APP=${appValue}
VITE_SITE_NAME=${brandUpper}
VITE_SITE_URL=${siteUrl}
VITE_SITE_LINK=${siteUrl}
VITE_BUTTON1_TEXT=${button1Text}
VITE_BUTTON2_TEXT=${button2Text}
`;

  // Записываем файл
  fs.writeFileSync(envPath, envContent, "utf-8");

  console.log(`[build] Обновлен .env файл в проекте`);
};

/**
 * Читает .env файл из проекта (если существует)
 */
export const readProjectEnv = (projectPath: string): Record<string, string> => {
  const envPath = getEnvPath(projectPath);

  if (!fs.existsSync(envPath)) {
    return {};
  }

  const content = fs.readFileSync(envPath, "utf-8");
  const vars: Record<string, string> = {};

  // Парсим .env файл построчно
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue; // Пропускаем пустые строки и комментарии
    }

    const equalIndex = trimmedLine.indexOf("=");
    if (equalIndex === -1) {
      continue; // Пропускаем строки без знака равенства
    }

    const key = trimmedLine.substring(0, equalIndex).trim();
    const value = trimmedLine.substring(equalIndex + 1).trim();
    vars[key] = value;
  }

  return vars;
};

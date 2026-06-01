import {
  getProjectPath,
  getProjectSettings,
  savePagesToProject,
  saveFAQToProject,
  saveProjectSettings,
} from "../build/utils/projectManager.js";
import { generatePagesData } from "../build/utils/pagesDataGenerator.js";

/**
 * Persists localized or single-locale pages + FAQ like POST /api/build/save-pages.
 */
export function persistGeneratedPages(input: {
  projectName: string;
  localizedPages?: Record<string, Record<string, unknown>>;
  pages?: Record<string, unknown>;
  pagesInfo: Record<string, unknown>;
  faq?: Record<string, unknown>;
}): Record<string, string> {
  const projectPath = getProjectPath(input.projectName);
  const currentSettings = getProjectSettings(input.projectName);
  if (!currentSettings) {
    throw new Error("Project settings not found");
  }

  const defaultLocale =
    currentSettings.defaultLocale || currentSettings.locales?.[0] || "en";
  const projectLocales =
    currentSettings.locales?.length > 0
      ? currentSettings.locales
      : [defaultLocale];

  let filePaths: Record<string, string> = {};

  if (
    input.localizedPages &&
    typeof input.localizedPages === "object" &&
    Object.keys(input.localizedPages).length > 0
  ) {
    const mergedPagesInfo = input.pagesInfo;
    const localeFileAccumulator: Record<string, Record<string, string>> = {};

    for (const [locale, pagesObj] of Object.entries(input.localizedPages)) {
      if (!pagesObj || typeof pagesObj !== "object") continue;
      const fps = savePagesToProject(
        projectPath,
        pagesObj as Record<string, unknown>,
        mergedPagesInfo as Record<string, unknown>,
        { locale, defaultLocale, projectLocales }
      );
      for (const [pageType, relPath] of Object.entries(fps)) {
        filePaths[`${pageType}@${locale}`] = relPath;
        if (!localeFileAccumulator[pageType]) {
          localeFileAccumulator[pageType] = {};
        }
        localeFileAccumulator[pageType][locale] = relPath;
      }
    }

    if (input.faq && typeof input.faq === "object") {
      saveFAQToProject(projectPath, input.faq);
    }

    const existingPages = currentSettings.pages || {};
    const updatedPages: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(existingPages)) {
      updatedPages[key] = { ...(value as Record<string, unknown>) };
    }

    const touched = new Set([
      ...Object.keys(mergedPagesInfo),
      ...Object.keys(localeFileAccumulator),
    ]);

    for (const pageType of touched) {
      const incoming = (mergedPagesInfo as Record<string, unknown>)[pageType] as
        | Record<string, unknown>
        | undefined;
      const prev = (updatedPages[pageType] as Record<string, unknown>) || {};
      const locFiles = {
        ...((prev.localeFiles as Record<string, string>) || {}),
        ...(localeFileAccumulator[pageType] || {}),
      };
      const generatedLocales = {
        ...((prev.generatedLocales as Record<string, boolean>) || {}),
      };
      for (const loc of Object.keys(localeFileAccumulator[pageType] || {})) {
        generatedLocales[loc] = true;
      }
      const defaultPath =
        locFiles[defaultLocale] ||
        locFiles[projectLocales[0]] ||
        (prev.filePath as string | undefined);

      updatedPages[pageType] = {
        ...prev,
        ...incoming,
        generated: true,
        localeFiles: locFiles,
        generatedLocales,
        ...(defaultPath ? { filePath: defaultPath } : {}),
      };
    }

    saveProjectSettings(projectPath, {
      ...currentSettings,
      pages: updatedPages as Parameters<typeof saveProjectSettings>[1]["pages"],
    });
  } else if (input.pages && typeof input.pages === "object") {
    filePaths = savePagesToProject(
      projectPath,
      input.pages as Record<string, unknown>,
      input.pagesInfo as Record<string, unknown>
    );

    if (input.faq && typeof input.faq === "object") {
      saveFAQToProject(projectPath, input.faq);
    }

    const existingPages = currentSettings.pages || {};
    const updatedPages: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(existingPages)) {
      updatedPages[key] = { ...(value as Record<string, unknown>) };
    }
    for (const [key, value] of Object.entries(input.pagesInfo)) {
      updatedPages[key] = {
        ...((updatedPages[key] as Record<string, unknown>) || {}),
        ...(value as Record<string, unknown>),
        ...(filePaths[key] ? { filePath: filePaths[key] } : {}),
      };
    }
    saveProjectSettings(projectPath, {
      ...currentSettings,
      pages: updatedPages as Parameters<typeof saveProjectSettings>[1]["pages"],
    });
  }

  generatePagesData(projectPath);
  return filePaths;
}

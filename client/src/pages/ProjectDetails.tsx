import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { parseResponseJson } from "../utils/api";
import GeneratePagesModal from "../components/GeneratePagesModal";
import RegeneratePageModal from "../components/RegeneratePageModal";
import CustomPageModal from "../components/CustomPageModal";
import ImagePresetsModal from "../components/ImagePresetsModal";
import CustomPromptModal from "../components/CustomPromptModal";
import ImageModal from "../components/ImageModal";
import EditPageModal from "../components/EditPageModal";
import FaviconModal from "../components/FaviconModal";
import ThemeModal from "../components/ThemeModal";
import "./ProjectDetails.css";

const API_URL = import.meta.env.VITE_API_URL || "";
const MAX_APK_SIZE_BYTES = 20 * 1024 * 1024;

interface ProjectSettings {
  brand: string;
  language: string;
  htmlLang?: string;
  geoCode?: string | null;
  geoLabel?: string | null;
  primaryLanguage?: string;
  secondaryLanguages?: string[];
  locales?: string[];
  defaultLocale?: string;
  languageCount?: number;
  languagePresetSource?: string;
  previewApproved?: boolean;
  previewViewedAt?: string | null;
  alwaysOpenPreviewAfterGeneration?: boolean;
  askBeforeBuild?: boolean;
  country: string;
  domain: string;
  affiliateLink: string;
  projectName: string;
  createdAt: string;
  app?: {
    hasApp: boolean;
    fileName?: string | null;
    link?: string | null;
  };
  googleHtml?: {
    accountName: string;
    fileNames?: string[];
    /** legacy */
    fileName?: string;
  };
  heroButtons?: {
    button1Text?: string;
    button2Text?: string;
  };
  pages?: Record<
    string,
    {
      pageType: string;
      blocks: string[];
      generated: boolean;
      pageName?: string;
      isCustom?: boolean;
      blockTemplates?: Record<string, string>; // Шаблоны для блоков
      filePath?: string; // Путь к JSON файлу страницы
      localeFiles?: Record<string, string>;
      generatedLocales?: Record<string, boolean>;
      images?: Array<{
        name: string;
        url: string;
        path: string;
        prompt?: string | null;
        alt?: string;
        title?: string;
      }>;
      imagesGenerated?: boolean;
    }
  >;
  imagePresets?: Array<{
    id: string;
    name: string;
    sizes: { image1: string; image2: string; image3: string };
  }>;
}

type PageType =
  | "homepage"
  | "casino"
  | "slots"
  | "games"
  | "betting"
  | "app"
  | "login";

const PAGE_NAMES: Record<string, string> = {
  homepage: "Main",
  casino: "Casino",
  slots: "Slots",
  games: "Games",
  betting: "Bets",
  app: "App",
  login: "Login",
};

// Стандартные страницы, которые должны отображаться всегда
const STANDARD_PAGES: PageType[] = [
  "homepage",
  "casino",
  "slots",
  "games",
  "betting",
  "app",
  "login",
];

const ProjectDetails: React.FC = () => {
  const { projectName } = useParams<{ projectName: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<ProjectSettings>>({});
  const [showRegenerateWarning, setShowRegenerateWarning] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showCustomPageModal, setShowCustomPageModal] = useState(false);
  const [showImagePresetsModal, setShowImagePresetsModal] = useState(false);
  const [showFaviconModal, setShowFaviconModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [regeneratePageType, setRegeneratePageType] = useState<string | null>(
    null
  );
  const [generatingImages, setGeneratingImages] = useState<string | null>(null);
  const [generatingAllImages, setGeneratingAllImages] = useState(false);
  const [customPromptImage, setCustomPromptImage] = useState<{
    pageType: string;
    pageInfo: any;
    imageIndex: number;
  } | null>(null);
  const [selectedImage, setSelectedImage] = useState<{
    image: any;
    pageType: string;
    pageInfo: any;
    imageIndex: number;
  } | null>(null);
  const [editPageType, setEditPageType] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [imageVersion, setImageVersion] = useState<number>(Date.now());
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [previewRunning, setPreviewRunning] = useState(false);
  const [previewInfo, setPreviewInfo] = useState<{
    projectName: string;
    url: string;
    port: number;
  } | null>(null);
  const [dependenciesInstalled, setDependenciesInstalled] = useState(false);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [startingPreview, setStartingPreview] = useState(false);
  const [stoppingPreview, setStoppingPreview] = useState(false);
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [uploadingApp, setUploadingApp] = useState(false);
  const [removingApp, setRemovingApp] = useState(false);
  const [appLinkInput, setAppLinkInput] = useState("");
  const [googleAccounts, setGoogleAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [uploadingHtml, setUploadingHtml] = useState(false);
  const [generatingLogo, setGeneratingLogo] = useState(false);
  const [button1Text, setButton1Text] = useState<string>("");
  const [button2Text, setButton2Text] = useState<string>("");
  const [savingButtons, setSavingButtons] = useState(false);
  const [htmlLangInput, setHtmlLangInput] = useState<string>("en");
  const [savingHtmlLang, setSavingHtmlLang] = useState(false);
  const projectRef = useRef<ProjectSettings | null>(null);
  projectRef.current = project;

  useEffect(() => {
    if (projectName) {
      loadProject();
      loadPreviewStatus();
      loadGoogleAccounts();
    }
  }, [projectName]);

  // Периодически проверяем статус превью
  useEffect(() => {
    if (!projectName) return;

    const interval = setInterval(() => {
      loadPreviewStatus();
    }, 3000); // Проверяем каждые 3 секунды

    return () => clearInterval(interval);
  }, [projectName]);

  const loadProject = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить проект");
      }

      const updatedProject = data.project;
      setProject(updatedProject);
      setAppLinkInput(updatedProject.app?.link || "");
      setHtmlLangInput(updatedProject.htmlLang || "en");
      setButton1Text(updatedProject.heroButtons?.button1Text || "");
      setButton2Text(updatedProject.heroButtons?.button2Text || "");
      setEditData({
        brand: updatedProject.brand,
        language: updatedProject.language,
        country: updatedProject.country,
        domain: updatedProject.domain,
        affiliateLink: updatedProject.affiliateLink,
      });

      if (projectName) {
        setLogoUrl(
          `/projects/${projectName}/public/images/logo.webp?t=${Date.now()}`
        );
      }

      // Обновляем выбранное изображение в модальном окне если оно открыто
      if (selectedImage) {
        const updatedPageInfo = updatedProject.pages?.[selectedImage.pageType];
        if (updatedPageInfo?.images?.[selectedImage.imageIndex]) {
          const updatedImage = updatedPageInfo.images[selectedImage.imageIndex];
          // Добавляем timestamp к URL чтобы браузер перезагрузил изображение
          const imageWithTimestamp = {
            ...updatedImage,
            url: `${updatedImage.url}?t=${Date.now()}`,
          };
          setSelectedImage({
            ...selectedImage,
            image: imageWithTimestamp,
            pageInfo: updatedPageInfo,
          });
        }
      }
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при загрузке проекта");
      console.error("Error loading project:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadPreviewStatus = async () => {
    if (!projectName) return;

    try {
      const response = await fetch(
        `${API_URL}/api/preview/status/${projectName}`
      );
      if (response.ok) {
        const data = await response.json();
        setPreviewRunning(data.running);
        setDependenciesInstalled(data.dependenciesInstalled || false);
        if (data.info) {
          setPreviewInfo({
            projectName: data.info.projectName,
            url: data.info.url,
            port: data.info.port,
          });
        } else {
          setPreviewInfo(null);
        }
      }
    } catch (err) {
      console.error("Error loading preview status:", err);
    }
  };

  const handleStartPreview = async () => {
    if (!projectName) return;

    try {
      setStartingPreview(true);
      setError(null);

      const response = await fetch(
        `${API_URL}/api/preview/start/${projectName}`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось запустить проект");
      }

      if (data.info) {
        setPreviewRunning(true);
        setPreviewInfo({
          projectName: data.info.projectName,
          url: data.info.url,
          port: data.info.port,
        });
      }

      await fetch(
        `${API_URL}/api/build/project/${projectName}/preview-workflow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "viewed" }),
        }
      );
      await loadProject();

      await loadPreviewStatus();

      const previewUrl = data.info?.url as string | undefined;
      if (
        previewUrl &&
        projectRef.current?.alwaysOpenPreviewAfterGeneration === true
      ) {
        window.open(previewUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при запуске проекта");
      console.error("Error starting preview:", err);
    } finally {
      setStartingPreview(false);
    }
  };

  const copyTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        /* ignore */
      }
    }
  };

  const handleStopPreview = async () => {
    try {
      setStoppingPreview(true);
      setError(null);

      const response = await fetch(`${API_URL}/api/preview/stop`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось остановить проект");
      }

      await loadPreviewStatus();
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при остановке проекта");
      console.error("Error stopping preview:", err);
    } finally {
      setStoppingPreview(false);
    }
  };

  const handleApprovePreview = async () => {
    if (!projectName) return;
    try {
      const r = await fetch(
        `${API_URL}/api/build/project/${projectName}/preview-workflow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approved" }),
        }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      await loadProject();
    } catch (e: any) {
      setError(e.message || "Не удалось подтвердить preview");
    }
  };

  const handleResetPreviewApproval = async () => {
    if (!projectName) return;
    try {
      const r = await fetch(
        `${API_URL}/api/build/project/${projectName}/preview-workflow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset" }),
        }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      await loadProject();
    } catch (e: any) {
      setError(e.message || "Ошибка сброса статуса preview");
    }
  };

  const saveWorkflowSettings = async (
    patch: Partial<{
      alwaysOpenPreviewAfterGeneration: boolean;
      askBeforeBuild: boolean;
    }>
  ) => {
    if (!projectName) return;
    setSavingWorkflow(true);
    try {
      const r = await fetch(
        `${API_URL}/api/build/project/${projectName}/workflow-settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка сохранения");
      await loadProject();
    } catch (e: any) {
      setError(e.message || "Не удалось сохранить настройки");
    } finally {
      setSavingWorkflow(false);
    }
  };

  const runPreviewAndReturnUrl = async (): Promise<string | undefined> => {
    if (!projectName) return undefined;
    const r = await fetch(`${API_URL}/api/preview/start/${projectName}`, {
      method: "POST",
    });
    const d = await r.json();
    if (!r.ok) return undefined;
    await fetch(
      `${API_URL}/api/build/project/${projectName}/preview-workflow`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "viewed" }),
      }
    );
    await loadProject();
    await loadPreviewStatus();
    return d.info?.url;
  };

  const confirmAndDownload = (url: string, label: string) => {
    if (!project) return;
    if (project.askBeforeBuild !== false) {
      if (
        !window.confirm(
          `Скачать ${label}? Продолжить сборку архива.`
        )
      ) {
        return;
      }
    }
    if (!project.previewApproved) {
      if (
        !window.confirm(
          "Preview ещё не подтверждён (Approved). Продолжить скачивание?"
        )
      ) {
        return;
      }
    }
    window.location.href = url;
  };

  const previewStatusLabel = (): string => {
    if (!project) return "—";
    if (project.previewApproved) return "Approved";
    if (project.previewViewedAt) return "Viewed";
    return "Not viewed";
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setShowRegenerateWarning(false);
    if (project) {
      setEditData({
        brand: project.brand,
        language: project.language,
        country: project.country,
        domain: project.domain,
        affiliateLink: project.affiliateLink,
      });
    }
  };

  const checkForGeneratedPages = (): boolean => {
    if (!project || !project.pages) {
      return false;
    }
    return Object.values(project.pages).some(
      (pageInfo) => pageInfo.generated === true
    );
  };

  const handleSave = async () => {
    if (!projectName) return;

    // Валидация
    if (
      !editData.brand ||
      !editData.language ||
      !editData.country ||
      !editData.domain ||
      !editData.affiliateLink
    ) {
      setError("Все поля обязательны для заполнения");
      return;
    }

    if (
      editData.domain?.includes("http://") ||
      editData.domain?.includes("https://")
    ) {
      setError("Домен должен быть без https://");
      return;
    }

    if (!editData.affiliateLink?.startsWith("https://")) {
      setError("Ссылка на партнерку должна начинаться с https://");
      return;
    }

    // Проверяем наличие сгенерированных страниц
    const hasGeneratedPages = checkForGeneratedPages();
    if (hasGeneratedPages && !showRegenerateWarning) {
      setShowRegenerateWarning(true);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setShowRegenerateWarning(false);
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            brand: editData.brand,
            language: editData.language,
            country: editData.country,
            domain: editData.domain,
            affiliateLink: editData.affiliateLink,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось обновить проект");
      }

      setProject(data.project);
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при обновлении проекта");
      console.error("Error updating project:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyHtmlLang = async () => {
    if (!projectName) return;

    const lang = htmlLangInput.trim();
    if (!lang) {
      setError("Укажите код языка (например: en, ru, de)");
      return;
    }

    try {
      setSavingHtmlLang(true);
      setError(null);
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/html-lang`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ lang }),
        }
      );

      const data = await parseResponseJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Не удалось обновить lang");
      }

      setProject(data.project);
      setHtmlLangInput(lang);
    } catch (err: any) {
      setError(err.message || "Ошибка при обновлении lang");
      console.error("Error updating html-lang:", err);
    } finally {
      setSavingHtmlLang(false);
    }
  };

  const handleCancelWarning = () => {
    setShowRegenerateWarning(false);
  };

  const handleInputChange = (field: keyof ProjectSettings, value: string) => {
    setEditData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleApkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setApkFile(file);
  };

  const handleUploadApp = async () => {
    if (!projectName || !apkFile) return;

    if (!apkFile.name.toLowerCase().endsWith(".apk")) {
      alert("Можно загрузить только .apk файл");
      return;
    }
    if (apkFile.size > MAX_APK_SIZE_BYTES) {
      alert("Размер APK не должен превышать 20MB");
      return;
    }

    const formData = new FormData();
    formData.append("apk", apkFile);

    try {
      setUploadingApp(true);
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/app`,
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить приложение");
      }

      setApkFile(null);
      await loadProject();
    } catch (err: any) {
      alert(err.message || "Произошла ошибка при загрузке приложения");
    } finally {
      setUploadingApp(false);
    }
  };

  const handleRemoveApp = async () => {
    if (!projectName) return;

    const formData = new FormData();
    formData.append("action", "remove");

    try {
      setRemovingApp(true);
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/app`,
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось удалить приложение");
      }

      setApkFile(null);
      await loadProject();
    } catch (err: any) {
      alert(err.message || "Произошла ошибка при удалении приложения");
    } finally {
      setRemovingApp(false);
    }
  };

  const handleSaveAppLink = async () => {
    if (!projectName) return;
    const link = appLinkInput.trim();

    if (!link) {
      alert("Введите ссылку на сайт");
      return;
    }
    if (!/^https?:\/\//i.test(link)) {
      alert("Ссылка должна начинаться с http:// или https://");
      return;
    }

    const formData = new FormData();
    formData.append("action", "link");
    formData.append("link", link);

    try {
      setUploadingApp(true);
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/app`,
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить ссылку");
      }

      await loadProject();
    } catch (err: any) {
      alert(err.message || "Произошла ошибка при сохранении ссылки");
    } finally {
      setUploadingApp(false);
    }
  };

  const loadGoogleAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const response = await fetch(`${API_URL}/api/build/google-accounts`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить список аккаунтов");
      }

      setGoogleAccounts(data.accounts || []);
    } catch (err: any) {
      console.error("Error loading google accounts:", err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleUploadGoogleHtml = async () => {
    if (!projectName || !selectedAccount) {
      alert("Выберите аккаунт");
      return;
    }

    try {
      setUploadingHtml(true);
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/google-html`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountName: selectedAccount,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить HTML файл");
      }

      setSelectedAccount("");
      await loadProject();
      alert(data.message || "HTML файлы успешно загружены в public проекта");
    } catch (err: any) {
      alert(err.message || "Произошла ошибка при загрузке HTML файла");
    } finally {
      setUploadingHtml(false);
    }
  };

  const handleSaveHeroButtons = async () => {
    if (!projectName) return;

    try {
      setSavingButtons(true);
      const response = await fetch(
        `${API_URL}/api/build/project/${projectName}/hero-buttons`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            button1Text: button1Text.trim() || undefined,
            button2Text: button2Text.trim() || undefined,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить тексты кнопок");
      }

      await loadProject();
      alert("Тексты кнопок успешно сохранены");
    } catch (err: any) {
      alert(err.message || "Произошла ошибка при сохранении текстов кнопок");
    } finally {
      setSavingButtons(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("ru-RU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleGenerateImages = async (pageType: string, pageInfo: any) => {
    if (!projectName) return;

    setGeneratingImages(pageType);

    try {
      const response = await fetch(
        `${API_URL}/api/image-generation/generate-page-images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectName: projectName,
            pageType: pageType,
            pageName: pageInfo.pageName,
            isCustom: pageInfo.isCustom || false,
          }),
        }
      );

      const data = await parseResponseJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Ошибка при генерации картинок");
      }

      // Сохраняем информацию о картинках в проект
      const saveResponse = await fetch(`${API_URL}/api/build/save-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName: projectName,
          pageType: pageType,
          images: data.data.images,
        }),
      });

      const saveData = await parseResponseJson(saveResponse);

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить картинки");
      }

      // Обновляем версию изображений для cache-busting
      setImageVersion(Date.now());
      // Перезагружаем проект
      loadProject();
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при генерации картинок");
    } finally {
      setGeneratingImages(null);
    }
  };

  const handleRegenerateSingleImage = async (
    pageType: string,
    pageInfo: any,
    imageIndex: number,
    customPrompt?: string
  ) => {
    if (!projectName) return;

    const imageKey = `${pageType}-${imageIndex}`;
    setGeneratingImages(imageKey);

    try {
      const response = await fetch(
        `${API_URL}/api/image-generation/generate-single-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectName: projectName,
            pageType: pageType,
            pageName: pageInfo.pageName,
            isCustom: pageInfo.isCustom || false,
            imageIndex: imageIndex,
            existingImageName: pageInfo.images?.[imageIndex]?.name,
            customPrompt: customPrompt,
          }),
        }
      );

      const data = await parseResponseJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Ошибка при перегенерации картинки");
      }

      // Обновляем конкретную картинку в массиве
      const updatedImages = [...(pageInfo.images || [])];
      updatedImages[imageIndex] = data.data.image;

      // Сохраняем обновленный массив картинок
      const saveResponse = await fetch(`${API_URL}/api/build/save-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName: projectName,
          pageType: pageType,
          images: updatedImages,
        }),
      });

      const saveData = await parseResponseJson(saveResponse);

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить картинку");
      }

      // Обновляем выбранное изображение в модальном окне если оно открыто
      if (
        selectedImage &&
        selectedImage.pageType === pageType &&
        selectedImage.imageIndex === imageIndex
      ) {
        // Добавляем timestamp к URL чтобы браузер перезагрузил изображение
        const updatedImage = {
          ...data.data.image,
          url: `${data.data.image.url}?t=${Date.now()}`,
        };

        setSelectedImage({
          ...selectedImage,
          image: updatedImage,
          pageInfo: {
            ...pageInfo,
            images: updatedImages,
          },
        });
      }

      // Перезагружаем проект
      await loadProject();
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при перегенерации картинки");
    } finally {
      setGeneratingImages(null);
    }
  };

  const handleUploadImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    pageType: string,
    pageInfo: any,
    imageIndex: number
  ) => {
    if (!projectName || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("image", file);
    formData.append("projectName", projectName);
    formData.append("pageType", pageType);
    formData.append("imageIndex", imageIndex.toString());
    formData.append(
      "existingImageName",
      pageInfo.images?.[imageIndex]?.name || ""
    );

    try {
      const response = await fetch(
        `${API_URL}/api/image-generation/upload-image`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await parseResponseJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Ошибка при загрузке картинки");
      }

      // Обновляем конкретную картинку в массиве
      const updatedImages = [...(pageInfo.images || [])];
      updatedImages[imageIndex] = data.data.image;

      // Сохраняем обновленный массив картинок
      const saveResponse = await fetch(`${API_URL}/api/build/save-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName: projectName,
          pageType: pageType,
          images: updatedImages,
        }),
      });

      const saveData = await parseResponseJson(saveResponse);

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить картинку");
      }

      // Обновляем выбранное изображение в модальном окне если оно открыто
      if (
        selectedImage &&
        selectedImage.pageType === pageType &&
        selectedImage.imageIndex === imageIndex
      ) {
        // Добавляем timestamp к URL чтобы браузер перезагрузил изображение
        const updatedImage = {
          ...data.data.image,
          url: `${data.data.image.url}?t=${Date.now()}`,
        };

        setSelectedImage({
          ...selectedImage,
          image: updatedImage,
          pageInfo: {
            ...pageInfo,
            images: updatedImages,
          },
        });
      }

      // Обновляем версию изображений для cache-busting
      setImageVersion(Date.now());
      // Перезагружаем проект
      await loadProject();
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при загрузке картинки");
    }
  };

  const handleGenerateAllImages = async () => {
    if (!projectName || !project) return;

    setGeneratingAllImages(true);

    try {
      const response = await fetch(
        `${API_URL}/api/image-generation/generate-all-project-images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ projectName }),
        }
      );

      const data = await parseResponseJson(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Ошибка при массовой генерации картинок"
        );
      }

      const results = (data.data?.results || []) as Array<{
        pageType: string;
        success: boolean;
        error?: string;
      }>;
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0) {
        const failedPages = failed.map((r) => r.pageType).join(", ");
        alert(
          `Не удалось сгенерировать картинки для страниц: ${failedPages}. Проверьте консоль для деталей.`
        );
      } else {
        alert("Картинки успешно сгенерированы для всех страниц!");
      }

      setImageVersion(Date.now());
      await loadProject();
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при генерации картинок");
    } finally {
      setGeneratingAllImages(false);
    }
  };

  const handleRegenerateAltTitle = async (
    pageType: string,
    pageInfo: any,
    imageIndex: number
  ) => {
    if (!projectName || !project) return;

    const image = pageInfo.images?.[imageIndex];
    if (!image || !image.prompt) {
      alert("Нет промта для генерации alt/title");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/image-generation/regenerate-alt-title`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectName: projectName,
            pageType: pageType,
            imagePrompt: image.prompt,
            language: project.language,
            country: project.country,
            brand: project.brand,
            imageName: image.name,
          }),
        }
      );

      const data = await parseResponseJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Ошибка при перегенерации alt/title");
      }

      // Обновляем alt/title для конкретной картинки
      const updatedImages = [...(pageInfo.images || [])];
      updatedImages[imageIndex] = {
        ...updatedImages[imageIndex],
        alt: data.data.alt,
        title: data.data.title,
      };

      // Сохраняем обновленный массив картинок
      const saveResponse = await fetch(`${API_URL}/api/build/save-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName: projectName,
          pageType: pageType,
          images: updatedImages,
        }),
      });

      const saveData = await parseResponseJson(saveResponse);

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить alt/title");
      }

      // Перезагружаем проект
      await loadProject();

      // Обновляем выбранное изображение в модальном окне
      if (
        selectedImage &&
        selectedImage.pageType === pageType &&
        selectedImage.imageIndex === imageIndex
      ) {
        setSelectedImage({
          ...selectedImage,
          image: updatedImages[imageIndex],
        });
      }
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при перегенерации alt/title");
      throw err;
    }
  };

  const handleGenerateLogo = async () => {
    if (!projectName) return;
    setGeneratingLogo(true);
    try {
      const response = await fetch(
        `${API_URL}/api/image-generation/generate-logo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectName }),
        }
      );
      const data = await parseResponseJson(response);
      if (!response.ok) {
        throw new Error(data.error || data.message || "Не удалось сгенерировать логотип");
      }
      setImageVersion(Date.now());
      setLogoUrl(`${data.data.logo.url}?t=${Date.now()}`);
      alert("Логотип сгенерирован и сохранён как logo.webp");
      await loadProject();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Ошибка генерации логотипа");
    } finally {
      setGeneratingLogo(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!projectName || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("logo", file);
    formData.append("projectName", projectName);

    setUploadingLogo(true);

    try {
      const response = await fetch(
        `${API_URL}/api/image-generation/upload-logo`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await parseResponseJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Ошибка при загрузке логотипа");
      }

      // Обновляем версию изображений для cache-busting
      setImageVersion(Date.now());
      // Обновляем URL логотипа с timestamp для обновления кеша
      setLogoUrl(`${data.data.logo.url}?t=${Date.now()}`);

      alert("Логотип успешно загружен!");
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при загрузке логотипа");
    } finally {
      setUploadingLogo(false);
      // Сбрасываем input чтобы можно было загрузить тот же файл снова
      e.target.value = "";
    }
  };

  const handleSaveAltTitle = async (
    pageType: string,
    pageInfo: any,
    imageIndex: number,
    alt: string,
    title: string
  ) => {
    if (!projectName) return;

    try {
      // Обновляем alt/title для конкретной картинки
      const updatedImages = [...(pageInfo.images || [])];
      updatedImages[imageIndex] = {
        ...updatedImages[imageIndex],
        alt: alt,
        title: title,
      };

      // Сохраняем обновленный массив картинок
      const saveResponse = await fetch(`${API_URL}/api/build/save-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName: projectName,
          pageType: pageType,
          images: updatedImages,
        }),
      });

      const saveData = await parseResponseJson(saveResponse);

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить alt/title");
      }

      // Перезагружаем проект
      await loadProject();

      // Обновляем выбранное изображение в модальном окне
      if (
        selectedImage &&
        selectedImage.pageType === pageType &&
        selectedImage.imageIndex === imageIndex
      ) {
        setSelectedImage({
          ...selectedImage,
          image: updatedImages[imageIndex],
        });
      }
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message || "Произошла ошибка при сохранении alt/title");
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="project-details-container">
        <div className="loading">Загрузка проекта...</div>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="project-details-container">
        <div className="error-message">
          <strong>Ошибка:</strong> {error}
        </div>
        <button onClick={() => navigate("/projects")} className="back-button">
          ← Назад
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="project-details-container">
        <div className="error-message">Проект не найден</div>
        <button onClick={() => navigate("/projects")} className="back-button">
          ← Назад
        </button>
      </div>
    );
  }

  return (
    <div className="project-details-container">
      <div className="project-header">
        <button onClick={() => navigate("/projects")} className="back-button">
          ← Назад
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flex: 1,
          }}
        >
          <h1>{project.brand}</h1>
          <div className="project-name-badge">{project.projectName}</div>
        </div>
      </div>

      <div className="project-info-section">
        <div className="section-header">
          <h2>Информация о проекте</h2>
          {!isEditing ? (
            <button onClick={handleEdit} className="edit-button">
              Редактировать
            </button>
          ) : (
            <div className="edit-actions">
              <button
                onClick={handleCancel}
                className="cancel-button"
                disabled={saving}
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                className="save-button"
                disabled={saving}
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          )}
        </div>

        {error && isEditing && (
          <div className="error-message" style={{ marginBottom: "10px" }}>
            <strong>Ошибка:</strong> {error}
          </div>
        )}

        {showRegenerateWarning && (
          <div className="warning-message" style={{ marginBottom: "10px" }}>
            <strong>⚠️ Внимание:</strong> У проекта есть сгенерированные
            страницы. После изменения настроек проекта необходимо
            перегенерировать страницы, чтобы применить изменения.
            <div className="warning-actions">
              <button
                onClick={handleCancelWarning}
                className="cancel-warning-button"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                className="confirm-save-button"
                disabled={saving}
              >
                {saving ? "Сохранение..." : "Сохранить и продолжить"}
              </button>
            </div>
          </div>
        )}

        <div className="info-column">
          <div className="info-row">
            <span className="info-label">Бренд:</span>
            {isEditing ? (
              <input
                type="text"
                className="info-input"
                value={editData.brand || ""}
                onChange={(e) => handleInputChange("brand", e.target.value)}
              />
            ) : (
              <span className="info-value">{project.brand}</span>
            )}
          </div>

          <div className="info-row">
            <span className="info-label">Страна:</span>
            {isEditing ? (
              <input
                type="text"
                className="info-input"
                value={editData.country || ""}
                onChange={(e) => handleInputChange("country", e.target.value)}
              />
            ) : (
              <span className="info-value">{project.country}</span>
            )}
          </div>

          <div className="info-row">
            <span className="info-label">Язык:</span>
            {isEditing ? (
              <input
                type="text"
                className="info-input"
                value={editData.language || ""}
                onChange={(e) => handleInputChange("language", e.target.value)}
              />
            ) : (
              <span className="info-value">{project.language}</span>
            )}
          </div>

          <div className="info-row">
            <span className="info-label">Lang (HTML):</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="text"
                className="info-input"
                value={htmlLangInput}
                onChange={(e) => setHtmlLangInput(e.target.value)}
                placeholder="en, ru, de..."
                style={{ width: "80px" }}
              />
              <button
                className="save-button"
                onClick={handleApplyHtmlLang}
                disabled={savingHtmlLang}
              >
                {savingHtmlLang ? "Применение..." : "Применить"}
              </button>
              {project.htmlLang && (
                <span className="info-value" style={{ fontSize: "12px" }}>
                  в index.html: {project.htmlLang}
                </span>
              )}
            </div>
          </div>

          {(project.primaryLanguage ||
            (project.locales && project.locales.length > 0) ||
            project.defaultLocale) && (
            <div
              className="info-row"
              style={{
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "6px",
              }}
            >
              <span className="info-label">GEO и языки:</span>
              <div
                className="info-value"
                style={{ fontSize: "13px", lineHeight: 1.55 }}
              >
                <div>
                  <strong>GEO:</strong>{" "}
                  {[project.geoCode, project.geoLabel]
                    .filter(Boolean)
                    .join(" — ") || project.country || "—"}
                </div>
                <div>
                  <strong>primaryLanguage:</strong>{" "}
                  {project.primaryLanguage ?? "—"}
                </div>
                <div>
                  <strong>languageCount:</strong>{" "}
                  {project.languageCount ??
                    project.locales?.length ??
                    "—"}
                </div>
                <div>
                  <strong>Источник пресета:</strong>{" "}
                  {project.languagePresetSource ?? "—"}
                </div>
                <div>
                  <strong>secondaryLanguages:</strong>{" "}
                  {(project.secondaryLanguages || []).length > 0
                    ? project.secondaryLanguages!.join(", ")
                    : "—"}
                </div>
                <div>
                  <strong>locales:</strong>{" "}
                  {(project.locales || []).length > 0
                    ? project.locales!.join(", ")
                    : "—"}
                </div>
                <div>
                  <strong>defaultLocale:</strong>{" "}
                  {project.defaultLocale ?? "—"}
                </div>
                {STANDARD_PAGES.some(
                  (pt) =>
                    project.pages?.[pt]?.generatedLocales &&
                    Object.keys(project.pages[pt]!.generatedLocales!).length > 0
                ) ? (
                  <div style={{ marginTop: "6px" }}>
                    <strong>Сгенерировано по локалям:</strong>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                      {STANDARD_PAGES.map((pt) => {
                        const gl = project.pages?.[pt]?.generatedLocales;
                        if (!gl || Object.keys(gl).length === 0) return null;
                        const done = Object.entries(gl)
                          .filter(([, ok]) => ok)
                          .map(([loc]) => loc);
                        if (!done.length) return null;
                        return (
                          <li key={pt}>
                            {PAGE_NAMES[pt] || pt}: {done.join(", ")}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div
            className="info-row"
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <span className="info-label">Preview и сборка:</span>
            <div
              className="info-value"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span style={{ fontSize: "13px" }}>
                <strong>Статус:</strong> {previewStatusLabel()}
              </span>
              <span style={{ fontSize: "12px", opacity: 0.85 }}>
                Просмотр:{" "}
                {project.previewViewedAt
                  ? new Date(project.previewViewedAt).toLocaleString()
                  : "—"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="btn secondary-btn"
                onClick={handleStartPreview}
                disabled={startingPreview}
              >
                Open Preview
              </button>
              <button
                type="button"
                className="btn primary-btn"
                onClick={handleApprovePreview}
                disabled={
                  project.previewApproved === true ||
                  (!project.previewViewedAt && !project.previewApproved)
                }
                title={
                  !project.previewViewedAt && !project.previewApproved
                    ? "Сначала откройте preview"
                    : undefined
                }
              >
                Approve preview
              </button>
              <button
                type="button"
                className="btn secondary-btn"
                onClick={handleResetPreviewApproval}
                disabled={
                  !project.previewApproved &&
                  !project.previewViewedAt
                }
              >
                Сбросить статус
              </button>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                fontSize: "12px",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={project.alwaysOpenPreviewAfterGeneration === true}
                  onChange={(e) =>
                    saveWorkflowSettings({
                      alwaysOpenPreviewAfterGeneration: e.target.checked,
                    })
                  }
                  disabled={savingWorkflow}
                />
                Всегда открывать preview после генерации страниц
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={project.askBeforeBuild !== false}
                  onChange={(e) =>
                    saveWorkflowSettings({
                      askBeforeBuild: e.target.checked,
                    })
                  }
                  disabled={savingWorkflow}
                />
                Спрашивать перед build/archive (подтверждение)
              </label>
              {savingWorkflow && (
                <span style={{ opacity: 0.75 }}>Сохранение…</span>
              )}
            </div>

            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                background: "#23272f",
                borderRadius: "8px",
                border: "1px solid #181b20",
           
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                Ревью сайта (preview)
              </div>
              <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#555" }}>
                Перед первым запуском в папке проекта выполните{" "}
                <code style={{ fontSize: "11px" }}>npm install</code> (терминал в{" "}
                <code style={{ fontSize: "11px" }}>projects/{projectName}</code>
                ).
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <input
                  readOnly
                  value={previewInfo?.url || ""}
                  placeholder="URL появится после «Запустить проект» (Vite на свободном порту)"
                  title={
                    previewInfo?.url ||
                    "Запустите превью — хост и порт задаёт сервер (PREVIEW_HOST / авто)"
                  }
                  style={{
                    flex: "1 1 220px",
                    minWidth: "180px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    background: previewInfo?.url ? "#181b20" : "#23272f",
                    color: "#fff",
               
                  }}
                />
                <button
                  type="button"
                  className="btn secondary-btn"
                  disabled={!previewInfo?.url}
                  onClick={() =>
                    previewInfo?.url && copyTextToClipboard(previewInfo.url)
                  }
                >
                  Копировать URL
                </button>
                {previewInfo?.url ? (
                  <a
                    className="btn primary-btn"
                    href={previewInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      textDecoration: "none",
                      display: "inline-block",
                      padding: "8px 14px",
                      borderRadius: "4px",
                    }}
                  >
                    Открыть в новой вкладке
                  </a>
                ) : (
                  <span
                    className="btn secondary-btn"
                    style={{
                      opacity: 0.65,
                      cursor: "not-allowed",
                      pointerEvents: "none",
                    }}
                  >
                    Открыть — после запуска
                  </span>
                )}
              </div>
              {!previewInfo?.url ? (
                <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#777" }}>
                  Ссылка обновится автоматически, когда dev-сервер превью поднимется
                  (кнопка в блоке «Запустить проект» ниже).
                </p>
              ) : null}
              {previewRunning && previewInfo?.url ? (
                <>
                  <iframe
                    title="Site preview"
                    src={previewInfo.url}
                    style={{
                      width: "100%",
                      height: "min(420px, 50vh)",
                      minHeight: "280px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      background: "#fff",
                    }}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                  <p style={{ margin: "6px 0 0 0", fontSize: "11px", color: "#888" }}>
                    Если iframe пустой — сайт может запретить встраивание; используйте
                    «Открыть в новой вкладке».
                  </p>
                </>
              ) : null}
            </div>
          </div>

          <div className="info-row">
            <span className="info-label">Домен:</span>
            {isEditing ? (
              <input
                type="text"
                className="info-input"
                value={editData.domain || ""}
                onChange={(e) => handleInputChange("domain", e.target.value)}
                placeholder="example.com (без https://)"
              />
            ) : (
              <span className="info-value">
                {project.domain || "Не указан"}
              </span>
            )}
          </div>

          <div className="info-row">
            <span className="info-label">Ссылка на партнерку:</span>
            {isEditing ? (
              <input
                type="text"
                className="info-input"
                value={editData.affiliateLink || ""}
                onChange={(e) =>
                  handleInputChange("affiliateLink", e.target.value)
                }
                placeholder="https://example.com/affiliate"
              />
            ) : (
              <span className="info-value">
                <a
                  href={project.affiliateLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {project.affiliateLink}
                </a>
              </span>
            )}
          </div>

          <div className="info-row">
            <span className="info-label">Приложение (APK):</span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <span
                className="info-value"
                style={{ color: project.app?.hasApp ? "var(--ui-success)" : "var(--ui-fg-muted)" }}
              >
                {project.app?.hasApp
                  ? project.app.link || project.app.fileName || "app.apk"
                  : "Нет приложения"}
              </span>
              {apkFile && (
                <span className="info-value" style={{ color: "var(--ui-fg-soft)" }}>
                  Выбрано: {apkFile.name}
                </span>
              )}
              <label
                className="upload-logo-button"
                style={{ cursor: "pointer" }}
              >
                <input
                  type="file"
                  accept=".apk"
                  onChange={handleApkChange}
                  disabled={uploadingApp || removingApp}
                  style={{ display: "none" }}
                />
                {uploadingApp ? "Загрузка..." : "Выбрать APK"}
              </label>
              <button
                className="save-button"
                onClick={handleUploadApp}
                disabled={!apkFile || uploadingApp || removingApp}
              >
                {uploadingApp ? "Загрузка..." : "Загрузить"}
              </button>
              <input
                type="text"
                className="info-input"
                value={appLinkInput}
                onChange={(e) => setAppLinkInput(e.target.value)}
                placeholder="https://example.com/app"
                style={{ minWidth: "240px" }}
                disabled={uploadingApp || removingApp}
              />
              <button
                className="save-button"
                onClick={handleSaveAppLink}
                disabled={!appLinkInput.trim() || uploadingApp || removingApp}
              >
                Сохранить ссылку
              </button>
              {project.app?.hasApp && (
                <button
                  className="cancel-button"
                  onClick={handleRemoveApp}
                  disabled={removingApp || uploadingApp}
                >
                  {removingApp ? "Удаление..." : "Удалить"}
                </button>
              )}
            </div>
          </div>

          <div className="info-row">
            <span className="info-label">Android APK:</span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                className="theme-button"
                onClick={() =>
                  confirmAndDownload(
                    `${API_URL}/api/build/download-apk/${encodeURIComponent(projectName ?? "")}`,
                    "готовый файл APK"
                  )
                }
              >
                📱 Скачать APK
              </button>
              <button
                type="button"
                className="cancel-button"
                onClick={() =>
                  confirmAndDownload(
                    `${API_URL}/api/build/download-apk-source/${encodeURIComponent(projectName ?? "")}`,
                    "архив исходников Cordova (ZIP)"
                  )
                }
              >
                Исходники (ZIP)
              </button>
              <span className="info-value" style={{ color: "var(--ui-fg-muted)", fontSize: "12px" }}>
                APK собирается на сервере (Cordova, debug). Нужны JDK и ANDROID_HOME. Первый запуск может занять несколько минут.
              </span>
            </div>
          </div>

          <div className="info-row">
            <span className="info-label">Google HTML (верификация):</span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                flex: 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  className="info-value"
                  style={{
                    color: project.googleHtml?.accountName ? "#28a745" : "#999",
                  }}
                >
                  Папка (аккаунт):{" "}
                  {project.googleHtml?.accountName
                    ? project.googleHtml.accountName
                    : "не выбрана"}
                </span>
                <select
                  className="info-input"
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  disabled={loadingAccounts || uploadingHtml}
                  style={{ minWidth: "200px" }}
                >
                  <option value="">Выберите папку</option>
                  {googleAccounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
                <button
                  className="save-button"
                  onClick={handleUploadGoogleHtml}
                  disabled={!selectedAccount || loadingAccounts || uploadingHtml}
                  title="Копирует все .html из modules/google-accounts/&lt;папка&gt; в public проекта"
                >
                  {uploadingHtml ? "Копирование..." : "Загрузить все .html"}
                </button>
              </div>
              {(project.googleHtml?.fileNames?.length ||
                project.googleHtml?.fileName) && (
                <small style={{ color: "#555", display: "block" }}>
                  В проекте:{" "}
                  {(project.googleHtml.fileNames?.length
                    ? project.googleHtml.fileNames
                    : project.googleHtml.fileName
                      ? [project.googleHtml.fileName]
                      : []
                  ).join(", ")}
                </small>
              )}
              <small style={{ color: "#666" }}>
                Положите все файлы верификации (например google*.html) в одну
                подпапку в{" "}
                <code>modules/google-accounts/&lt;имя&gt;/</code> — при загрузке
                они все копируются в <code>public/</code> с теми же именами.
              </small>
            </div>
          </div>

          <div className="info-row">
            <span className="info-label">Кнопки Hero Section:</span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                flex: 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <label style={{ minWidth: "150px" }}>Текст первой кнопки:</label>
                <input
                  type="text"
                  className="info-input"
                  value={button1Text}
                  onChange={(e) => setButton1Text(e.target.value)}
                  placeholder={`Join ${project.brand} Now`}
                  disabled={savingButtons}
                  style={{ flex: 1, minWidth: "200px" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <label style={{ minWidth: "150px" }}>Текст второй кнопки:</label>
                <input
                  type="text"
                  className="info-input"
                  value={button2Text}
                  onChange={(e) => setButton2Text(e.target.value)}
                  placeholder="Download APK"
                  disabled={savingButtons}
                  style={{ flex: 1, minWidth: "200px" }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  className="save-button"
                  onClick={handleSaveHeroButtons}
                  disabled={savingButtons}
                >
                  {savingButtons ? "Сохранение..." : "Сохранить тексты кнопок"}
                </button>
              </div>
              <small style={{ color: "#666", marginTop: "-5px" }}>
                Эти тексты будут использоваться во всех hero section на всех страницах проекта
              </small>
            </div>
          </div>

          <div className="info-row">
            <span className="info-label">Создан:</span>
            <span className="info-value">{formatDate(project.createdAt)}</span>
          </div>

          <div className="info-row">
            <span className="info-label">Логотип:</span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{
                    maxWidth: "100px",
                    maxHeight: "50px",
                    objectFit: "contain",
                  }}
                  onError={(e) => {
                    const el = e.target as HTMLImageElement;
                    if (projectName && !el.src.includes("logo.svg")) {
                      el.src = `/projects/${projectName}/public/images/logo.svg?t=${Date.now()}`;
                      return;
                    }
                    setLogoUrl(null);
                  }}
                />
              ) : (
                <span className="info-value" style={{ color: "#999" }}>
                  Не загружен
                </span>
              )}
              <button
                type="button"
                className="save-button"
                onClick={handleGenerateLogo}
                disabled={generatingLogo || uploadingLogo}
                title="Runware: казино-стиль, имя бренда в композиции"
              >
                {generatingLogo ? "Генерация..." : "Сгенерировать"}
              </button>
              <label
                className="upload-logo-button"
                style={{ cursor: "pointer" }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadLogo}
                  disabled={uploadingLogo || generatingLogo}
                  style={{ display: "none" }}
                />
                {uploadingLogo
                  ? "Загрузка..."
                  : logoUrl
                  ? "Заменить файлом"
                  : "Загрузить файл"}
              </label>
            </div>
          </div>

          <div className="info-row">
            <span className="info-label">Зависимости:</span>
            <span
              className="info-value"
              style={{
                color: dependenciesInstalled ? "#28a745" : "#dc3545",
                fontWeight: "600",
              }}
            >
              {dependenciesInstalled ? "✓ Установлены" : "✗ Не установлены"}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">Запуск проекта:</span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              {previewRunning && previewInfo ? (
                <>
                  <span className="info-value" style={{ color: "#28a745" }}>
                    ✓ Запущен
                  </span>
                  <a
                    href={previewInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#007bff",
                      textDecoration: "none",
                      fontSize: "12px",
                    }}
                  >
                    {previewInfo.url}
                  </a>
                  <button
                    onClick={handleStopPreview}
                    className="stop-preview-button"
                    disabled={stoppingPreview}
                  >
                    {stoppingPreview ? "Остановка..." : "Остановить"}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStartPreview}
                  className="start-preview-button"
                  disabled={startingPreview}
                >
                  {startingPreview ? "Запуск..." : "Запустить"}
                </button>
              )}
            </div>
          </div>

          <div className="info-row">
            <span className="info-label">Скачать проект:</span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="download-dist-button"
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#17a2b8",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
                onClick={() =>
                  confirmAndDownload(
                    `${API_URL}/api/build/download-dist/${projectName}`,
                    "исходники проекта (ZIP)"
                  )
                }
              >
                📦 Исходники (без node_modules и dist)
              </button>
              <button
                type="button"
                className="download-build-button"
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
                onClick={() =>
                  confirmAndDownload(
                    `${API_URL}/api/build/download-build/${projectName}`,
                    "сборку сайта (dist.zip)"
                  )
                }
              >
                🚀 Сборка сайта (dist.zip)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pages-section">
        <div className="section-header">
          <h2>Страницы проекта</h2>
          <div className="page-actions">
            <button
              onClick={() => setShowGenerateModal(true)}
              className="generate-pages-button"
            >
              Сгенерировать страницы
            </button>
            <button
              onClick={() => setShowCustomPageModal(true)}
              className="custom-page-button"
            >
              Кастомная страница
            </button>
            <button
              onClick={() => setShowImagePresetsModal(true)}
              className="image-presets-button"
            >
              Настройки картинок
            </button>
            <button
              onClick={() => setShowFaviconModal(true)}
              className="favicon-button"
            >
              Генерировать Favicon
            </button>
            <button
              onClick={() => setShowThemeModal(true)}
              className="theme-button"
            >
              Настройка темы
            </button>
            {project.pages && Object.keys(project.pages).length > 0 && (
              <button
                onClick={handleGenerateAllImages}
                className="generate-all-images-button"
                disabled={generatingAllImages}
              >
                {generatingAllImages
                  ? "Генерация всех картинок..."
                  : "🖼️ Сгенерировать все картинки"}
              </button>
            )}
          </div>
        </div>
        <div className="pages-list">
          {/* Сначала отображаем стандартные страницы */}
          {STANDARD_PAGES.map((pageType) => {
            const pageInfo = project.pages?.[pageType] || {
              pageType,
              blocks: [],
              generated: false,
            };
            const pageTitle = PAGE_NAMES[pageType] || pageType;

            return (
              <div key={pageType} className="page-card">
                <div className="page-header">
                  <h3>{pageTitle}</h3>
                  <div className="page-header-actions">
                    <span
                      className={`status-badge ${
                        pageInfo.generated ? "generated" : "not-generated"
                      }`}
                    >
                      {pageInfo.generated
                        ? "✓ Сгенерирована"
                        : "✗ Не сгенерирована"}
                    </span>
                    {pageInfo.generated && pageInfo.filePath && (
                      <button
                        className="edit-page-btn"
                        onClick={() => setEditPageType(pageType)}
                        title="Редактировать текст страницы"
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      className="regenerate-page-btn"
                      onClick={() => setRegeneratePageType(pageType)}
                      title={
                        pageInfo.generated
                          ? "Перегенерировать страницу"
                          : "Сгенерировать страницу"
                      }
                    >
                      ↻
                    </button>
                  </div>
                </div>
                <div className="page-blocks">
                  <div className="blocks-label">Блоки:</div>
                  <div className="blocks-list">
                    {pageInfo.blocks &&
                      pageInfo.blocks.map((block, index) => (
                        <span key={index} className="block-badge">
                          {block}
                        </span>
                      ))}
                  </div>
                </div>

                {/* Блок с картинками */}
                <div className="page-images-section">
                  <div className="images-header">
                    <span className="images-label">Изображения:</span>
                    <button
                      className="generate-images-btn"
                      onClick={() => handleGenerateImages(pageType, pageInfo)}
                      disabled={generatingImages === pageType}
                      title="Сгенерировать картинки"
                    >
                      {generatingImages === pageType
                        ? "Генерация..."
                        : "🖼️ Сгенерировать"}
                    </button>
                  </div>
                  {pageInfo.images && pageInfo.images.length > 0 ? (
                    <div className="images-grid">
                      {pageInfo.images.map((img: any, index: number) => (
                        <div key={index} className="image-item">
                          <div
                            className="image-preview-container"
                            onClick={() =>
                              setSelectedImage({
                                image: img,
                                pageType,
                                pageInfo,
                                imageIndex: index,
                              })
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <img
                              src={`${img.url}${img.url.includes('?') ? '&' : '?'}v=${imageVersion}`}
                              alt={img.alt || img.name}
                              className="page-image-preview"
                              key={`${img.name}-${imageVersion}`}
                              onError={(e) => {
                                console.error(
                                  "Ошибка загрузки картинки:",
                                  img.url,
                                  e
                                );
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          </div>
                          <div className="image-name">{img.name}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-images">
                      {pageInfo.imagesGenerated
                        ? "Картинки не сгенерированы"
                        : "Картинки еще не созданы"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Затем отображаем кастомные страницы */}
          {project.pages &&
            Object.entries(project.pages)
              .filter(
                ([pageType]) => !STANDARD_PAGES.includes(pageType as PageType)
              )
              .map(([pageType, pageInfo]) => {
                // Определяем название страницы
                const pageTitle = (pageInfo as any).isCustom
                  ? (pageInfo as any).pageName || pageType
                  : PAGE_NAMES[pageType] || pageType;

                return (
                  <div key={pageType} className="page-card">
                    <div className="page-header">
                      <h3>{pageTitle}</h3>
                      <div className="page-header-actions">
                        <span
                          className={`status-badge ${
                            pageInfo.generated ? "generated" : "not-generated"
                          }`}
                        >
                          {pageInfo.generated
                            ? "✓ Сгенерирована"
                            : "✗ Не сгенерирована"}
                        </span>
                        {pageInfo.generated && (pageInfo as any).filePath && (
                          <button
                            className="edit-page-btn"
                            onClick={() => setEditPageType(pageType)}
                            title="Редактировать текст страницы"
                          >
                            ✏️
                          </button>
                        )}
                        <button
                          className="regenerate-page-btn"
                          onClick={() => setRegeneratePageType(pageType)}
                          title={
                            pageInfo.generated
                              ? "Перегенерировать страницу"
                              : "Сгенерировать страницу"
                          }
                        >
                          ↻
                        </button>
                      </div>
                    </div>
                    <div className="page-blocks">
                      <div className="blocks-label">Блоки:</div>
                      <div className="blocks-list">
                        {pageInfo.blocks &&
                          pageInfo.blocks.map((block, index) => (
                            <span key={index} className="block-badge">
                              {block}
                            </span>
                          ))}
                      </div>
                    </div>

                    {/* Блок с картинками */}
                    <div className="page-images-section">
                      <div className="images-header">
                        <span className="images-label">Изображения:</span>
                        <button
                          className="generate-images-btn"
                          onClick={() =>
                            handleGenerateImages(pageType, pageInfo)
                          }
                          disabled={generatingImages === pageType}
                          title="Сгенерировать картинки"
                        >
                          {generatingImages === pageType
                            ? "Генерация..."
                            : "🖼️ Сгенерировать"}
                        </button>
                      </div>
                      {pageInfo.images && pageInfo.images.length > 0 ? (
                        <div className="images-grid">
                          {pageInfo.images.map((img: any, index: number) => (
                            <div key={index} className="image-item">
                              <div
                                className="image-preview-container"
                                onClick={() =>
                                  setSelectedImage({
                                    image: img,
                                    pageType,
                                    pageInfo,
                                    imageIndex: index,
                                  })
                                }
                                style={{ cursor: "pointer" }}
                              >
                                <img
                                  src={`${img.url}${img.url.includes('?') ? '&' : '?'}v=${imageVersion}`}
                                  alt={img.alt || img.name}
                                  className="page-image-preview"
                                  key={`${img.name}-${imageVersion}`}
                                  onError={(e) => {
                                    console.error(
                                      "Ошибка загрузки картинки:",
                                      img.url,
                                      e
                                    );
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              </div>
                              <div className="image-name">{img.name}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-images">
                          {pageInfo.imagesGenerated
                            ? "Картинки не сгенерированы"
                            : "Картинки еще не созданы"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
        </div>
      </div>

      <GeneratePagesModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        projectName={projectName || ""}
        projectSettings={{
          brand: project.brand,
          language: project.language,
          country: project.country,
          domain: project.domain,
          affiliateLink: project.affiliateLink,
          locales: project.locales,
          defaultLocale: project.defaultLocale,
        }}
        openPreviewAfterGeneration={
          project.alwaysOpenPreviewAfterGeneration === true
        }
        onRunPreview={runPreviewAndReturnUrl}
        onSuccess={() => {
          loadProject();
        }}
      />

      {regeneratePageType && (
        <RegeneratePageModal
          isOpen={!!regeneratePageType}
          onClose={() => setRegeneratePageType(null)}
          projectName={projectName || ""}
          pageType={regeneratePageType}
          projectSettings={{
            brand: project.brand,
            language: project.language,
            country: project.country,
            domain: project.domain,
            affiliateLink: project.affiliateLink,
          }}
          locales={project.locales}
          defaultLocale={project.defaultLocale}
          currentBlocks={project.pages?.[regeneratePageType]?.blocks || []}
          pageName={project.pages?.[regeneratePageType]?.pageName}
          isCustom={project.pages?.[regeneratePageType]?.isCustom || false}
          onSuccess={() => {
            loadProject();
            setRegeneratePageType(null);
          }}
        />
      )}

      <CustomPageModal
        isOpen={showCustomPageModal}
        onClose={() => setShowCustomPageModal(false)}
        projectName={projectName || ""}
        projectSettings={{
          brand: project.brand,
          language: project.language,
          country: project.country,
          domain: project.domain,
          affiliateLink: project.affiliateLink,
        }}
        onSuccess={() => {
          loadProject();
        }}
      />

      <ImagePresetsModal
        isOpen={showImagePresetsModal}
        onClose={() => setShowImagePresetsModal(false)}
        projectName={projectName || ""}
        currentPresets={project.imagePresets}
        onSave={() => {
          loadProject();
        }}
      />

      <FaviconModal
        isOpen={showFaviconModal}
        onClose={() => setShowFaviconModal(false)}
        projectName={projectName || ""}
        projectBrand={project.brand}
        onSuccess={() => {
          loadProject();
        }}
      />

      {customPromptImage && (
        <CustomPromptModal
          isOpen={!!customPromptImage}
          onClose={() => setCustomPromptImage(null)}
          currentPrompt={
            customPromptImage.pageInfo.images?.[customPromptImage.imageIndex]
              ?.prompt
          }
          onConfirm={(prompt) => {
            handleRegenerateSingleImage(
              customPromptImage.pageType,
              customPromptImage.pageInfo,
              customPromptImage.imageIndex,
              prompt
            );
            setCustomPromptImage(null);
          }}
        />
      )}

      {selectedImage && (
        <ImageModal
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
          image={selectedImage.image}
          pageType={selectedImage.pageType}
          pageInfo={selectedImage.pageInfo}
          imageIndex={selectedImage.imageIndex}
          projectName={projectName || ""}
          onRegenerate={handleRegenerateSingleImage}
          onRegenerateWithPrompt={(pageType, pageInfo, imageIndex, prompt) => {
            handleRegenerateSingleImage(pageType, pageInfo, imageIndex, prompt);
          }}
          onUpload={(e, pageType, pageInfo, imageIndex) => {
            handleUploadImage(e, pageType, pageInfo, imageIndex);
          }}
          onRegenerateAltTitle={handleRegenerateAltTitle}
          onSaveAltTitle={handleSaveAltTitle}
          generating={
            generatingImages ===
            `${selectedImage.pageType}-${selectedImage.imageIndex}`
          }
        />
      )}

      {editPageType && (
        <EditPageModal
          isOpen={!!editPageType}
          onClose={() => setEditPageType(null)}
          projectName={projectName || ""}
          pageType={editPageType}
          onSuccess={() => {
            loadProject();
            setEditPageType(null);
          }}
        />
      )}

      <ThemeModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        projectName={projectName || ""}
      />
    </div>
  );
};

export default ProjectDetails;

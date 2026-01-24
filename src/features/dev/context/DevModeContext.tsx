import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

import { useLibrary } from "@/data/SubstanceIndexProvider";
import type { SubstanceArticle } from "@/schema";
import { normalizeFounderKeys } from "@/data/content/about";
import { systemPrompt as generatorPromptSource } from "@/data/config/generatorPrompt";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";

// Type aliases for backwards compatibility
type ManualPsychoactiveIndexConfig = ManualIndexConfig;
type ManualChemicalIndexConfig = ManualIndexConfig;
type ManualMechanismIndexConfig = ManualIndexConfig;
import type { DevTab } from "@/types/navigation";

type ArticleRecord = SubstanceArticle;

type DevModeOpenOptions = {
  tab?: DevTab;
  slug?: string;
};

type DevModeContextValue = {
  articles: ArticleRecord[];
  psychoactiveIndexManual: ManualPsychoactiveIndexConfig;
  chemicalIndexManual: ManualChemicalIndexConfig;
  mechanismIndexManual: ManualMechanismIndexConfig;
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  open: (options?: DevModeOpenOptions) => void;
  close: () => void;
  updateArticleAt: (index: number, nextArticle: ArticleRecord) => void;
  resetArticleAt: (index: number) => void;
  resetAll: () => void;
  getOriginalArticle: (index: number) => ArticleRecord | undefined;
  getOriginalArticles: () => ArticleRecord[];
  replaceArticles: (nextArticles: ArticleRecord[]) => void;
  applyArticlesTransform: (transform: (previous: ArticleRecord[]) => ArticleRecord[]) => void;
  replacePsychoactiveIndexManual: (nextConfig: ManualPsychoactiveIndexConfig) => void;
  resetPsychoactiveIndexManual: () => void;
  getOriginalPsychoactiveIndexManual: () => ManualPsychoactiveIndexConfig;
  applyPsychoactiveIndexManualTransform: (
    transform: (previous: ManualPsychoactiveIndexConfig) => ManualPsychoactiveIndexConfig,
  ) => void;
  replaceChemicalIndexManual: (nextConfig: ManualChemicalIndexConfig) => void;
  resetChemicalIndexManual: () => void;
  getOriginalChemicalIndexManual: () => ManualChemicalIndexConfig;
  applyChemicalIndexManualTransform: (
    transform: (previous: ManualChemicalIndexConfig) => ManualChemicalIndexConfig,
  ) => void;
  replaceMechanismIndexManual: (nextConfig: ManualMechanismIndexConfig) => void;
  resetMechanismIndexManual: () => void;
  getOriginalMechanismIndexManual: () => ManualMechanismIndexConfig;
  applyMechanismIndexManualTransform: (
    transform: (previous: ManualMechanismIndexConfig) => ManualMechanismIndexConfig,
  ) => void;
  replaceAboutMarkdown: (nextMarkdown: string) => void;
  resetAboutMarkdown: () => void;
  getOriginalAboutMarkdown: () => string;
  replaceAboutSubtitle: (nextSubtitle: string) => void;
  resetAboutSubtitle: () => void;
  getOriginalAboutSubtitle: () => string;
  replaceAboutFounderKeys: (nextKeys: string[]) => void;
  resetAboutFounderKeys: () => void;
  getOriginalAboutFounderKeys: () => string[];
  generatorPrompt: string;
  replaceGeneratorPrompt: (nextPrompt: string) => void;
  resetGeneratorPrompt: () => void;
  getOriginalGeneratorPrompt: () => string;
  markChangesSaved: () => void;
};

const DevModeContext = createContext<DevModeContextValue | undefined>(undefined);

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

// Default empty index config for initial state
const EMPTY_INDEX_CONFIG: ManualIndexConfig = { version: 1, categories: [] };

export function DevModeProvider({ children }: { children: ReactNode }) {
  // Get library from SubstanceIndexProvider (already in tree via LazySubstanceIndexProvider)
  // LazySubstanceIndexProvider handles the lazy loading based on route detection
  const library = useLibrary();
  const articlesSource = library.articles;

  // Load index layouts from Convex
  const psychoactiveLayout = useQuery(api.indexLayouts.getByType, { type: "psychoactive" });
  const chemicalLayout = useQuery(api.indexLayouts.getByType, { type: "chemical" });
  const mechanismLayout = useQuery(api.indexLayouts.getByType, { type: "mechanism" });

  // Convert Convex layouts to ManualIndexConfig format
  const psychoactiveIndexManualSource = useMemo(() => {
    if (!psychoactiveLayout) return EMPTY_INDEX_CONFIG;
    return { version: psychoactiveLayout.version, categories: psychoactiveLayout.categories };
  }, [psychoactiveLayout]);

  const chemicalIndexManualSource = useMemo(() => {
    if (!chemicalLayout) return EMPTY_INDEX_CONFIG;
    return { version: chemicalLayout.version, categories: chemicalLayout.categories };
  }, [chemicalLayout]);

  const mechanismIndexManualSource = useMemo(() => {
    if (!mechanismLayout) return EMPTY_INDEX_CONFIG;
    return { version: mechanismLayout.version, categories: mechanismLayout.categories };
  }, [mechanismLayout]);

  console.log("[DevModeProvider] useLibrary() returned articles:", articlesSource.length);
  console.log("[DevModeProvider] Index layouts from Convex:", {
    psychoactive: psychoactiveLayout ? psychoactiveLayout.categories.length : "loading",
    chemical: chemicalLayout ? chemicalLayout.categories.length : "loading",
    mechanism: mechanismLayout ? mechanismLayout.categories.length : "loading",
  });

  // Store original articles in ref (initialized once when provider mounts)
  const originalArticlesRef = useRef<ArticleRecord[]>(deepClone(articlesSource));
  const [articles, setArticles] = useState<ArticleRecord[]>(() => {
    console.log("[DevModeProvider] Initial state - articlesSource:", articlesSource.length);
    return deepClone(articlesSource);
  });

  // Track if user has unsaved local edits (prevents sync from overwriting user changes)
  const hasLocalEditsRef = useRef(false);

  // Sync articles when source data changes (e.g., when library loads or hot reload)
  // Skip sync if user has unsaved local edits to prevent data loss
  useEffect(() => {
    console.log("[DevModeProvider] Sync effect CHECK - hasLocalEdits:", hasLocalEditsRef.current, "articlesSource:", articlesSource.length);
    if (hasLocalEditsRef.current) {
      console.log("[DevModeProvider] ⚠️ SKIPPING sync - user has local edits");
      return;
    }
    console.log("[DevModeProvider] ✅ Syncing - updating originalArticlesRef and articles state");
    originalArticlesRef.current = deepClone(articlesSource);
    setArticles(deepClone(articlesSource));
  }, [articlesSource]);

  const originalManualIndexRef = useRef<ManualPsychoactiveIndexConfig>(
    deepClone(psychoactiveIndexManualSource as ManualPsychoactiveIndexConfig),
  );
  const [psychoactiveIndexManual, setPsychoactiveIndexManual] = useState<ManualPsychoactiveIndexConfig>(
    () => deepClone(originalManualIndexRef.current),
  );

  // Sync psychoactive index when Convex data loads
  useEffect(() => {
    if (psychoactiveLayout) {
      const config = { version: psychoactiveLayout.version, categories: psychoactiveLayout.categories };
      originalManualIndexRef.current = deepClone(config);
      setPsychoactiveIndexManual(deepClone(config));
    }
  }, [psychoactiveLayout]);

  const originalChemicalManualRef = useRef<ManualChemicalIndexConfig>(
    deepClone(chemicalIndexManualSource as ManualChemicalIndexConfig),
  );
  const [chemicalIndexManual, setChemicalIndexManual] = useState<ManualChemicalIndexConfig>(
    () => deepClone(originalChemicalManualRef.current),
  );

  // Sync chemical index when Convex data loads
  useEffect(() => {
    if (chemicalLayout) {
      const config = { version: chemicalLayout.version, categories: chemicalLayout.categories };
      originalChemicalManualRef.current = deepClone(config);
      setChemicalIndexManual(deepClone(config));
    }
  }, [chemicalLayout]);

  const originalMechanismManualRef = useRef<ManualMechanismIndexConfig>(
    deepClone(mechanismIndexManualSource as ManualMechanismIndexConfig),
  );
  const [mechanismIndexManual, setMechanismIndexManual] = useState<ManualMechanismIndexConfig>(
    () => deepClone(originalMechanismManualRef.current),
  );

  // Sync mechanism index when Convex data loads
  useEffect(() => {
    if (mechanismLayout) {
      const config = { version: mechanismLayout.version, categories: mechanismLayout.categories };
      originalMechanismManualRef.current = deepClone(config);
      setMechanismIndexManual(deepClone(config));
    }
  }, [mechanismLayout]);
  // Query About config from Convex (no static fallback - Convex is the source of truth)
  const aboutConfig = useQuery(api.siteConfig.getAbout, {});

  const originalAboutMarkdownRef = useRef<string>("");
  const originalAboutSubtitleRef = useRef<string>("");
  const [aboutMarkdown, setAboutMarkdown] = useState<string>("");
  const [aboutSubtitle, setAboutSubtitle] = useState<string>("");
  const originalAboutFounderKeysRef = useRef<string[]>([]);
  const [aboutFounderKeys, setAboutFounderKeys] = useState<string[]>([]);

  // Sync About content when Convex data loads (Convex is the only source)
  useEffect(() => {
    if (aboutConfig) {
      const markdown = aboutConfig.aboutMarkdown ?? "";
      const subtitle = aboutConfig.aboutSubtitle ?? "";
      const founderKeys = aboutConfig.founderProfileKeys ?? [];

      originalAboutMarkdownRef.current = markdown;
      setAboutMarkdown(markdown);
      originalAboutSubtitleRef.current = subtitle;
      setAboutSubtitle(subtitle);
      originalAboutFounderKeysRef.current = [...founderKeys];
      setAboutFounderKeys([...founderKeys]);
    }
  }, [aboutConfig]);
  const originalGeneratorPromptRef = useRef<string>(generatorPromptSource);
  const [generatorPrompt, setGeneratorPrompt] = useState<string>(() => generatorPromptSource);
  const lastVisitedPathRef = useRef<string | null>(null);

  const isDevPath = useCallback((value: string | null | undefined) => {
    if (typeof value !== "string") {
      return false;
    }
    return value.startsWith("/dev");
  }, []);

  const open = useCallback((options?: DevModeOpenOptions) => {
    if (typeof window === "undefined") {
      return;
    }

    const currentPath = window.location.pathname || "/substances";
    if (!isDevPath(currentPath)) {
      lastVisitedPathRef.current = currentPath;
    }

    const requestedTab = options?.tab ?? "edit";
    const slug = options?.slug?.trim();
    const nextPath = slug && slug.length > 0 ? `/dev/${requestedTab}/${slug}` : `/dev/${requestedTab}`;

    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }

    if (!isDevPath(window.location.pathname)) {
      window.history.pushState(null, "", nextPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }

    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [isDevPath]);

  const close = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const fallback = lastVisitedPathRef.current && !isDevPath(lastVisitedPathRef.current)
      ? lastVisitedPathRef.current
      : "/substances";

    if (window.location.pathname !== fallback) {
      window.history.pushState(null, "", fallback);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.history.pushState(null, "", "/substances");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [isDevPath]);

  const updateArticleAt = useCallback((index: number, nextArticle: ArticleRecord) => {
    console.log("[DevModeProvider] 📝 updateArticleAt called - index:", index, "title:", nextArticle.title, "setting hasLocalEdits=true");
    hasLocalEditsRef.current = true; // Mark that user has unsaved edits
    setArticles((previous) => {
      if (index < 0 || index >= previous.length) {
        return previous;
      }

      const next = [...previous];
      next[index] = deepClone(nextArticle);
      return next;
    });
  }, []);

  const resetArticleAt = useCallback((index: number) => {
    setArticles((previous) => {
      if (index < 0 || index >= previous.length) {
        return previous;
      }

      const original = originalArticlesRef.current[index];
      if (!original) {
        return previous;
      }

      const next = [...previous];
      next[index] = deepClone(original);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setArticles(deepClone(originalArticlesRef.current));
    setAboutMarkdown(originalAboutMarkdownRef.current);
    setAboutSubtitle(originalAboutSubtitleRef.current);
    setAboutFounderKeys([...originalAboutFounderKeysRef.current]);
  }, []);

  const getOriginalArticle = useCallback((index: number) => {
    const original = originalArticlesRef.current[index];
    if (!original) {
      return undefined;
    }

    return deepClone(original);
  }, []);

  const getOriginalArticles = useCallback(() => deepClone(originalArticlesRef.current), []);

  const replaceArticles = useCallback((nextArticles: ArticleRecord[]) => {
    setArticles(deepClone(nextArticles));
  }, []);

  const applyArticlesTransform = useCallback((transform: (previous: ArticleRecord[]) => ArticleRecord[]) => {
    setArticles((previous) => {
      const next = transform(previous);
      return deepClone(next);
    });
  }, []);

  const replacePsychoactiveIndexManual = useCallback((nextConfig: ManualPsychoactiveIndexConfig) => {
    setPsychoactiveIndexManual(deepClone(nextConfig));
  }, []);

  const resetPsychoactiveIndexManual = useCallback(() => {
    setPsychoactiveIndexManual(deepClone(originalManualIndexRef.current));
  }, []);

  const getOriginalPsychoactiveIndexManual = useCallback(
    () => deepClone(originalManualIndexRef.current),
    [],
  );

  const applyPsychoactiveIndexManualTransform = useCallback(
    (transform: (previous: ManualPsychoactiveIndexConfig) => ManualPsychoactiveIndexConfig) => {
      setPsychoactiveIndexManual((previous) => {
        const next = transform(previous);
        return deepClone(next);
      });
    },
    [],
  );

  const replaceChemicalIndexManual = useCallback((nextConfig: ManualChemicalIndexConfig) => {
    setChemicalIndexManual(deepClone(nextConfig));
  }, []);

  const resetChemicalIndexManual = useCallback(() => {
    setChemicalIndexManual(deepClone(originalChemicalManualRef.current));
  }, []);

  const getOriginalChemicalIndexManual = useCallback(
    () => deepClone(originalChemicalManualRef.current),
    [],
  );

  const applyChemicalIndexManualTransform = useCallback(
    (transform: (previous: ManualChemicalIndexConfig) => ManualChemicalIndexConfig) => {
      setChemicalIndexManual((previous) => {
        const next = transform(previous);
        return deepClone(next);
      });
    },
    [],
  );

  const replaceMechanismIndexManual = useCallback((nextConfig: ManualMechanismIndexConfig) => {
    setMechanismIndexManual(deepClone(nextConfig));
  }, []);

  const resetMechanismIndexManual = useCallback(() => {
    setMechanismIndexManual(deepClone(originalMechanismManualRef.current));
  }, []);

  const getOriginalMechanismIndexManual = useCallback(
    () => deepClone(originalMechanismManualRef.current),
    [],
  );

  const applyMechanismIndexManualTransform = useCallback(
    (transform: (previous: ManualMechanismIndexConfig) => ManualMechanismIndexConfig) => {
      setMechanismIndexManual((previous) => {
        const next = transform(previous);
        return deepClone(next);
      });
    },
    [],
  );

  const replaceAboutMarkdown = useCallback((nextMarkdown: string) => {
    setAboutMarkdown(nextMarkdown);
  }, []);

  const resetAboutMarkdown = useCallback(() => {
    setAboutMarkdown(originalAboutMarkdownRef.current);
  }, []);

  const getOriginalAboutMarkdown = useCallback(() => originalAboutMarkdownRef.current, []);

  const replaceAboutSubtitle = useCallback((nextSubtitle: string) => {
    setAboutSubtitle(nextSubtitle);
  }, []);

  const resetAboutSubtitle = useCallback(() => {
    setAboutSubtitle(originalAboutSubtitleRef.current);
  }, []);

  const getOriginalAboutSubtitle = useCallback(() => originalAboutSubtitleRef.current, []);

  const replaceAboutFounderKeys = useCallback((nextKeys: string[]) => {
    setAboutFounderKeys(normalizeFounderKeys(nextKeys));
  }, []);

  const resetAboutFounderKeys = useCallback(() => {
    setAboutFounderKeys([...originalAboutFounderKeysRef.current]);
  }, []);

  const getOriginalAboutFounderKeys = useCallback(
    () => [...originalAboutFounderKeysRef.current],
    [],
  );

  const replaceGeneratorPrompt = useCallback((nextPrompt: string) => {
    setGeneratorPrompt(nextPrompt);
  }, []);

  const resetGeneratorPrompt = useCallback(() => {
    setGeneratorPrompt(originalGeneratorPromptRef.current);
  }, []);

  const getOriginalGeneratorPrompt = useCallback(() => originalGeneratorPromptRef.current, []);

  // Reset the local edits flag after successful save to Convex
  // Also updates originalArticlesRef so subsequent comparisons work correctly
  const markChangesSaved = useCallback(() => {
    console.log("[DevModeProvider] 💾 markChangesSaved called - resetting hasLocalEdits to false, updating originalArticlesRef with", articles.length, "articles");
    hasLocalEditsRef.current = false;
    originalArticlesRef.current = deepClone(articles);
  }, [articles]);

  const value = useMemo<DevModeContextValue>(() => ({
    articles,
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    open,
    close,
    updateArticleAt,
    resetArticleAt,
    resetAll,
    getOriginalArticle,
    getOriginalArticles,
    replaceArticles,
    applyArticlesTransform,
    replacePsychoactiveIndexManual,
    resetPsychoactiveIndexManual,
    getOriginalPsychoactiveIndexManual,
    applyPsychoactiveIndexManualTransform,
    replaceChemicalIndexManual,
    resetChemicalIndexManual,
    getOriginalChemicalIndexManual,
    applyChemicalIndexManualTransform,
    replaceMechanismIndexManual,
    resetMechanismIndexManual,
    getOriginalMechanismIndexManual,
    applyMechanismIndexManualTransform,
    replaceAboutMarkdown,
    resetAboutMarkdown,
    getOriginalAboutMarkdown,
    replaceAboutSubtitle,
    resetAboutSubtitle,
    getOriginalAboutSubtitle,
    replaceAboutFounderKeys,
    resetAboutFounderKeys,
    getOriginalAboutFounderKeys,
    generatorPrompt,
    replaceGeneratorPrompt,
    resetGeneratorPrompt,
    getOriginalGeneratorPrompt,
    markChangesSaved,
  }), [
    aboutFounderKeys,
    aboutMarkdown,
    aboutSubtitle,
    applyArticlesTransform,
    applyPsychoactiveIndexManualTransform,
    applyChemicalIndexManualTransform,
    applyMechanismIndexManualTransform,
    articles,
    close,
    getOriginalAboutFounderKeys,
    getOriginalAboutMarkdown,
    getOriginalAboutSubtitle,
    getOriginalArticle,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
    open,
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    replaceAboutFounderKeys,
    replaceAboutMarkdown,
    replaceAboutSubtitle,
    replaceArticles,
    replacePsychoactiveIndexManual,
    replaceChemicalIndexManual,
    replaceMechanismIndexManual,
    resetAboutFounderKeys,
    resetAboutMarkdown,
    resetAboutSubtitle,
    resetAll,
    resetArticleAt,
    resetPsychoactiveIndexManual,
    resetChemicalIndexManual,
    resetMechanismIndexManual,
    updateArticleAt,
    generatorPrompt,
    replaceGeneratorPrompt,
    resetGeneratorPrompt,
    getOriginalGeneratorPrompt,
    markChangesSaved,
  ]);

  return <DevModeContext.Provider value={value}>{children}</DevModeContext.Provider>;
}

export function useDevMode() {
  const context = useContext(DevModeContext);
  if (!context) {
    throw new Error("useDevMode must be used within a DevModeProvider");
  }

  return context;
}

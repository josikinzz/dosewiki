import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import articlesSource from "../../data/articles";
import psychoactiveIndexManualSource from "../../data/psychoactiveIndexManual.json";
import chemicalIndexManualSource from "../../data/chemicalIndexManual.json";
import mechanismIndexManualSource from "../../data/mechanismIndexManual.json";
import {
  aboutMarkdown as aboutMarkdownSource,
  aboutSubtitleMarkdown as aboutSubtitleSource,
  aboutFounderKeys as aboutFounderKeysSource,
  normalizeFounderKeys,
} from "../../data/about";
import type { ManualPsychoactiveIndexConfig } from "../../data/psychoactiveIndexManual";
import type { ManualChemicalIndexConfig } from "../../data/chemicalIndexManual";
import type { ManualMechanismIndexConfig } from "../../data/mechanismIndexManual";
import type { DevTab } from "../../types/navigation";

type ArticleRecord = (typeof articlesSource)[number];

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
};

const DevModeContext = createContext<DevModeContextValue | undefined>(undefined);

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export function DevModeProvider({ children }: { children: ReactNode }) {
  const originalArticlesRef = useRef<ArticleRecord[]>(deepClone(articlesSource));
  const [articles, setArticles] = useState<ArticleRecord[]>(() => deepClone(originalArticlesRef.current));
  const originalManualIndexRef = useRef<ManualPsychoactiveIndexConfig>(
    deepClone(psychoactiveIndexManualSource as ManualPsychoactiveIndexConfig),
  );
  const [psychoactiveIndexManual, setPsychoactiveIndexManual] = useState<ManualPsychoactiveIndexConfig>(
    () => deepClone(originalManualIndexRef.current),
  );
  const originalChemicalManualRef = useRef<ManualChemicalIndexConfig>(
    deepClone(chemicalIndexManualSource as ManualChemicalIndexConfig),
  );
  const [chemicalIndexManual, setChemicalIndexManual] = useState<ManualChemicalIndexConfig>(
    () => deepClone(originalChemicalManualRef.current),
  );
  const originalMechanismManualRef = useRef<ManualMechanismIndexConfig>(
    deepClone(mechanismIndexManualSource as ManualMechanismIndexConfig),
  );
  const [mechanismIndexManual, setMechanismIndexManual] = useState<ManualMechanismIndexConfig>(
    () => deepClone(originalMechanismManualRef.current),
  );
  const originalAboutMarkdownRef = useRef<string>(aboutMarkdownSource);
  const originalAboutSubtitleRef = useRef<string>(aboutSubtitleSource);
  const [aboutMarkdown, setAboutMarkdown] = useState<string>(() => aboutMarkdownSource);
  const [aboutSubtitle, setAboutSubtitle] = useState<string>(() => aboutSubtitleSource);
  const originalAboutFounderKeysRef = useRef<string[]>([...aboutFounderKeysSource]);
  const [aboutFounderKeys, setAboutFounderKeys] = useState<string[]>(() => [...aboutFounderKeysSource]);
  const lastVisitedHashRef = useRef<string | null>(null);

  const isDevHash = useCallback((value: string | null | undefined) => {
    if (typeof value !== "string") {
      return false;
    }
    return value.startsWith("#/dev");
  }, []);

  const open = useCallback((options?: DevModeOpenOptions) => {
    if (typeof window === "undefined") {
      return;
    }

    const currentHash = window.location.hash || "#/substances";
    if (!isDevHash(currentHash)) {
      lastVisitedHashRef.current = currentHash;
    }

    const requestedTab = options?.tab ?? "edit";
    const slug = options?.slug?.trim();
    const nextHash = slug && slug.length > 0 ? `#/dev/${requestedTab}/${slug}` : `#/dev/${requestedTab}`;

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
      return;
    }

    if (!isDevHash(window.location.hash)) {
      window.location.hash = nextHash;
      return;
    }

    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [isDevHash]);

  const close = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const fallback = lastVisitedHashRef.current && !isDevHash(lastVisitedHashRef.current)
      ? lastVisitedHashRef.current
      : "#/substances";

    if (window.location.hash !== fallback) {
      window.location.hash = fallback;
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = "#/substances";
    }
  }, [isDevHash]);

  const updateArticleAt = useCallback((index: number, nextArticle: ArticleRecord) => {
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

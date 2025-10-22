import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import articlesSource from "../../data/articles";
import psychoactiveIndexManualSource from "../../data/psychoactiveIndexManual.json";
import type { ManualPsychoactiveIndexConfig } from "../../data/psychoactiveIndexManual";

type ArticleRecord = (typeof articlesSource)[number];

type DevModeContextValue = {
  articles: ArticleRecord[];
  psychoactiveIndexManual: ManualPsychoactiveIndexConfig;
  open: () => void;
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
  const lastVisitedHashRef = useRef<string | null>(null);

  const isDevHash = useCallback((value: string | null | undefined) => {
    if (typeof value !== "string") {
      return false;
    }
    return value.startsWith("#/dev");
  }, []);

  const open = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentHash = window.location.hash || "#/substances";
    if (!isDevHash(currentHash)) {
      lastVisitedHashRef.current = currentHash;
    }

    if (!isDevHash(window.location.hash)) {
      window.location.hash = "#/dev/edit";
    }
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

  const value = useMemo<DevModeContextValue>(() => ({
    articles,
    psychoactiveIndexManual,
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
  }), [
    applyArticlesTransform,
    applyPsychoactiveIndexManualTransform,
    articles,
    close,
    getOriginalArticle,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    open,
    replaceArticles,
    replacePsychoactiveIndexManual,
    resetAll,
    resetArticleAt,
    resetPsychoactiveIndexManual,
    psychoactiveIndexManual,
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

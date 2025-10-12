import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import articlesSource from "../../data/articles.json";

type ArticleRecord = (typeof articlesSource)[number];

type DevModeContextValue = {
  articles: ArticleRecord[];
  open: () => void;
  close: () => void;
  updateArticleAt: (index: number, nextArticle: ArticleRecord) => void;
  resetArticleAt: (index: number) => void;
  resetAll: () => void;
  getOriginalArticle: (index: number) => ArticleRecord | undefined;
};

const DevModeContext = createContext<DevModeContextValue | undefined>(undefined);

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export function DevModeProvider({ children }: { children: ReactNode }) {
  const originalArticlesRef = useRef<ArticleRecord[]>(deepClone(articlesSource));
  const [articles, setArticles] = useState<ArticleRecord[]>(() => deepClone(originalArticlesRef.current));
  const lastVisitedHashRef = useRef<string | null>(null);

  const open = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentHash = window.location.hash || "#/substances";
    if (currentHash !== "#/dev") {
      lastVisitedHashRef.current = currentHash;
    }

    if (window.location.hash !== "#/dev") {
      window.location.hash = "#/dev";
    }
  }, []);

  const close = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const fallback = lastVisitedHashRef.current && lastVisitedHashRef.current !== "#/dev"
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
  }, []);

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

  const value = useMemo<DevModeContextValue>(() => ({
    articles,
    open,
    close,
    updateArticleAt,
    resetArticleAt,
    resetAll,
    getOriginalArticle,
  }), [articles, close, getOriginalArticle, open, resetAll, resetArticleAt, updateArticleAt]);

  return <DevModeContext.Provider value={value}>{children}</DevModeContext.Provider>;
}

export function useDevMode() {
  const context = useContext(DevModeContext);
  if (!context) {
    throw new Error("useDevMode must be used within a DevModeProvider");
  }

  return context;
}

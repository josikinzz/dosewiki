import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import articlesSource from "../../data/articles";
import psychoactiveIndexManualSource from "../../data/psychoactiveIndexManual.json";
import chemicalIndexManualSource from "../../data/chemicalIndexManual.json";
import mechanismIndexManualSource from "../../data/mechanismIndexManual.json";
import type { ManualPsychoactiveIndexConfig } from "../../data/psychoactiveIndexManual";
import type { ManualChemicalIndexConfig } from "../../data/chemicalIndexManual";
import type { ManualMechanismIndexConfig } from "../../data/mechanismIndexManual";

type ArticleRecord = (typeof articlesSource)[number];

type DevModeContextValue = {
  articles: ArticleRecord[];
  psychoactiveIndexManual: ManualPsychoactiveIndexConfig;
  chemicalIndexManual: ManualChemicalIndexConfig;
  mechanismIndexManual: ManualMechanismIndexConfig;
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

  const value = useMemo<DevModeContextValue>(() => ({
    articles,
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
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
  }), [
    applyArticlesTransform,
    applyPsychoactiveIndexManualTransform,
    applyChemicalIndexManualTransform,
    applyMechanismIndexManualTransform,
    articles,
    close,
    getOriginalArticle,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
    open,
    replaceArticles,
    replacePsychoactiveIndexManual,
    replaceChemicalIndexManual,
    replaceMechanismIndexManual,
    resetAll,
    resetArticleAt,
    resetPsychoactiveIndexManual,
    resetChemicalIndexManual,
    resetMechanismIndexManual,
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
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

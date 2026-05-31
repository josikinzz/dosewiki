import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { DevModeContextValue } from "./devModeTypes";
import { EMPTY_INDEX_CONFIG } from "./devModeUtils";
import { useDevAboutState } from "./useDevAboutState";
import { useDevArticlesState } from "./useDevArticlesState";
import { useDevIndexConfigsState } from "./useDevIndexConfigsState";
import { useDevNavigationState } from "./useDevNavigationState";

const DevModeContext = createContext<DevModeContextValue | undefined>(undefined);

export function DevModeProvider({
  children,
  navigate,
  getCurrentPath,
}: {
  children: ReactNode;
  navigate?: (path: string) => void;
  getCurrentPath?: () => string;
}) {
  const { articles: articlesSource } = useLibrary();

  const psychoactiveLayout = useQuery(api.indexLayouts.getByType, { type: "psychoactive" });
  const chemicalLayout = useQuery(api.indexLayouts.getByType, { type: "chemical" });
  const mechanismLayout = useQuery(api.indexLayouts.getByType, { type: "mechanism" });
  const aboutConfig = useQuery(api.siteConfig.getAbout, {});

  const psychoactiveSource = useMemo<ManualIndexConfig>(() => {
    if (!psychoactiveLayout) {
      return EMPTY_INDEX_CONFIG;
    }

    return { version: psychoactiveLayout.version, categories: psychoactiveLayout.categories };
  }, [psychoactiveLayout]);

  const chemicalSource = useMemo<ManualIndexConfig>(() => {
    if (!chemicalLayout) {
      return EMPTY_INDEX_CONFIG;
    }

    return { version: chemicalLayout.version, categories: chemicalLayout.categories };
  }, [chemicalLayout]);

  const mechanismSource = useMemo<ManualIndexConfig>(() => {
    if (!mechanismLayout) {
      return EMPTY_INDEX_CONFIG;
    }

    return { version: mechanismLayout.version, categories: mechanismLayout.categories };
  }, [mechanismLayout]);

  const navigationState = useDevNavigationState({ getCurrentPath, navigate });
  const articlesState = useDevArticlesState(articlesSource);
  const indexConfigsState = useDevIndexConfigsState({
    chemicalSource,
    mechanismSource,
    psychoactiveSource,
  });
  const aboutState = useDevAboutState(aboutConfig);
  const { resetArticlesToOriginal, ...articleContextValue } = articlesState;
  const { markIndexManualsSaved, ...indexContextValue } = indexConfigsState;
  const { markAboutContentSaved, resetAboutContent, ...aboutContextValue } = aboutState;

  const resetAll = useCallback(() => {
    resetArticlesToOriginal();
    resetAboutContent();
  }, [resetAboutContent, resetArticlesToOriginal]);

  const markChangesSaved = useCallback(() => {
    articleContextValue.markChangesSaved();
    markIndexManualsSaved();
    markAboutContentSaved();
  }, [
    articleContextValue,
    markIndexManualsSaved,
    markAboutContentSaved,
  ]);

  const value = useMemo<DevModeContextValue>(() => ({
    ...navigationState,
    ...articleContextValue,
    ...indexContextValue,
    ...aboutContextValue,
    markChangesSaved,
    resetAll,
  }), [
    aboutContextValue,
    articleContextValue,
    indexContextValue,
    markChangesSaved,
    navigationState,
    resetAll,
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

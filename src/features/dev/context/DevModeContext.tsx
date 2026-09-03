import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { DevModeContextValue } from "./devModeTypes";
import { EMPTY_INDEX_CONFIG } from "./devModeUtils";
import { useDevArticleHydration } from "./useDevArticleHydration";
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

  // One subscription for all three layouts. The three `getByType` reads this
  // replaced were three separate round trips for rows that `getAll` already
  // returns together, and `useIndexLayouts` (behind the library drain) issues
  // the identical `getAll` — Convex dedupes the two into a single subscription.
  const indexLayouts = useQuery(api.indexLayouts.getAll, {});

  type IndexLayoutRow = NonNullable<typeof indexLayouts>[number];

  const layoutsByType = useMemo(
    () => new Map<string, IndexLayoutRow>((indexLayouts ?? []).map((layout) => [layout.type, layout])),
    [indexLayouts],
  );

  const psychoactiveLayout = layoutsByType.get("psychoactive");
  const chemicalLayout = layoutsByType.get("chemical");
  const mechanismLayout = layoutsByType.get("mechanism");

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
  const articleHydration = useDevArticleHydration({
    articleCount: articlesState.articles.length,
    hydrateArticles: articlesState.hydrateArticles,
  });
  const { hydrateArticles: _hydrateArticles, ...articleContextValue } = articlesState;
  const { markIndexManualsSaved, ...indexContextValue } = indexConfigsState;

  const markChangesSaved = useCallback(() => {
    articleContextValue.markChangesSaved();
    markIndexManualsSaved();
  }, [articleContextValue, markIndexManualsSaved]);

  const value = useMemo<DevModeContextValue>(() => ({
    ...navigationState,
    ...articleContextValue,
    articleHydration,
    ...indexContextValue,
    markChangesSaved,
  }), [
    articleContextValue,
    articleHydration,
    indexContextValue,
    markChangesSaved,
    navigationState,
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

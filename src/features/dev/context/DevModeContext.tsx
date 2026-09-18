import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { canDraft, resolveSessionRole } from "@/lib/auth/roles";
import { useIndexLayouts } from "@/hooks/useIndexLayouts";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { DevModeContextValue } from "./devModeTypes";
import { EMPTY_INDEX_CONFIG } from "./devModeUtils";
import { useDevArticleHydration } from "./useDevArticleHydration";
import { useDevArticlesState } from "./useDevArticlesState";
import { useDevIndexConfigsState } from "./useDevIndexConfigsState";
import { useDevNavigationState } from "./useDevNavigationState";
import { useDevProposalSeed } from "./useDevProposalSeed";

const DevModeContext = createContext<DevModeContextValue | undefined>(undefined);

export function DevModeProvider({
  children,
  navigate,
  getCurrentPath,
  requestLibrary,
}: {
  children: ReactNode;
  navigate?: (path: string) => void;
  getCurrentPath?: () => string;
  requestLibrary?: () => Promise<void>;
}) {
  const { articles: articlesSource } = useLibrary();

  const session = useSession();
  const canReadPrivateLayouts =
    session.status === "authenticated"
    && canDraft(resolveSessionRole({ role: session.data?.user?.role }));
  const [layoutsRequested, setLayoutsRequested] = useState(false);
  const privateLayouts = useIndexLayouts(canReadPrivateLayouts && layoutsRequested);
  const indexLayouts = privateLayouts.layouts;

  type IndexLayoutRow = NonNullable<typeof indexLayouts>[number];

  const layoutsByType = useMemo(
    () => new Map<string, IndexLayoutRow>((indexLayouts ?? []).map((layout): [string, IndexLayoutRow] => [layout.type, layout])),
    [indexLayouts],
  );

  const psychoactiveLayout = layoutsByType.get("psychoactive");
  const chemicalLayout = layoutsByType.get("chemical");
  const mechanismLayout = layoutsByType.get("mechanism");
  const hasCompleteLayouts = Boolean(psychoactiveLayout && chemicalLayout && mechanismLayout);
  const requestCompleteLibrary = useCallback(() => {
    if (requestLibrary) return requestLibrary();
    return Promise.reject(new Error("The editor library loader is unavailable."));
  }, [requestLibrary]);
  const requestIndexLayouts = useCallback(() => {
    if (canReadPrivateLayouts) setLayoutsRequested(true);
  }, [canReadPrivateLayouts]);
  const retryIndexLayouts = useCallback(() => {
    if (!canReadPrivateLayouts) return;
    setLayoutsRequested(true);
    privateLayouts.retry();
  }, [canReadPrivateLayouts, privateLayouts.retry]);
  const indexLayoutsReadiness = useMemo<DevModeContextValue["indexLayoutsReadiness"]>(() => {
    if (!layoutsRequested || !canReadPrivateLayouts) {
      return { status: "idle", error: null };
    }
    if (privateLayouts.error) {
      return { status: "error", error: privateLayouts.error };
    }
    if (privateLayouts.layouts === undefined) {
      return { status: "loading", error: null };
    }
    if (!hasCompleteLayouts) {
      return {
        status: "error",
        error: "The editing source did not return all three index layouts.",
      };
    }
    return { status: "ready", error: null };
  }, [
    canReadPrivateLayouts,
    hasCompleteLayouts,
    layoutsRequested,
    privateLayouts.layouts,
    privateLayouts.error,
  ]);

  const psychoactiveSource = useMemo<ManualIndexConfig>(() => {
    if (!psychoactiveLayout) {
      return EMPTY_INDEX_CONFIG;
    }

    return { version: psychoactiveLayout.version, categories: psychoactiveLayout.categories, revision: psychoactiveLayout.revision ?? 0 };
  }, [psychoactiveLayout]);

  const chemicalSource = useMemo<ManualIndexConfig>(() => {
    if (!chemicalLayout) {
      return EMPTY_INDEX_CONFIG;
    }

    return { version: chemicalLayout.version, categories: chemicalLayout.categories, revision: chemicalLayout.revision ?? 0 };
  }, [chemicalLayout]);

  const mechanismSource = useMemo<ManualIndexConfig>(() => {
    if (!mechanismLayout) {
      return EMPTY_INDEX_CONFIG;
    }

    return { version: mechanismLayout.version, categories: mechanismLayout.categories, revision: mechanismLayout.revision ?? 0 };
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
  const { hydrateArticles: _hydrateArticles, hasUnsavedArticleChanges, ...articleContextValue } = articlesState;
  const { markIndexManualsSaved, hasUnsavedIndexChanges, ...indexContextValue } = indexConfigsState;
  const proposalLayouts = useMemo(
    () => ({
      psychoactive: { replace: indexConfigsState.replacePsychoactiveIndexManual, reset: indexConfigsState.resetPsychoactiveIndexManual },
      chemical: { replace: indexConfigsState.replaceChemicalIndexManual, reset: indexConfigsState.resetChemicalIndexManual },
      mechanism: { replace: indexConfigsState.replaceMechanismIndexManual, reset: indexConfigsState.resetMechanismIndexManual },
    }),
    [
      indexConfigsState.replaceChemicalIndexManual,
      indexConfigsState.replaceMechanismIndexManual,
      indexConfigsState.replacePsychoactiveIndexManual,
      indexConfigsState.resetChemicalIndexManual,
      indexConfigsState.resetMechanismIndexManual,
      indexConfigsState.resetPsychoactiveIndexManual,
    ],
  );
  const proposalSeed = useDevProposalSeed({
    hasUnsavedChanges: hasUnsavedArticleChanges || hasUnsavedIndexChanges,
    hydrateArticlesNow: articleHydration.hydrateArticlesNow,
    applyArticlesTransform: articlesState.applyArticlesTransform,
    getOriginalArticles: articlesState.getOriginalArticles,
    layouts: proposalLayouts,
  });

  const markChangesSaved = useCallback(() => {
    articleContextValue.markChangesSaved();
    markIndexManualsSaved();
    if (canReadPrivateLayouts) privateLayouts.retry();
  }, [articleContextValue, markIndexManualsSaved, canReadPrivateLayouts, privateLayouts.retry]);

  const value = useMemo<DevModeContextValue>(() => ({
    ...navigationState,
    ...articleContextValue,
    articleHydration,
    ...indexContextValue,
    indexLayoutsReadiness,
    requestIndexLayouts,
    retryIndexLayouts,
    requestLibrary: requestCompleteLibrary,
    markChangesSaved,
    ...proposalSeed,
  }), [
    articleContextValue,
    articleHydration,
    indexContextValue,
    indexLayoutsReadiness,
    markChangesSaved,
    navigationState,
    proposalSeed,
    requestIndexLayouts,
    requestCompleteLibrary,
    retryIndexLayouts,
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

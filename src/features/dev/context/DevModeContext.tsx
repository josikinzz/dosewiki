import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { canDraft, resolveSessionRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui";
import { useCopyIndexSource } from "../tools/useCopyIndexSource";
import { useEditorRead } from "@/hooks/useEditorRead";
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
}: {
  children: ReactNode;
  navigate?: (path: string) => void;
  getCurrentPath?: () => string;
}) {
  const { articles: articlesSource } = useLibrary();

  const session = useSession();
  const canReadPrivateLayouts = session.status === "authenticated" && canDraft(resolveSessionRole({ role: session.data?.user?.role }));
  const privateLayouts = useCopyIndexSource<Array<ManualIndexConfig & { type: "psychoactive" | "chemical" | "mechanism" }>>(canReadPrivateLayouts ? "/api/dev/index-layout?type=all" : null);
  const publicLayouts = useEditorRead("indexLayouts:getAll", canReadPrivateLayouts ? "skip" : {}, "list");
  const indexLayouts = canReadPrivateLayouts ? privateLayouts.data : publicLayouts?.map((layout) => ({ ...layout, revision: 0 }));

  type IndexLayoutRow = NonNullable<typeof indexLayouts>[number];

  const layoutsByType = useMemo(
    () => new Map<string, IndexLayoutRow>((indexLayouts ?? []).map((layout): [string, IndexLayoutRow] => [layout.type, layout])),
    [indexLayouts],
  );

  const psychoactiveLayout = layoutsByType.get("psychoactive");
  const chemicalLayout = layoutsByType.get("chemical");
  const mechanismLayout = layoutsByType.get("mechanism");

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
    if (canReadPrivateLayouts) privateLayouts.reload();
  }, [articleContextValue, markIndexManualsSaved, canReadPrivateLayouts, privateLayouts.reload]);

  const value = useMemo<DevModeContextValue>(() => ({
    ...navigationState,
    ...articleContextValue,
    articleHydration,
    ...indexContextValue,
    markChangesSaved,
    ...proposalSeed,
  }), [
    articleContextValue,
    articleHydration,
    indexContextValue,
    markChangesSaved,
    navigationState,
    proposalSeed,
  ]);

  if (canReadPrivateLayouts && privateLayouts.data === undefined) return <div role="status">{privateLayouts.error ? <><p role="alert">{privateLayouts.error}</p><Button onClick={privateLayouts.reload}>Retry loading editor layouts</Button></> : "Loading editor layouts…"}</div>;
  return <DevModeContext.Provider value={value}>{children}</DevModeContext.Provider>;
}

export function useDevMode() {
  const context = useContext(DevModeContext);
  if (!context) {
    throw new Error("useDevMode must be used within a DevModeProvider");
  }

  return context;
}

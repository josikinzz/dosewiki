import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { EditorNotice, useDirtyGuard } from "@/features/dev/components";
import { LoadErrorState } from "@/features/dev/components/LoadErrorState";
import { StateCard } from "@/components/common/StateCard";
import { viewToPath } from "@/utils/routing";
import { slugify } from "@/utils/slug";
import { resolveSessionRole } from "@/lib/auth/roles";
import type { SubstanceArticle } from "@/schema";
import type { DraftNavigationGuard } from "@/features/contextual-editing/context";
import ArticleContextBridge from "@/features/article/editing/ArticleContextBridge.editor";
import { ArticleLayout } from "@/features/article/components/ArticleLayout";
import { useDevMode } from "../../context/DevModeContext";
import { SubstanceEditorSelectionSection } from "./SubstanceEditorSelectionSection";
import { useSubstanceEditorArticleData } from "./useSubstanceEditorArticleData";
import type { SubstanceEditorTabProps } from "./types";

export const SubstanceEditorTab = memo(function SubstanceEditorTab({ initialSlug }: SubstanceEditorTabProps) {
  const { articles, articleHydration } = useDevMode();
  const session = useSession();
  const articleData = useSubstanceEditorArticleData(articles as SubstanceArticle[], initialSlug);
  const { selectedSubstanceSlug, setSelectedSubstanceSlug } = articleData;
  const [dirty, setDirty] = useState(false);
  const [operationLocked, setOperationLocked] = useState(false);
  const draftGuardRef = useRef<DraftNavigationGuard | null>(null);
  const dirtyGuard = useDirtyGuard(dirty, {
    title: "Keep your article edits?",
    description: "Save a private draft, discard local edits, or stay with this article. Nothing publishes automatically.",
    onSave: operationLocked ? undefined : async () => { if (!draftGuardRef.current?.save) throw new Error("The private draft is unavailable."); await draftGuardRef.current.save(); },
    onDiscard: () => draftGuardRef.current?.discard(),
    canDiscard: !operationLocked,
  });
  const urlSlugRef = useRef(initialSlug ?? null);
  useEffect(() => {
    if (selectedSubstanceSlug === urlSlugRef.current) return;
    urlSlugRef.current = selectedSubstanceSlug;
    window.history.replaceState(null, "", viewToPath({ type: "dev", tab: "articles", slug: selectedSubstanceSlug ?? undefined }));
  }, [selectedSubstanceSlug]);
  const { failedSlugs, isArticleHydrated, requestArticle } = articleHydration;
  const ready = isArticleHydrated(selectedSubstanceSlug);
  useEffect(() => { requestArticle(selectedSubstanceSlug); }, [requestArticle, selectedSubstanceSlug]);
  const handleSelectSubstance = useCallback((slug: string) => {
    if (slug !== selectedSubstanceSlug) dirtyGuard.guard(() => setSelectedSubstanceSlug(slug));
  }, [dirtyGuard.guard, selectedSubstanceSlug, setSelectedSubstanceSlug]);
  const article = ready ? (articles as SubstanceArticle[]).find((candidate) => {
    const storedSlug = (candidate as SubstanceArticle & { slug?: string }).slug;
    return (storedSlug || slugify(candidate.title || candidate.identification.common_name)) === selectedSubstanceSlug;
  }) : null;
  return <div className="mt-6 space-y-8">
    {dirtyGuard.dialog}
    <SubstanceEditorSelectionSection
      filteredSubstances={articleData.filteredSubstances} onSearchQueryChange={articleData.setSearchQuery}
      onSelectSubstance={handleSelectSubstance} onShowDirectUrlOnlyChange={articleData.setShowDirectUrlOnly}
      onSortOrderChange={articleData.setSortOrder} searchQuery={articleData.searchQuery}
      selectedSubstanceSlug={selectedSubstanceSlug} showDirectUrlOnly={articleData.showDirectUrlOnly}
      sortOrder={articleData.sortOrder} totalSubstances={articleData.totalSubstances}
    />
    {article && selectedSubstanceSlug ? <ArticleContextBridge
      key={selectedSubstanceSlug} slug={selectedSubstanceSlug} article={article} workbench
      workbenchRole={resolveSessionRole(session.data?.user ?? {})} onDirtyChange={setDirty} draftGuardRef={draftGuardRef}
      workbenchEmail={session.data?.user?.email ?? null}
      onOperationLockChange={setOperationLocked}
    ><ArticleLayout article={article} /></ArticleContextBridge> : selectedSubstanceSlug && failedSlugs.has(selectedSubstanceSlug) ? <LoadErrorState message="The full article could not be loaded." onRetry={() => requestArticle(selectedSubstanceSlug)} /> : selectedSubstanceSlug && !ready ? <EditorNotice notice={{ tone: "info", title: "Loading article", message: "Fetching the full article.", live: true }} /> : <StateCard icon="lucide:file-edit" title="Select a substance to begin editing" description="Open an article to edit its sections, resume your private draft, or review its history." />}
  </div>;
});

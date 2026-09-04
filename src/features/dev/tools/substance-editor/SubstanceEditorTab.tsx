import { memo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { EditorNotice, EditorStatusPill, useDirtyGuard } from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";
import type { SubstanceArticle } from "@/schema";
import { useDevMode } from "../../context/DevModeContext";
import { SubstanceEditorOutputSection } from "./SubstanceEditorOutputSection";
import { SubstanceEditorSelectionSection } from "./SubstanceEditorSelectionSection";
import { useSubstanceEditorArticleData } from "./useSubstanceEditorArticleData";
import { useSubstanceEditorDraftController } from "./useSubstanceEditorDraftController";
import type { SubstanceEditorTabProps } from "./types";

export const SubstanceEditorTab = memo(function SubstanceEditorTab({
  renderCommitPanel,
  initialSlug,
}: SubstanceEditorTabProps) {
  const { articles, applyArticlesTransform, articleHydration } = useDevMode();
  const articleData = useSubstanceEditorArticleData(articles as SubstanceArticle[], initialSlug);
  const { selectedSubstanceSlug, setSelectedSubstanceSlug } = articleData;

  // The address names the open article so a reload or a shared link lands on
  // it. Only a change writes: the slug the user arrived on is left alone.
  const urlSlugRef = useRef(initialSlug ?? null);
  useEffect(() => {
    if (selectedSubstanceSlug === urlSlugRef.current) return;
    urlSlugRef.current = selectedSubstanceSlug;
    window.history.replaceState(
      null,
      "",
      viewToPath({ type: "dev", tab: "articles", slug: selectedSubstanceSlug ?? undefined }),
    );
  }, [selectedSubstanceSlug]);

  const applyDraftArticlesTransform = useCallback(
    (transform: (previous: SubstanceArticle[]) => SubstanceArticle[]) => {
      applyArticlesTransform((previous) => transform(previous as SubstanceArticle[]));
    },
    [applyArticlesTransform],
  );

  // The library list carries no article bodies, so the form must not be built
  // from the selected row until the whole article has landed: a form seeded
  // from an empty body would write that emptiness back on the next apply.
  const { isArticleHydrated, requestArticle } = articleHydration;
  const isSelectedArticleReady = isArticleHydrated(selectedSubstanceSlug);

  useEffect(() => {
    requestArticle(selectedSubstanceSlug);
  }, [requestArticle, selectedSubstanceSlug]);

  const draft = useSubstanceEditorDraftController({
    articles: articles as SubstanceArticle[],
    applyArticlesTransform: applyDraftArticlesTransform,
    // Withholding the slug until the article has landed is what keeps the draft
    // from ever existing in an empty-bodied form: no YAML seed, no form, and no
    // "Apply to draft" button to write that emptiness into the working set.
    selectedSubstanceSlug: isSelectedArticleReady ? selectedSubstanceSlug : null,
    substances: articleData.substances,
  });

  // Selecting another substance rebuilds the draft from scratch, so unapplied
  // form edits would go with it.
  const dirtyGuard = useDirtyGuard(draft.formDirty, {
    title: "Discard unapplied form edits?",
    description:
      "This article has form edits that were not applied to the draft. Switching substances discards them.",
  });
  const { guard } = dirtyGuard;
  const handleSelectSubstance = useCallback(
    (slug: string) => {
      if (slug === selectedSubstanceSlug) {
        return;
      }
      guard(() => setSelectedSubstanceSlug(slug));
    },
    [guard, selectedSubstanceSlug, setSelectedSubstanceSlug],
  );

  return (
    <div className="mt-6 space-y-8">
      {dirtyGuard.dialog}
      <SubstanceEditorSelectionSection
        filteredSubstances={articleData.filteredSubstances}
        onSearchQueryChange={articleData.setSearchQuery}
        onSelectSubstance={handleSelectSubstance}
        onShowDirectUrlOnlyChange={articleData.setShowDirectUrlOnly}
        onSortOrderChange={articleData.setSortOrder}
        searchQuery={articleData.searchQuery}
        selectedSubstanceSlug={selectedSubstanceSlug}
        showDirectUrlOnly={articleData.showDirectUrlOnly}
        sortOrder={articleData.sortOrder}
        totalSubstances={articleData.totalSubstances}
      />

      {selectedSubstanceSlug && !isSelectedArticleReady ? (
        <EditorNotice
          notice={{
            tone: "info",
            title: "Loading article",
            message: "Fetching the full article.",
            live: true,
          }}
        />
      ) : (
      <SubstanceEditorOutputSection
        streamedOutput={draft.streamedOutput}
        outputViewMode={draft.outputViewMode}
        formDirty={draft.formDirty}
        formParseError={draft.formParseError}
        formArticleOverride={draft.formArticleOverride}
        selectedSubstanceSlug={selectedSubstanceSlug}
        selectedSubstance={articleData.selectedSubstance}
        onOutputViewModeChange={draft.handleOutputViewModeChange}
        onCopy={draft.handleCopy}
        onDownload={draft.handleDownload}
        onOutputChange={draft.setStreamedOutput}
        onFormMutate={draft.handleFormMutate}
        saveError={draft.saveError}
        validationError={draft.validationError}
        copyState={draft.copyState}
        formRef={draft.formRef}
      />
      )}

      {renderCommitPanel ? (
        <div className="space-y-3">
          {draft.formDirty ? (
            <EditorNotice
              notice={{
                tone: "warning",
                title: "Unapplied form edits",
                message:
                  "Commit to production publishes the last applied draft. Apply to draft first to include the edits currently in the form.",
                live: true,
              }}
            />
          ) : null}
          {renderCommitPanel(
            draft.streamedOutput ? (
              <span className="flex flex-wrap items-center gap-2">
                <Button
                  variant="glass"
                  size="pill"
                  className="rounded-full"
                  onClick={() => {
                    void draft.handleSaveToDatabase();
                  }}
                  disabled={draft.isSaving}
                >
                  Apply to draft
                </Button>
                {draft.saveSuccess ? (
                  <EditorStatusPill tone="success" icon="lucide:badge-check" live>
                    Applied to draft
                  </EditorStatusPill>
                ) : null}
              </span>
            ) : undefined,
          )}
        </div>
      ) : null}
    </div>
  );
});

import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { EditorNotice, EditorStatusPill } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";
import { useDevMode } from "../../context/DevModeContext";
import { SubstanceEditorOutputSection } from "./SubstanceEditorOutputSection";
import { SubstanceEditorSelectionSection } from "./SubstanceEditorSelectionSection";
import { useSubstanceEditorArticleData } from "./useSubstanceEditorArticleData";
import { useSubstanceEditorDraftController } from "./useSubstanceEditorDraftController";
import type { SubstanceEditorTabProps } from "./types";

export const SubstanceEditorTab = memo(function SubstanceEditorTab({
  renderCommitPanel,
  commitPanel,
}: SubstanceEditorTabProps) {
  const { articles, applyArticlesTransform } = useDevMode();
  const articleData = useSubstanceEditorArticleData(articles as SubstanceArticle[]);
  const { selectedSubstanceSlug, setSelectedSubstanceSlug } = articleData;

  const applyDraftArticlesTransform = useCallback(
    (transform: (previous: SubstanceArticle[]) => SubstanceArticle[]) => {
      applyArticlesTransform((previous) => transform(previous as SubstanceArticle[]));
    },
    [applyArticlesTransform],
  );

  const draft = useSubstanceEditorDraftController({
    articles: articles as SubstanceArticle[],
    applyArticlesTransform: applyDraftArticlesTransform,
    selectedSubstanceSlug,
    substances: articleData.substances,
    commitPanel,
  });

  // Selecting another substance rebuilds the draft from scratch, so unapplied
  // form edits would go with it. Same guard, same wording as the review queue.
  const handleSelectSubstance = useCallback(
    (slug: string) => {
      if (slug === selectedSubstanceSlug) {
        return;
      }
      if (
        draft.formDirty
        && typeof window !== "undefined"
        && !window.confirm(
          "This article has unapplied form edits that will be discarded. Switch substances anyway?",
        )
      ) {
        return;
      }
      setSelectedSubstanceSlug(slug);
    },
    [draft.formDirty, selectedSubstanceSlug, setSelectedSubstanceSlug],
  );

  return (
    <div className="mt-6 space-y-8">
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

      <SubstanceEditorOutputSection
        streamedOutput={draft.streamedOutput}
        outputViewMode={draft.outputViewMode}
        formDirty={draft.formDirty}
        formParseError={draft.formParseError}
        formArticleOverride={draft.formArticleOverride}
        selectedSubstanceSlug={selectedSubstanceSlug}
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

      {renderCommitPanel ? (
        <div className="space-y-3">
          {draft.formDirty ? (
            <EditorNotice
              notice={{
                tone: "warning",
                title: "Unapplied form edits",
                message:
                  "Saving to Convex publishes the last applied draft. Apply to draft first to include the edits currently in the form.",
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
                    void draft.handleSaveToDatabase("draft");
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
            "Apply form edits to the working set first, then save that draft to Convex.",
          )}
        </div>
      ) : commitPanel ? <div>{commitPanel}</div> : null}
    </div>
  );
});

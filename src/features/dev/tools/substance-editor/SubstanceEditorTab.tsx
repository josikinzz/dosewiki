import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
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

  const applyDraftArticlesTransform = useCallback(
    (transform: (previous: SubstanceArticle[]) => SubstanceArticle[]) => {
      applyArticlesTransform((previous) => transform(previous as SubstanceArticle[]));
    },
    [applyArticlesTransform],
  );

  const draft = useSubstanceEditorDraftController({
    articles: articles as SubstanceArticle[],
    applyArticlesTransform: applyDraftArticlesTransform,
    selectedSubstanceSlug: articleData.selectedSubstanceSlug,
    substances: articleData.substances,
    commitPanel,
  });

  return (
    <div className="mt-6 space-y-8">
      <SubstanceEditorSelectionSection
        filteredSubstances={articleData.filteredSubstances}
        onSearchQueryChange={articleData.setSearchQuery}
        onSelectSubstance={articleData.setSelectedSubstanceSlug}
        onShowLowPriorityChange={articleData.setShowLowPriority}
        onSortOrderChange={articleData.setSortOrder}
        searchQuery={articleData.searchQuery}
        selectedSubstanceSlug={articleData.selectedSubstanceSlug}
        showLowPriority={articleData.showLowPriority}
        sortOrder={articleData.sortOrder}
        totalSubstances={articleData.totalSubstances}
      />

      <SubstanceEditorOutputSection
        streamedOutput={draft.streamedOutput}
        outputViewMode={draft.outputViewMode}
        formDirty={draft.formDirty}
        formParseError={draft.formParseError}
        formArticleOverride={draft.formArticleOverride}
        selectedSubstanceSlug={articleData.selectedSubstanceSlug}
        onOutputViewModeChange={draft.handleOutputViewModeChange}
        onCopy={draft.handleCopy}
        onDownload={draft.handleDownload}
        onOutputChange={draft.setStreamedOutput}
        onFormMutate={draft.handleFormMutate}
        saveError={draft.saveError}
        formRef={draft.formRef}
      />

      {renderCommitPanel ? (
        <div>
          {renderCommitPanel(
            draft.streamedOutput ? (
              <Button
                variant="glass"
                size="pill"
                className="rounded-full"
                onClick={() => draft.handleSaveToDatabase("draft")}
                disabled={draft.isSaving}
              >
                Apply article changes
              </Button>
            ) : undefined,
          )}
        </div>
      ) : commitPanel ? <div>{commitPanel}</div> : null}
    </div>
  );
});

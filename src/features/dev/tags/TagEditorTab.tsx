import { useCallback, useEffect, useMemo, useReducer, useRef, type FormEvent } from "react";
import { Icon } from "@/components/common/Icon";

import { buildTagRegistry } from "@/utils/data/tagRegistry";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { SectionCard } from "@/components/common/SectionCard";
import { useDevMode } from "../context/DevModeContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getDevNoticeRenderProps } from "@/features/dev/notices/devNoticeLifecycle";

import { TagListPanel } from "./TagListPanel";
import { TagDetailPanel } from "./TagDetailPanel";
import { TagMutationForms } from "./TagMutationForms";
import type { TagEditorTabProps } from "./types";
import {
  createTagEditorState,
  getFilteredTags,
  getSelectedUsage,
  getTotalTags,
  runTagEditorMutation,
  tagEditorReducer,
} from "./tagEditorStateMachine";

export function TagEditorTab({
  commitPanel,
  datasetMarkdown,
  hasDatasetChanges,
  onCopyDatasetMarkdown,
  onDownloadDatasetMarkdown,
}: TagEditorTabProps) {
  const { articles, replaceArticles } = useDevMode();

  const [state, dispatch] = useReducer(tagEditorReducer, articles, createTagEditorState);
  const handledEffectIds = useRef(new Set<number>());
  const registry = useMemo(() => buildTagRegistry(articles), [articles]);

  useEffect(() => {
    dispatch({ type: "articlesChanged", registry });
  }, [registry]);

  const filteredTags = useMemo(() => getFilteredTags(state), [state]);
  const selectedUsage = useMemo(() => getSelectedUsage(state), [state]);
  const totalTags = useMemo(() => getTotalTags(state), [state]);

  useEffect(() => {
    const effect = state.pendingEffect;
    if (!effect) {
      return;
    }
    if (handledEffectIds.current.has(effect.id)) {
      return;
    }
    handledEffectIds.current.add(effect.id);

    if (effect.kind === "tagMutation") {
      try {
        const result = runTagEditorMutation(articles, effect.mutation);
        if (result.changes.length > 0) {
          replaceArticles(result.articles);
        }
        dispatch({ type: "mutationSucceeded", effectId: effect.id, result });
      } catch (error) {
        console.error("Tag mutation failed", error);
        dispatch({
          type: "mutationFailed",
          effectId: effect.id,
          message: error instanceof Error ? error.message : "Tag mutation failed. Check console for details.",
        });
      }
      return;
    }

    if (effect.kind === "copyDiff") {
      void onCopyDatasetMarkdown()
        .then(() => dispatch({ type: "effectCompleted", effectId: effect.id }))
        .catch(() => dispatch({ type: "effectFailed", effectId: effect.id, message: "Failed to copy diff. Try again." }));
      return;
    }

    try {
      onDownloadDatasetMarkdown();
      dispatch({ type: "effectCompleted", effectId: effect.id });
    } catch {
      dispatch({ type: "effectFailed", effectId: effect.id, message: "Diff download failed. Try again." });
    }
  }, [articles, onCopyDatasetMarkdown, onDownloadDatasetMarkdown, replaceArticles, state.pendingEffect]);

  const handleRename = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      dispatch({ type: "renameSubmitted" });
    },
    [],
  );

  const handleMove = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      dispatch({ type: "moveSubmitted" });
    },
    [],
  );

  const handleDelete = useCallback(() => {
    dispatch({ type: "deleteSubmitted" });
  }, []);

  const handleCopyDatasetMarkdown = useCallback(async () => {
    dispatch({ type: "copyDiffRequested", hasDatasetChanges });
  }, [hasDatasetChanges]);

  const handleDownloadDatasetMarkdown = useCallback(() => {
    dispatch({ type: "downloadDiffRequested", hasDatasetChanges });
  }, [hasDatasetChanges]);
  const noticeRenderProps = state.notice
    ? getDevNoticeRenderProps({
        status: state.notice.type,
        severity: state.notice.type === "error" ? "danger" : "success",
      })
    : null;

  return (
    <div className="mt-10 space-y-6">
      {/* Header Section */}
      <SectionCard className="space-y-4 bg-white/[0.04]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-fuchsia-200">Tag Editor</h2>
            <p className="mt-1 text-sm text-white/65">
              Rename, reclassify, or delete existing tags across the draft dataset. Changes apply instantly to the in-memory
              articles and downstream Dev tools.
            </p>
          </div>
          <Button
            variant="pill"
            size="pill"
            onClick={() => dispatch({ type: "snapshotRefreshed", registry: buildTagRegistry(articles) })}
          >
            <Icon icon="lucide:refresh-cw" size={16} />
            Refresh snapshot
          </Button>
        </div>
        <div className="text-xs text-white/55">
          <span className="font-semibold text-white/70">{totalTags}</span> unique tags detected across the dataset.
        </div>
      </SectionCard>

      {state.notice && noticeRenderProps && (
        <Alert variant={noticeRenderProps.variant} aria-live={noticeRenderProps.ariaLive}>
          <AlertDescription>{state.notice.message}</AlertDescription>
        </Alert>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-[21rem_1fr]">
        <TagListPanel
          activeField={state.activeField}
          onFieldChange={(field) => dispatch({ type: "fieldSelected", field })}
          searchQuery={state.searchQuery}
          onSearchChange={(query) => dispatch({ type: "searchChanged", query })}
          filteredTags={filteredTags}
          selected={state.selected}
          onSelectUsage={(usage) => dispatch({ type: "tagSelected", usage })}
        />

        <div className="space-y-4">
          {selectedUsage ? (
            <>
              <TagDetailPanel selectedUsage={selectedUsage} />
              <TagMutationForms
                selectedUsage={selectedUsage}
                renameValue={state.renameValue}
                onRenameValueChange={(value) => dispatch({ type: "renameDraftChanged", value })}
                onRename={handleRename}
                moveTargetField={state.moveTargetField}
                onMoveTargetFieldChange={(field) => dispatch({ type: "moveTargetFieldChanged", field })}
                moveLabel={state.moveLabel}
                onMoveLabelChange={(value) => dispatch({ type: "moveDraftChanged", value })}
                keepSourceCopy={state.keepSourceCopy}
                onKeepSourceCopyChange={(keepSourceCopy) => dispatch({ type: "sourceCopyChanged", keepSourceCopy })}
                onMove={handleMove}
                deleteConfirmed={state.deleteConfirmed}
                onDeleteConfirmedChange={(confirmed) => dispatch({ type: "deleteConfirmationChanged", confirmed })}
                onDelete={handleDelete}
                isApplying={state.isApplying}
              />
            </>
          ) : (
            <SectionCard className="flex h-full min-h-[24rem] items-center justify-center bg-white/[0.03]">
              <p className="max-w-sm text-center text-sm text-white/55">
                No tags found for this field. Choose another field or refresh the snapshot to rebuild the registry.
              </p>
            </SectionCard>
          )}
        </div>
      </div>

      {/* Changelog Section */}
      <SectionCard className="space-y-4 bg-white/[0.03]">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-fuchsia-200">Pending changelog</h2>
          <p className="text-sm text-white/65">
            Review the diff output generated from all in-memory edits before committing your changes.
          </p>
        </div>
        <DiffPreview
          diffText={
            hasDatasetChanges && datasetMarkdown.trim().length > 0
              ? datasetMarkdown
              : "# Dataset\n\nNo differences detected."
          }
          className="max-h-72"
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <Button
            variant="glass"
            size="xs"
            className="rounded-full"
            onClick={handleCopyDatasetMarkdown}
            disabled={!hasDatasetChanges || state.isApplying}
          >
            <Icon icon="lucide:copy" size={14} />
            Copy diff
          </Button>
          <Button
            variant="glass"
            size="xs"
            className="rounded-full"
            onClick={handleDownloadDatasetMarkdown}
            disabled={!hasDatasetChanges || state.isApplying}
          >
            <Icon icon="lucide:download" size={14} />
            Download .diff
          </Button>
        </div>
      </SectionCard>

      {commitPanel ? <div>{commitPanel}</div> : null}
    </div>
  );
}

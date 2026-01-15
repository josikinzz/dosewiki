import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "../../common/Icon";

import {
  type TagMutation,
  TAG_FIELDS,
  applyTagMutation,
  buildTagRegistry,
  getTagUsage,
  normalizeTagLabel,
  summarizeMutation,
  toTagKey,
  type TagField,
  type TagUsage,
} from "../../../utils/data/tagRegistry";
import { DiffPreview } from "../../common/DiffPreview";
import { SectionCard } from "../../common/SectionCard";
import { useDevMode } from "../DevModeContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { TagListPanel } from "./TagListPanel";
import { TagDetailPanel } from "./TagDetailPanel";
import { TagMutationForms } from "./TagMutationForms";
import type { Notice, SelectedTag, TagEditorTabProps } from "./types";

const getDefaultTargetField = (source: TagField): TagField => {
  for (const candidate of TAG_FIELDS) {
    if (candidate !== source) {
      return candidate;
    }
  }
  return source;
};

export function TagEditorTab({
  commitPanel,
  datasetMarkdown,
  hasDatasetChanges,
  onCopyDatasetMarkdown,
  onDownloadDatasetMarkdown,
}: TagEditorTabProps) {
  const { articles, replaceArticles } = useDevMode();

  const [registryVersion, setRegistryVersion] = useState(0);
  const [activeField, setActiveField] = useState<TagField>("index_categories");
  const [selected, setSelected] = useState<SelectedTag | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [moveTargetField, setMoveTargetField] = useState<TagField>(() => getDefaultTargetField("index_categories"));
  const [moveLabel, setMoveLabel] = useState("");
  const [keepSourceCopy, setKeepSourceCopy] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const registry = useMemo(() => buildTagRegistry(articles), [articles, registryVersion]);

  const fieldTags = registry.byField[activeField] ?? [];

  const filteredTags = useMemo(() => {
    if (!fieldTags || fieldTags.length === 0) {
      return [];
    }
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return fieldTags;
    }
    return fieldTags.filter((usage) => usage.tag.toLowerCase().includes(query));
  }, [fieldTags, searchQuery]);

  const selectedUsage = useMemo(() => {
    if (!selected) {
      return undefined;
    }
    const usage = getTagUsage(registry, selected.field, selected.key);
    return usage ?? undefined;
  }, [registry, selected]);

  useEffect(() => {
    const available = registry.byField[activeField];

    if (!selected) {
      if (available.length === 0) {
        setRenameValue("");
        setMoveLabel("");
        return;
      }

      const next = available[0];
      setSelected({ field: next.field, key: next.key });
      setRenameValue(next.tag);
      setMoveLabel(next.tag);
      setMoveTargetField(getDefaultTargetField(next.field));
      setKeepSourceCopy(false);
      setDeleteConfirmed(false);
      setNotice(null);
      return;
    }

    if (selected.field !== activeField) {
      if (available.length === 0) {
        setSelected(null);
        setRenameValue("");
        setMoveLabel("");
        setKeepSourceCopy(false);
        setDeleteConfirmed(false);
        setNotice(null);
        return;
      }

      const next = available[0];
      setSelected({ field: next.field, key: next.key });
      setRenameValue(next.tag);
      setMoveLabel(next.tag);
      setMoveTargetField(getDefaultTargetField(next.field));
      setKeepSourceCopy(false);
      setDeleteConfirmed(false);
      setNotice(null);
    }
  }, [activeField, registry, selected]);

  const handleSelectUsage = useCallback((usage: TagUsage) => {
    setActiveField(usage.field);
    setSelected({ field: usage.field, key: usage.key });
    setRenameValue(usage.tag);
    setMoveLabel(usage.tag);
    setMoveTargetField(getDefaultTargetField(usage.field));
    setKeepSourceCopy(false);
    setDeleteConfirmed(false);
    setNotice(null);
  }, []);

  const runMutation = useCallback(
    (mutation: TagMutation, successPrefix: string) => {
      setIsApplying(true);
      setNotice(null);
      try {
        const result = applyTagMutation(articles, mutation);
        if (result.changes.length === 0) {
          setNotice({ type: "error", message: "No articles were updated. The tag may not be in use." });
          return null;
        }

        replaceArticles(result.articles);
        const summary = summarizeMutation(result);
        const suffix = summary.affectedCount === 1 ? "article" : "articles";
        setNotice({ type: "success", message: `${successPrefix} ${summary.affectedCount} ${suffix} updated.` });
        setRegistryVersion((previous) => previous + 1);
        return result;
      } catch (error) {
        console.error("Tag mutation failed", error);
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "Tag mutation failed. Check console for details.",
        });
        return null;
      } finally {
        setIsApplying(false);
      }
    },
    [articles, replaceArticles],
  );

  const handleRename = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedUsage) {
        return;
      }

      const normalized = normalizeTagLabel(renameValue);
      if (!normalized) {
        setNotice({ type: "error", message: "Enter a new tag label before renaming." });
        return;
      }

      if (normalizeTagLabel(selectedUsage.tag) === normalized) {
        setNotice({ type: "error", message: "New tag label matches the existing label." });
        return;
      }

      const mutation: TagMutation = {
        type: "rename",
        field: selectedUsage.field,
        fromTag: selectedUsage.tag,
        toTag: normalized,
      };

      const result = runMutation(mutation, "Tag renamed.");
      if (result) {
        const nextKey = toTagKey(normalized);
        setSelected({ field: selectedUsage.field, key: nextKey });
        setRenameValue(normalized);
        setMoveLabel(normalized);
        setDeleteConfirmed(false);
      }
    },
    [renameValue, runMutation, selectedUsage],
  );

  const handleMove = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedUsage) {
        return;
      }

      if (moveTargetField === selectedUsage.field) {
        setNotice({ type: "error", message: "Choose a different destination field before moving." });
        return;
      }

      const normalizedMove = normalizeTagLabel(moveLabel);
      const desiredLabel = normalizedMove || selectedUsage.tag;
      const mutation: TagMutation = {
        type: "move",
        sourceField: selectedUsage.field,
        targetField: moveTargetField,
        tag: selectedUsage.tag,
        renamedTag: normalizedMove || undefined,
        keepSourceCopy,
      };

      const result = runMutation(mutation, keepSourceCopy ? "Tag copied." : "Tag moved.");
      if (result) {
        const nextKey = toTagKey(desiredLabel);
        setActiveField(moveTargetField);
        setSelected({ field: moveTargetField, key: nextKey });
        setRenameValue(desiredLabel);
        setMoveLabel(desiredLabel);
        setMoveTargetField(getDefaultTargetField(moveTargetField));
        setKeepSourceCopy(false);
        setDeleteConfirmed(false);
      }
    },
    [keepSourceCopy, moveLabel, moveTargetField, runMutation, selectedUsage],
  );

  const handleDelete = useCallback(() => {
    if (!selectedUsage) {
      return;
    }
    if (!deleteConfirmed) {
      setNotice({ type: "error", message: "Confirm the deletion before proceeding." });
      return;
    }

    const mutation: TagMutation = {
      type: "delete",
      field: selectedUsage.field,
      tag: selectedUsage.tag,
    };

    const result = runMutation(mutation, "Tag deleted.");
    if (result) {
      setDeleteConfirmed(false);
      setSelected(null);
      setRenameValue("");
      setMoveLabel("");
      setMoveTargetField(getDefaultTargetField(selectedUsage.field));
    }
  }, [deleteConfirmed, runMutation, selectedUsage]);

  const totalTags = useMemo(() => TAG_FIELDS.reduce((acc, field) => acc + registry.byField[field].length, 0), [registry]);

  const handleCopyDatasetMarkdown = useCallback(async () => {
    try {
      if (!hasDatasetChanges) {
        setNotice({ type: "error", message: "No dataset differences to copy yet." });
        return;
      }
      await onCopyDatasetMarkdown();
      setNotice({ type: "success", message: "Dataset diff copied to clipboard." });
    } catch {
      setNotice({ type: "error", message: "Failed to copy diff. Try again." });
    }
  }, [hasDatasetChanges, onCopyDatasetMarkdown]);

  const handleDownloadDatasetMarkdown = useCallback(() => {
    if (!hasDatasetChanges) {
      setNotice({ type: "error", message: "No dataset differences to download yet." });
      return;
    }
    try {
      onDownloadDatasetMarkdown();
      setNotice({ type: "success", message: "Dataset diff downloaded." });
    } catch {
      setNotice({ type: "error", message: "Diff download failed. Try again." });
    }
  }, [hasDatasetChanges, onDownloadDatasetMarkdown]);

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
            onClick={() => setRegistryVersion((previous) => previous + 1)}
          >
            <Icon icon="lucide:refresh-cw" size={16} />
            Refresh snapshot
          </Button>
        </div>
        <div className="text-xs text-white/55">
          <span className="font-semibold text-white/70">{totalTags}</span> unique tags detected across the dataset.
        </div>
      </SectionCard>

      {notice && (
        <Alert variant={notice.type === "error" ? "destructive" : "success"}>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-[21rem,1fr]">
        <TagListPanel
          activeField={activeField}
          onFieldChange={setActiveField}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filteredTags={filteredTags}
          selected={selected}
          onSelectUsage={handleSelectUsage}
        />

        <div className="space-y-4">
          {selectedUsage ? (
            <>
              <TagDetailPanel selectedUsage={selectedUsage} />
              <TagMutationForms
                selectedUsage={selectedUsage}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onRename={handleRename}
                moveTargetField={moveTargetField}
                onMoveTargetFieldChange={setMoveTargetField}
                moveLabel={moveLabel}
                onMoveLabelChange={setMoveLabel}
                keepSourceCopy={keepSourceCopy}
                onKeepSourceCopyChange={setKeepSourceCopy}
                onMove={handleMove}
                deleteConfirmed={deleteConfirmed}
                onDeleteConfirmedChange={setDeleteConfirmed}
                onDelete={handleDelete}
                isApplying={isApplying}
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
            disabled={!hasDatasetChanges || isApplying}
          >
            <Icon icon="lucide:copy" size={14} />
            Copy diff
          </Button>
          <Button
            variant="glass"
            size="xs"
            className="rounded-full"
            onClick={handleDownloadDatasetMarkdown}
            disabled={!hasDatasetChanges || isApplying}
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

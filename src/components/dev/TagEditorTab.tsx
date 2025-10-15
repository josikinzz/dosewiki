import { AlertTriangle, ArrowLeftRight, Copy, Download, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { TagMutation, TAG_FIELD_LABELS, TAG_FIELDS, applyTagMutation, buildTagRegistry, getTagUsage, normalizeTagLabel, summarizeMutation, toTagKey, type TagField, type TagUsage } from "../../utils/tagRegistry";
import { DiffPreview } from "../common/DiffPreview";
import { SectionCard } from "../common/SectionCard";
import { useDevMode } from "./DevModeContext";

type Notice = {
  type: "success" | "error";
  message: string;
};

const baseInputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";

const subtleInputClass =
  "w-full rounded-full border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";

const pillButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white";

const neutralButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/75 transition hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10 hover:text-white";

const dangerButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-rose-500/50 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60";

type SelectedTag = {
  field: TagField;
  key: string;
};

type TagEditorTabProps = {
  commitPanel?: ReactNode;
  datasetMarkdown: string;
  hasDatasetChanges: boolean;
  onCopyDatasetMarkdown: () => Promise<void>;
  onDownloadDatasetMarkdown: () => void;
};

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
  const [activeField, setActiveField] = useState<TagField>("categories");
  const [selected, setSelected] = useState<SelectedTag | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [moveTargetField, setMoveTargetField] = useState<TagField>(() => getDefaultTargetField("categories"));
  const [moveLabel, setMoveLabel] = useState("");
  const [keepSourceCopy, setKeepSourceCopy] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const registry = useMemo(() => buildTagRegistry(articles), [articles, registryVersion]);

  const fieldTags = registry.byField[activeField];

  const filteredTags = useMemo(() => {
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
      <SectionCard className="space-y-4 bg-white/[0.04]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Dataset Taxonomy</p>
            <h2 className="text-xl font-semibold text-fuchsia-200">Tag Editor</h2>
            <p className="mt-1 text-sm text-white/65">
              Rename, reclassify, or delete existing tags across the draft dataset. Changes apply instantly to the in-memory
              articles and downstream Dev tools.
            </p>
          </div>
          <button
            type="button"
            className={neutralButtonClass}
            onClick={() => setRegistryVersion((previous) => previous + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" focusable="false" />
            Refresh snapshot
          </button>
        </div>
        <div className="text-xs text-white/55">
          <span className="font-semibold text-white/70">{totalTags}</span> unique tags detected across the dataset.
        </div>
      </SectionCard>

      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.type === "error"
              ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
              : "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {notice.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[21rem,1fr]">
        <SectionCard className="space-y-4 bg-white/[0.03]">
          <div className="flex flex-col gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45" htmlFor="tag-field-filter">
              Field
            </label>
            <div className="relative">
              <select
                id="tag-field-filter"
                className={subtleInputClass}
                value={activeField}
                onChange={(event) => setActiveField(event.target.value as TagField)}
              >
                {TAG_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {TAG_FIELD_LABELS[field]}
                  </option>
                ))}
              </select>
              <ArrowLeftRight className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45" htmlFor="tag-search">
              Search tags
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
              <input
                id="tag-search"
                type="search"
                className={`${baseInputClass} pl-9`}
                placeholder="Filter by label"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {filteredTags.length === 0 ? (
              <p className="text-sm text-white/50">No tags match the current filters.</p>
            ) : (
              filteredTags.map((usage) => {
                const isActive = selected?.field === usage.field && selected.key === usage.key;
                return (
                  <button
                    key={`${usage.field}-${usage.key}`}
                    type="button"
                    onClick={() => handleSelectUsage(usage)}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                      isActive
                        ? "border-fuchsia-400/70 bg-fuchsia-500/15 text-white shadow-inner shadow-fuchsia-500/25"
                        : "border-white/10 bg-white/5 text-white/75 hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{usage.tag}</span>
                      <span className="text-xs uppercase tracking-wide text-white/55">{usage.count} uses</span>
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/45">{TAG_FIELD_LABELS[usage.field]}</p>
                  </button>
                );
              })
            )}
          </div>
        </SectionCard>

        <div className="space-y-4">
          {selectedUsage ? (
            <>
              <SectionCard className="space-y-4 bg-white/[0.03]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Selected Tag</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-base font-semibold text-white">
                      {selectedUsage.tag}
                    </span>
                    <span className="text-xs uppercase tracking-[0.28em] text-white/45">
                      {TAG_FIELD_LABELS[selectedUsage.field]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-white/65">
                    Used in <span className="font-semibold text-white/80">{selectedUsage.count}</span> article{selectedUsage.count === 1 ? "" : "s"}.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Affected articles</h3>
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                    {selectedUsage.articleRefs.map((ref) => {
                      const label = ref.title?.trim()?.length ? ref.title : `Article ${ref.index + 1}`;
                      const identifier = typeof ref.id === "number" ? `#${ref.id}` : `Index ${ref.index + 1}`;
                      return (
                        <div key={`${ref.index}-${ref.id ?? "no-id"}`} className="flex items-center justify-between gap-3">
                          <span className="truncate text-white/80">{label}</span>
                          <span className="text-xs uppercase tracking-[0.28em] text-white/45">{identifier}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </SectionCard>

              <SectionCard className="space-y-5 bg-white/[0.03]">
                <form className="space-y-3" onSubmit={handleRename}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold uppercase tracking-wide text-white/60">Rename</span>
                    <Pencil className="h-4 w-4 text-white/45" aria-hidden="true" focusable="false" />
                  </div>
                  <input
                    type="text"
                    className={baseInputClass}
                    value={renameValue}
                    placeholder="Enter new label"
                    onChange={(event) => setRenameValue(event.target.value)}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-white/55">
                      Updates every occurrence of this tag across the dataset.
                    </p>
                    <button
                      type="submit"
                      className={pillButtonClass}
                      disabled={isApplying}
                    >
                      Rename tag
                    </button>
                  </div>
                </form>

                <div className="h-px w-full bg-white/10" />

                <form className="space-y-3" onSubmit={handleMove}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold uppercase tracking-wide text-white/60">Move / Reclassify</span>
                    <ArrowLeftRight className="h-4 w-4 text-white/45" aria-hidden="true" focusable="false" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45" htmlFor="move-target-field">
                        Destination field
                      </label>
                      <select
                        id="move-target-field"
                        className={subtleInputClass}
                        value={moveTargetField}
                        onChange={(event) => setMoveTargetField(event.target.value as TagField)}
                      >
                        {TAG_FIELDS.filter((field) => field !== selectedUsage.field).map((field) => (
                          <option key={field} value={field}>
                            {TAG_FIELD_LABELS[field]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45" htmlFor="move-label">
                        Optional rename
                      </label>
                      <input
                        id="move-label"
                        type="text"
                        className={baseInputClass}
                        value={moveLabel}
                        onChange={(event) => setMoveLabel(event.target.value)}
                        placeholder={selectedUsage.tag}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-white/65">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/25 bg-slate-950/60 text-fuchsia-400 focus:ring-fuchsia-300/40"
                      checked={keepSourceCopy}
                      onChange={(event) => setKeepSourceCopy(event.target.checked)}
                    />
                    Keep original tag in {TAG_FIELD_LABELS[selectedUsage.field]}
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-white/55">
                      Moves or copies the tag to the chosen field and merges duplicates automatically.
                    </p>
                    <button type="submit" className={pillButtonClass} disabled={isApplying}>
                      {keepSourceCopy ? "Copy tag" : "Move tag"}
                    </button>
                  </div>
                </form>

                <div className="h-px w-full bg-white/10" />

                <div className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-rose-200">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" focusable="false" />
                    Danger zone
                  </div>
                  <p className="text-sm text-rose-100/80">
                    Removing this tag will delete it from every article where it appears. This cannot be undone unless you reset the
                    dataset.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-rose-100/75">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-rose-300/50 bg-slate-950/60 text-rose-400 focus:ring-rose-300/40"
                      checked={deleteConfirmed}
                      onChange={(event) => setDeleteConfirmed(event.target.checked)}
                    />
                    I understand this will permanently remove the tag.
                  </label>
                  <button type="button" className={dangerButtonClass} onClick={handleDelete} disabled={isApplying || !deleteConfirmed}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" focusable="false" />
                    Delete tag everywhere
                  </button>
                </div>
              </SectionCard>
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
      <SectionCard className="space-y-4 bg-white/[0.03]">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Dataset Diff</p>
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
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleCopyDatasetMarkdown}
            disabled={!hasDatasetChanges || isApplying}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy diff
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleDownloadDatasetMarkdown}
            disabled={!hasDatasetChanges || isApplying}
          >
            <Download className="h-3.5 w-3.5" />
            Download .diff
          </button>
        </div>
      </SectionCard>
      {commitPanel ? <div>{commitPanel}</div> : null}
    </div>
  );
}

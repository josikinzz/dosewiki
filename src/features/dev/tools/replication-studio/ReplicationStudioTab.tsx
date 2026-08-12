"use client";

/**
 * Replication Studio — `/dev` → Replications.
 *
 * One screen for the whole media table: a facet rail that organizes it, a grid
 * that shows it, and a drawer that edits it. It deliberately does NOT talk to
 * Convex from the browser: every read and write goes through the editor-gated
 * `/api/dev/replications*` routes, the same transport the molecule editor uses,
 * so the privileged deployment URL and the `replicationMaintenance` token stay
 * on the server and the tool always sees the deployment it writes to.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ActionNotice,
  EditorPanel,
  EditorPanelBody,
  TagToken,
  type ActionNoticeTone,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { IncomingTray, type IncomingFile } from "./IncomingTray";
import { ReplicationEditorDrawer, type BulkEdit, type SingleEditDraft } from "./ReplicationEditorDrawer";
import { ReplicationFacetRail } from "./ReplicationFacetRail";
import { ReplicationGrid } from "./ReplicationGrid";
import {
  EMPTY_STUDIO_FACETS,
  NO_EFFECT_KEY,
  activeFacetCount,
  buildReplicationSlug,
  fileFormat,
  filterStudioRows,
  groupStudioRows,
  inferMediaType,
  titleFromFileName,
  toggleFacetValue,
  type StudioEffectOption,
  type StudioFacetKind,
  type StudioFacets,
  type StudioGroupBy,
  type StudioRow,
} from "./replicationStudioModel";

const CORPUS_API = "/api/dev/replications";
const EDITORIAL_API = "/api/dev/replications/editorial";
const UPLOAD_URL_API = "/api/dev/replications/upload-url";

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type Feedback = { tone: ActionNoticeTone; message: string };

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function ReplicationStudioTab() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [rows, setRows] = useState<StudioRow[]>([]);
  const [effects, setEffects] = useState<StudioEffectOption[]>([]);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<StudioGroupBy>("none");
  const [facets, setFacets] = useState<StudioFacets>(EMPTY_STUDIO_FACETS);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const objectUrls = useRef<Set<string>>(new Set());

  const loadCorpus = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const response = await fetch(CORPUS_API);
      if (!response.ok) {
        setLoad({ status: "error", message: await readError(response, "Failed to load the corpus.") });
        return;
      }
      const payload = (await response.json()) as { rows: StudioRow[]; effects: StudioEffectOption[] };
      setRows(payload.rows);
      setEffects(payload.effects);
      setLoad({ status: "ready" });
    } catch {
      setLoad({ status: "error", message: "Failed to reach the corpus endpoint." });
    }
  }, []);

  useEffect(() => {
    void loadCorpus();
  }, [loadCorpus]);

  // Object URLs outlive React state unless they are revoked by hand.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const effectNames = useMemo(
    () => new Map(effects.map((effect) => [effect.slug, effect.name])),
    [effects],
  );
  const artists = useMemo(
    () => [...new Set(rows.map((row) => row.artist))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const visibleRows = useMemo(
    () => filterStudioRows(rows, { query, group, facets }),
    [rows, query, group, facets],
  );
  const groups = useMemo(() => groupStudioRows(visibleRows, group), [visibleRows, group]);
  const visibleIds = useMemo(() => groups.flatMap((entry) => entry.rows.map((row) => row.id)), [groups]);
  const selectedRows = useMemo(() => rows.filter((row) => selection.has(row.id)), [rows, selection]);

  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setAnchor(null);
  }, []);

  const onCardActivate = useCallback(
    (event: React.MouseEvent, id: string) => {
      setSelection((current) => {
        const next = new Set(current);
        if (event.shiftKey && anchor && visibleIds.includes(anchor)) {
          const from = visibleIds.indexOf(anchor);
          const to = visibleIds.indexOf(id);
          const [low, high] = from < to ? [from, to] : [to, from];
          if (!(event.ctrlKey || event.metaKey)) next.clear();
          for (let index = low; index <= high; index += 1) next.add(visibleIds[index]);
          return next;
        }
        if (event.ctrlKey || event.metaKey) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }
        const onlyThis = next.size === 1 && next.has(id);
        next.clear();
        if (!onlyThis) next.add(id);
        return next;
      });
      if (!event.shiftKey) setAnchor(id);
    },
    [anchor, visibleIds],
  );

  /* -------------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target) && /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "");

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === "Escape") {
        if (typing) {
          (target as HTMLElement).blur();
          return;
        }
        if (selection.size > 0) clearSelection();
        return;
      }
      if (typing) return;

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        if (visibleIds.length === 0) return;
        event.preventDefault();
        const perRow = 4;
        const step = event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowDown"
              ? perRow
              : -perRow;
        const current = anchor && visibleIds.includes(anchor) ? visibleIds.indexOf(anchor) : -1;
        const nextIndex = current === -1
          ? 0
          : Math.max(0, Math.min(visibleIds.length - 1, current + step));
        const id = visibleIds[nextIndex];
        setSelection((existing) => (event.shiftKey ? new Set([...existing, id]) : new Set([id])));
        setAnchor(id);
        document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [anchor, clearSelection, selection.size, visibleIds]);

  /* ----------------------------------------------------------------- edits */

  const saveSingle = useCallback(
    async (row: StudioRow, draft: SingleEditDraft) => {
      setBusy(true);
      setFeedback(null);
      try {
        const response = await fetch(EDITORIAL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "single",
            id: row.id,
            expected: {
              title: row.title,
              artist: row.artist,
              role: row.role,
              effect_slug: row.effect_slug,
              credit_line: row.credit_line,
              effect_tags: row.effect_tags,
            },
            updates: {
              title: draft.title.trim(),
              artist: draft.artist.trim(),
              role: draft.role,
              effect_slug: draft.effect_slug,
              credit_line: draft.credit_line?.trim() ? draft.credit_line.trim() : null,
              effect_tags: draft.effect_tags,
            },
          }),
        });
        if (!response.ok) {
          setFeedback({ tone: "danger", message: await readError(response, "Save failed.") });
          return;
        }
        setFeedback({ tone: "success", message: `Saved ${row.slug}.` });
        await loadCorpus();
      } catch {
        setFeedback({ tone: "danger", message: "Save failed: the editor endpoint is unreachable." });
      } finally {
        setBusy(false);
      }
    },
    [loadCorpus],
  );

  const applyBulk = useCallback(
    async (targets: readonly StudioRow[], edit: BulkEdit) => {
      setBusy(true);
      setFeedback(null);
      try {
        const response = await fetch(EDITORIAL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "bulk", ids: targets.map((row) => row.id), ...edit }),
        });
        if (!response.ok) {
          setFeedback({ tone: "danger", message: await readError(response, "Bulk edit failed.") });
          return;
        }
        const payload = (await response.json()) as { updated: number };
        setFeedback({ tone: "success", message: `Updated ${payload.updated} rows.` });
        await loadCorpus();
      } catch {
        setFeedback({ tone: "danger", message: "Bulk edit failed: the editor endpoint is unreachable." });
      } finally {
        setBusy(false);
      }
    },
    [loadCorpus],
  );

  const markSelectionAsFigure = useCallback(() => {
    void applyBulk(selectedRows, { role: "figure" });
  }, [applyBulk, selectedRows]);

  /* ---------------------------------------------------------------- upload */

  const addFiles = useCallback((fileList: FileList | null) => {
    const files = [...(fileList ?? [])];
    if (files.length === 0) return;

    setIncoming((current) => [
      ...current,
      ...files.map((file, index) => {
        const type = inferMediaType(file);
        const previewUrl = type === "audio" ? null : URL.createObjectURL(file);
        if (previewUrl) objectUrls.current.add(previewUrl);
        return {
          id: `incoming-${Date.now()}-${index}`,
          file,
          name: file.name,
          type,
          previewUrl,
          title: titleFromFileName(file.name),
          artist: "",
          effectSlug: "",
          effectTags: [],
          status: "draft" as const,
        };
      }),
    ]);
  }, []);

  const discardIncoming = useCallback((id: string) => {
    setIncoming((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        objectUrls.current.delete(item.previewUrl);
      }
      return current.filter((entry) => entry.id !== id);
    });
  }, []);

  const clearIncoming = useCallback(() => {
    setIncoming((current) => {
      for (const item of current) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
          objectUrls.current.delete(item.previewUrl);
        }
      }
      return [];
    });
  }, []);

  const patchIncoming = useCallback((id: string, patch: Partial<IncomingFile>) => {
    setIncoming((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  /**
   * Upload, then insert. The bytes go straight from the browser to the storage
   * URL Convex minted, and only the resulting storage id comes back through the
   * row-creation route — the same shape as the import scripts.
   */
  const addToLibrary = useCallback(
    async (item: IncomingFile) => {
      patchIncoming(item.id, { status: "uploading", error: undefined });
      try {
        const urlResponse = await fetch(UPLOAD_URL_API, { method: "POST" });
        if (!urlResponse.ok) {
          patchIncoming(item.id, {
            status: "error",
            error: await readError(urlResponse, "Could not start the upload."),
          });
          return;
        }
        const { uploadUrl } = (await urlResponse.json()) as { uploadUrl: string };

        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": item.file.type || "application/octet-stream" },
          body: item.file,
        });
        if (!uploadResponse.ok) {
          patchIncoming(item.id, { status: "error", error: "Convex storage rejected the file." });
          return;
        }
        const { storageId } = (await uploadResponse.json()) as { storageId: string };

        const slug = buildReplicationSlug(
          item.title,
          item.artist,
          rows.map((row) => row.slug),
        );

        const createResponse = await fetch(CORPUS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            title: item.title.trim(),
            artist: item.artist.trim(),
            role: "replication",
            type: item.type,
            storageId,
            effectSlug: item.effectSlug,
            effectTags: item.effectTags,
            format: fileFormat(item.name),
            fileSize: item.file.size,
          }),
        });
        if (!createResponse.ok) {
          patchIncoming(item.id, {
            status: "error",
            error: await readError(createResponse, "Could not create the row."),
          });
          return;
        }

        discardIncoming(item.id);
        setFeedback({ tone: "success", message: `Added ${slug} to the library.` });
        await loadCorpus();
      } catch {
        patchIncoming(item.id, { status: "error", error: "Upload failed: the endpoint is unreachable." });
      }
    },
    [discardIncoming, loadCorpus, patchIncoming, rows],
  );

  /* ------------------------------------------------------------- drag veil */

  useEffect(() => {
    const carriesFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes("Files");

    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const onDragLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(event.dataTransfer?.files ?? null);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  /* ------------------------------------------------------------------ view */

  const chips = useMemo(() => {
    const entries: { kind: StudioFacetKind; key: string; label: string }[] = [];
    for (const key of facets.type) entries.push({ kind: "type", key, label: `Type: ${key}` });
    for (const key of facets.role) entries.push({ kind: "role", key, label: `Role: ${key}` });
    for (const key of facets.artist) entries.push({ kind: "artist", key, label: `Artist: ${key}` });
    for (const key of facets.effect) {
      entries.push({
        kind: "effect",
        key,
        label: `Effect: ${key === NO_EFFECT_KEY ? "No effect" : effectNames.get(key) ?? key}`,
      });
    }
    return entries;
  }, [facets, effectNames]);

  if (load.status === "loading") {
    return (
      <EditorPanel variant="empty" className="p-8 text-center text-sm">
        Loading the replication corpus…
      </EditorPanel>
    );
  }

  if (load.status === "error") {
    return (
      <EditorPanel variant="danger">
        <EditorPanelBody className="space-y-3">
          <p className="text-sm">{load.message}</p>
          <Button type="button" onClick={() => void loadCorpus()}>
            Try again
          </Button>
        </EditorPanelBody>
      </EditorPanel>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="theme-accent-emphasis font-display text-xl font-semibold">Replication Studio</h2>
          <span className="theme-text-faint text-xs uppercase tracking-[0.24em]">dev tool</span>
        </div>
        <p className="theme-text-faint font-mono text-xs">
          {rows.length} rows · {artists.length} artists ·{" "}
          {new Set(rows.map((row) => row.effect_slug).filter(Boolean)).size} effects
        </p>
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void loadCorpus()}>
          <Icon icon="lucide:refresh-cw" size={15} />
          Reload
        </Button>
        <Button type="button" variant="accent" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Icon icon="lucide:upload" size={15} />
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/mpeg,.mp3"
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </header>

      {feedback ? (
        <ActionNotice tone={feedback.tone} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </ActionNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        <ReplicationFacetRail
          rows={rows}
          effectNames={effectNames}
          query={query}
          onQueryChange={setQuery}
          group={group}
          onGroupChange={setGroup}
          facets={facets}
          onToggleFacet={(kind, key) => setFacets((current) => toggleFacetValue(current, kind, key))}
          searchInputRef={searchRef}
        />

        <main className="min-w-0 space-y-4">
          <IncomingTray
            items={incoming}
            effects={effects}
            artists={artists}
            onPatch={patchIncoming}
            onDiscard={discardIncoming}
            onClear={clearIncoming}
            onAdd={(item) => void addToLibrary(item)}
          />

          {chips.length > 0 || query.trim() ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <TagToken
                  key={`${chip.kind}:${chip.key}`}
                  variant="compact"
                  label={chip.label}
                  removeLabel={`Remove filter ${chip.label}`}
                  onRemove={() => setFacets((current) => toggleFacetValue(current, chip.kind, chip.key))}
                />
              ))}
              {query.trim() ? (
                <TagToken
                  variant="compact"
                  label={`“${query.trim()}”`}
                  removeLabel="Clear search"
                  onRemove={() => setQuery("")}
                />
              ) : null}
              {activeFacetCount(facets) > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFacets(EMPTY_STUDIO_FACETS);
                    setQuery("");
                  }}
                >
                  Clear all
                </Button>
              ) : null}
            </div>
          ) : null}

          {selection.size > 0 ? (
            <EditorPanel variant="toolbar" className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="theme-text-primary font-mono text-sm">{selection.size} selected</span>
              <Badge variant="secondary">bulk</Badge>
              <div className="flex-1" />
              <Button type="button" variant="glass" size="sm" disabled={busy} onClick={markSelectionAsFigure}>
                Mark as figure
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                Deselect
              </Button>
            </EditorPanel>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="theme-text-faint font-mono text-xs">
              {visibleRows.length} of {rows.length} shown
            </span>
            <span className="theme-text-faint text-xs">
              {group === "none" ? "Ungrouped" : `Grouped by ${group} · ${groups.length} groups`}
            </span>
          </div>

          <ReplicationGrid groups={groups} selection={selection} onCardActivate={onCardActivate} />
        </main>

        <ReplicationEditorDrawer
          selected={selectedRows}
          effects={effects}
          artists={artists}
          busy={busy}
          onSaveSingle={(row, draft) => void saveSingle(row, draft)}
          onApplyBulk={(targets, edit) => void applyBulk(targets, edit)}
          onDeselect={clearSelection}
        />
      </div>

      <div
        aria-hidden={!dragging}
        className={cn(
          "pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[var(--theme-shadow-strong)] transition-opacity",
          dragging ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="rounded-2xl border border-[color:var(--theme-frosted-panel-border)] bg-[var(--theme-panel-base)] px-8 py-6 text-center">
          <h3 className="theme-accent-emphasis font-display text-lg font-semibold">
            Drop images, videos, or MP3s
          </h3>
          <p className="theme-text-muted text-sm">They land in the Incoming tray before anything is written.</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { NoticeTone } from "@/features/dev/components";

import type { BulkEdit, SingleEditDraft } from "./ReplicationEditorDrawer";
import { readReplicationApiError as readError } from "./replicationStudioApi";
import type { StudioEffectOption, StudioRow } from "./replicationStudioModel";

const CORPUS_API = "/api/dev/replications";
const EDITORIAL_API = "/api/dev/replications/editorial";

type CorpusPayload = { rows: StudioRow[]; effects: StudioEffectOption[] };
export type CorpusLoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };
export type StudioFeedback = { tone: NoticeTone; message: string };

let cachedCorpus: CorpusPayload | null = null;

/** The editorial fields as loaded: the compare-and-swap guard every save sends. */
function expectedOf(row: StudioRow) {
  return {
    title: row.title,
    artist: row.artist,
    role: row.role,
    effect_slug: row.effect_slug,
    credit_line: row.credit_line,
    effect_tags: row.effect_tags,
    rights_status: row.rights_status ?? null,
    source_url: row.source_url ?? null,
  };
}

type BulkConflict = {
  id: string;
  slug: string | null;
  reason: string;
  code?: "stale" | "missing" | "incomplete" | "invalid";
};
type BulkResult = { updated: number; published?: string[]; conflicts?: BulkConflict[] };

/** One notice for a bulk result: what was written, what moved, what was refused. */
function bulkOutcome(edit: BulkEdit, total: number, payload: BulkResult): StudioFeedback {
  const conflicts = payload.conflicts ?? [];
  const publishing = edit.publish === true;
  const done = publishing ? (payload.published ?? []).length : payload.updated;
  if (conflicts.length === 0) {
    return publishing
      ? {
          tone: "success",
          message: `Published ${done} ${done === 1 ? "work" : "works"}. ${done === 1 ? "It is" : "They are"} live on the public site.`,
        }
      : { tone: "success", message: `Updated ${payload.updated} rows.` };
  }
  const moved = conflicts.filter((conflict) => (conflict.code ?? "stale") === "stale" || conflict.code === "missing");
  const refused = conflicts.filter((conflict) => conflict.code === "incomplete" || conflict.code === "invalid");
  const parts = [`${publishing ? "Published" : "Updated"} ${done} of ${total}.`];
  if (moved.length > 0) {
    parts.push(
      `Not written because someone changed or removed them after you loaded the studio: ${moved.map((conflict) => conflict.slug ?? conflict.id).join(", ")}. ` +
        "The library now shows their current values; apply again if the change still fits.",
    );
  }
  if (refused.length > 0) {
    parts.push(
      `Not written: ${refused.map((conflict) => `${conflict.slug ?? conflict.id} (${conflict.reason})`).join("; ")}.`,
    );
  }
  return { tone: "warning", message: parts.join(" ") };
}

/**
 * The corpus every workspace reads, and the editorial writes against it.
 * Each write reloads the corpus, so every workspace sees the stored values.
 */
export function useReplicationCorpus() {
  const [load, setLoad] = useState<CorpusLoadState>(
    cachedCorpus ? { status: "ready" } : { status: "loading" },
  );
  const [rows, setRows] = useState<StudioRow[]>(() => cachedCorpus?.rows ?? []);
  const [effects, setEffects] = useState<StudioEffectOption[]>(() => cachedCorpus?.effects ?? []);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<StudioFeedback | null>(null);

  const reload = useCallback(async () => {
    if (!cachedCorpus) setLoad({ status: "loading" });
    try {
      const response = await fetch(CORPUS_API);
      if (!response.ok) {
        setLoad({
          status: "error",
          message: await readError(response, "Failed to load the corpus."),
        });
        return;
      }
      const payload = (await response.json()) as CorpusPayload;
      cachedCorpus = payload;
      setRows(payload.rows);
      setEffects(payload.effects);
      setLoad({ status: "ready" });
    } catch {
      setLoad({ status: "error", message: "Could not reach the server to load replications." });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const effectNames = useMemo(
    () => new Map(effects.map((effect) => [effect.slug, effect.name])),
    [effects],
  );
  const artists = useMemo(
    () => [...new Set(rows.map((row) => row.artist))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

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
            expected: expectedOf(row),
            updates: {
              title: draft.title.trim(),
              artist: draft.artist.trim(),
              role: draft.role,
              effect_slug: draft.effect_slug,
              credit_line: draft.credit_line?.trim() ? draft.credit_line.trim() : null,
              effect_tags: draft.effect_tags,
              rights_status: draft.rights_status ?? null,
              source_url: draft.source_url?.trim() ? draft.source_url.trim() : null,
            },
          }),
        });
        if (!response.ok) {
          setFeedback({ tone: "danger", message: await readError(response, "Save failed.") });
          return;
        }
        setFeedback({ tone: "success", message: `Saved ${row.slug}.` });
        await reload();
      } catch {
        setFeedback({ tone: "danger", message: "Save failed: the server could not be reached." });
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  /**
   * Applies one bulk edit. Each row carries the values it was loaded with; the
   * server writes the rows that still match and names the rest. Resolves true
   * when the request went through, so the inspector can spend its draft.
   */
  const applyBulk = useCallback(
    async (targets: readonly StudioRow[], edit: BulkEdit): Promise<boolean> => {
      setBusy(true);
      setFeedback(null);
      try {
        const response = await fetch(EDITORIAL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "bulk",
            items: targets.map((row) => ({ id: row.id, expected: expectedOf(row) })),
            patch: edit,
          }),
        });
        if (!response.ok && response.status !== 409) {
          setFeedback({ tone: "danger", message: await readError(response, "Bulk edit failed.") });
          return false;
        }
        const payload = (await response.json()) as BulkResult;
        setFeedback(bulkOutcome(edit, targets.length, payload));
        await reload();
        return true;
      } catch {
        setFeedback({
          tone: "danger",
          message: "Bulk edit failed: the server could not be reached.",
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  /** Publishes unpublished works whose rights status and source are set. */
  const publishRows = useCallback(
    (targets: readonly StudioRow[]) => applyBulk(targets, { publish: true }),
    [applyBulk],
  );

  return {
    load,
    rows,
    effects,
    effectNames,
    artists,
    reload,
    busy,
    feedback,
    setFeedback,
    saveSingle,
    applyBulk,
    publishRows,
  };
}

export type ReplicationCorpus = ReturnType<typeof useReplicationCorpus>;

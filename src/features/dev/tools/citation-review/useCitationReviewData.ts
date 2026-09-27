import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isWriteFreezeRefusal } from "@/features/dev/components/writeFreeze";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import type { ProposalClaim } from "@/features/dev/tools/queue/queueModel";
import {
  groupPriorRowsForRestore,
  type CitationEvidenceRow,
  type CitationEvidenceStatus,
  type CitationReviewDecisionRecord,
  type CitationReviewDecisionStatus,
  type CitationReviewQueueFilter,
  type CitationReviewQueueLoadFailure,
  type CitationReviewQueueSummary,
} from "./citationReviewModels";
import { rowsChangedSince, rowsMovedSinceDecision } from "./citationPaneModel";

class QueueLoadError extends Error {
  readonly failure: CitationReviewQueueLoadFailure;
  readonly frozen: boolean;

  constructor(failure: CitationReviewQueueLoadFailure, frozen = false) {
    super(failure.error);
    this.name = "QueueLoadError";
    this.failure = failure;
    this.frozen = frozen;
  }
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const failure = result as Partial<CitationReviewQueueLoadFailure>;
    throw new QueueLoadError(
      {
        error: typeof failure.error === "string" ? failure.error : "Request failed.",
        cause: failure.cause === "query" ? failure.cause : undefined,
        requestId: typeof failure.requestId === "string" ? failure.requestId : undefined,
      },
      isWriteFreezeRefusal(response.status, result),
    );
  }

  return result as T;
}

function loadFailure(error: unknown, fallback: string): CitationReviewQueueLoadFailure {
  if (error instanceof QueueLoadError) {
    return error.failure;
  }
  return { error: error instanceof Error ? error.message : fallback };
}

const NO_ROWS: CitationEvidenceRow[] = [];

async function postStatus(body: {
  slug: string;
  claimKeys: string[];
  status: CitationEvidenceStatus;
  statusReason?: string;
}) {
  await readJson("/api/citation-evidence/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readRows(slug: string): Promise<CitationEvidenceRow[]> {
  const searchParams = new URLSearchParams({ slug });
  const result = await readJson<{ rows?: CitationEvidenceRow[] }>(
    `/api/citation-evidence?${searchParams.toString()}`,
  );
  return Array.isArray(result.rows) ? result.rows : [];
}

const CLAIMS_PATH = "/api/dev/inbox/claims";

/** Who holds each citation article in the Inbox's claim table, keyed by slug. Advisory. */
async function readClaims(): Promise<Map<string, ProposalClaim>> {
  const payload = await readJson<{ claims?: unknown }>(CLAIMS_PATH);
  if (!Array.isArray(payload.claims)) {
    throw new Error("The server did not return the claims.");
  }
  const claims = new Map<string, ProposalClaim>();
  for (const entry of payload.claims as Array<Record<string, unknown>>) {
    if (entry?.source !== "citations" || typeof entry.item_id !== "string" || typeof entry.claimed_by !== "string") continue;
    claims.set(entry.item_id, {
      claimed_by: entry.claimed_by,
      claimed_at: typeof entry.claimed_at === "string" ? entry.claimed_at : null,
      expired: entry.expired === true,
    });
  }
  return claims;
}

/**
 * Why the last write did not land: the server refused it (`failed`), the
 * write freeze held it (`frozen`), or someone else changed the rows since
 * they were shown (`conflict`, nothing was written). Scoped to the article.
 */
export type CitationActionFailure = {
  kind: "failed" | "frozen" | "conflict";
  message: string;
  slug: string;
  /** Rows involved in a conflict. */
  count?: number;
  undo?: boolean;
};

function failureOf(error: unknown, slug: string, fallback: string): CitationActionFailure {
  return {
    kind: error instanceof QueueLoadError && error.frozen ? "frozen" : "failed",
    message: error instanceof Error ? error.message : fallback,
    slug,
  };
}

export function useCitationReviewData(initialSlug?: string) {
  const [queue, setQueue] = useState<CitationReviewQueueSummary[]>([]);
  const [queueFilter, setQueueFilter] = useState<CitationReviewQueueFilter>("open");
  const [queueError, setQueueError] = useState<CitationReviewQueueLoadFailure | null>(null);
  // The first load shows skeletons; later refreshes keep the queue and the
  // evidence rows mounted, so expanded rows, half-typed reject reasons and
  // the scroll position survive a decision.
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedQueueRef = useRef(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug ?? null);
  // A deep link the first read did not list: said at the list, and opened
  // when a later filter lists it.
  const [missingSlug, setMissingSlug] = useState<string | null>(null);
  const wantedSlugRef = useRef<string | null>(initialSlug ?? null);
  // Rows remember the article they were fetched for, so a slow reply for one
  // article can never render or be decided under another.
  const [detail, setDetail] = useState<{ slug: string; rows: CitationEvidenceRow[] } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);
  const rowsSlug = detail?.slug ?? null;
  const rows = useMemo(
    () => (detail && detail.slug === selectedSlug ? detail.rows : NO_ROWS),
    [detail, selectedSlug],
  );
  // Loading means no rows have landed for this article yet; a refresh of the
  // same article keeps its rows on screen.
  const isDetailLoading = selectedSlug !== null && rowsSlug !== selectedSlug && detailError === null;
  const [actionFailure, setActionFailure] = useState<CitationActionFailure | null>(null);
  const [pendingClaimKeys, setPendingClaimKeys] = useState<string[]>([]);
  const [pendingStatus, setPendingStatus] = useState<CitationReviewDecisionStatus | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  // The last write that landed, offered for undo until the next decision
  // replaces it. No timer: the reviewer may read on before deciding to undo.
  const [undoableDecision, setUndoableDecision] = useState<CitationReviewDecisionRecord | null>(null);
  const clearUndo = useCallback(() => {
    setUndoableDecision(null);
  }, []);
  /** Claims from the Inbox's claim table; null until read, and after a failed read. */
  const [claims, setClaims] = useState<Map<string, ProposalClaim> | null>(null);

  const refreshQueue = useCallback(async (options: { keepSelection?: boolean } = {}) => {
    if (hasLoadedQueueRef.current) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setQueueError(null);

    try {
      const searchParams = new URLSearchParams({ status: queueFilter });
      const result = await readJson<{ queue?: CitationReviewQueueSummary[] }>(
        `/api/citation-evidence/queue?${searchParams.toString()}`,
      );
      const nextQueue = Array.isArray(result.queue) ? result.queue : [];
      const firstLoad = !hasLoadedQueueRef.current;
      hasLoadedQueueRef.current = true;
      setQueue(nextQueue);

      const wanted = wantedSlugRef.current;
      if (wanted && nextQueue.some((entry) => entry.slug === wanted)) {
        wantedSlugRef.current = null;
        setMissingSlug(null);
        setSelectedSlug(wanted);
        return;
      }
      if (wanted && firstLoad) setMissingSlug(wanted);
      setSelectedSlug((current) => {
        // After a decision the article stays open even when it left this
        // filter, so its result and undo stay with it.
        if (options.keepSelection && current) return current;
        if (current && current !== wanted && nextQueue.some((entry) => entry.slug === current)) {
          return current;
        }
        return nextQueue[0]?.slug ?? null;
      });
    } catch (error) {
      setQueueError(loadFailure(error, "Unable to load citation review queue."));
      // A failed refresh keeps the rows already on screen; only a queue that
      // never loaded is replaced by the error state.
      if (!hasLoadedQueueRef.current) {
        setQueue([]);
      }
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [queueFilter]);

  // Every detail request takes a token; only the latest one may land, so
  // clicking A then B shows B even when A's reply arrives last.
  const refreshDetail = useCallback(async (slug: string) => {
    const requestId = ++detailRequestRef.current;
    setDetailError(null);

    try {
      const nextRows = await readRows(slug);
      if (requestId !== detailRequestRef.current) {
        return;
      }
      setDetail({ slug, rows: nextRows });
    } catch (error) {
      if (requestId !== detailRequestRef.current) {
        return;
      }
      // A failed refresh keeps the rows already on screen for this article.
      setDetail((current) => (current?.slug === slug ? current : null));
      setDetailError(loadFailure(error, "Unable to load citation evidence.").error);
    }
  }, []);

  const loadClaims = useCallback(async () => {
    try {
      setClaims(await readClaims());
    } catch {
      setClaims(null);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    void loadClaims();
  }, [loadClaims]);

  useEffect(() => {
    if (!selectedSlug) {
      detailRequestRef.current += 1;
      setDetail(null);
      setDetailError(null);
      return;
    }

    void refreshDetail(selectedSlug);
  }, [refreshDetail, selectedSlug]);

  const updateStatuses = useCallback(
    async (claimKeys: string[], status: CitationReviewDecisionStatus, statusReason?: string) => {
      // Decide only rows that are on screen for the selected article.
      if (!selectedSlug || rowsSlug !== selectedSlug || claimKeys.length === 0) {
        return;
      }

      const slug = selectedSlug;
      const wanted = new Set(claimKeys);
      const shown = rows;
      const prior = shown
        .filter((row) => wanted.has(row.claimKey))
        .map((row) => ({ claimKey: row.claimKey, status: row.status, statusReason: row.statusReason }));
      if (prior.length === 0) {
        return;
      }
      const decidedKeys = prior.map((row) => row.claimKey);

      clearUndo();
      setActionFailure(null);
      setPendingClaimKeys(decidedKeys);
      setPendingStatus(status);
      setIsBulkUpdating(decidedKeys.length > 1);

      try {
        // The status route writes without a revision check, so read first and
        // refuse to decide rows someone else changed since they were shown.
        const fresh = await readRows(slug);
        const changed = rowsChangedSince(shown, fresh, decidedKeys);
        if (changed.length > 0) {
          detailRequestRef.current += 1;
          setDetail({ slug, rows: fresh });
          setActionFailure({ kind: "conflict", message: "", slug, count: changed.length });
          void refreshQueue({ keepSelection: true });
          return;
        }
        await postStatus({ slug, claimKeys: decidedKeys, status, statusReason });
        // A decision can drain an article out of the open count the rail shows.
        invalidateDevRailBadge("citations");
        await Promise.all([refreshQueue({ keepSelection: true }), refreshDetail(slug)]);
        setUndoableDecision({ status, slug, prior });
      } catch (error) {
        setActionFailure(failureOf(error, slug, "Unable to update citation review status."));
      } finally {
        setPendingClaimKeys([]);
        setPendingStatus(null);
        setIsBulkUpdating(false);
      }
    },
    [clearUndo, refreshDetail, refreshQueue, rows, rowsSlug, selectedSlug],
  );

  const undoLastDecision = useCallback(async () => {
    const decision = undoableDecision;
    if (!decision) {
      return;
    }

    clearUndo();
    setActionFailure(null);
    const claimKeys = decision.prior.map((row) => row.claimKey);
    setPendingClaimKeys(claimKeys);
    setIsBulkUpdating(claimKeys.length > 1);
    setIsUndoing(true);

    try {
      // Undo never overwrites a row someone decided again since.
      const fresh = await readRows(decision.slug);
      const moved = rowsMovedSinceDecision(decision, fresh);
      if (moved.length > 0) {
        if (selectedSlug === decision.slug) {
          detailRequestRef.current += 1;
          setDetail({ slug: decision.slug, rows: fresh });
        }
        setActionFailure({ kind: "conflict", message: "", slug: decision.slug, count: moved.length, undo: true });
        return;
      }
      for (const group of groupPriorRowsForRestore(decision.prior)) {
        await postStatus({ slug: decision.slug, ...group });
      }
      invalidateDevRailBadge("citations");
      await refreshQueue({ keepSelection: true });
      // Undo brings the restored article back into view.
      if (selectedSlug === decision.slug) {
        await refreshDetail(decision.slug);
      } else {
        setSelectedSlug(decision.slug);
      }
    } catch (error) {
      setActionFailure(failureOf(error, decision.slug, "Unable to undo the last decision."));
    } finally {
      setPendingClaimKeys([]);
      setIsBulkUpdating(false);
      setIsUndoing(false);
    }
  }, [clearUndo, refreshDetail, refreshQueue, selectedSlug, undoableDecision]);

  /** Claims or releases the open article in the Inbox's claim table. */
  const writeClaim = useCallback(async (slug: string, action: "claim" | "release") => {
    const payload = await readJson<{ claim?: Record<string, unknown> }>(CLAIMS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, source: "citations", id: slug }),
    });
    if (action === "claim") {
      const claim = payload.claim;
      if (!claim || typeof claim.claimed_by !== "string") {
        throw new Error("The server did not confirm the claim. Refresh to check who holds this article.");
      }
      const held: ProposalClaim = {
        claimed_by: claim.claimed_by,
        claimed_at: typeof claim.claimed_at === "string" ? claim.claimed_at : null,
        expired: false,
      };
      setClaims((current) => new Map(current ?? []).set(slug, held));
    } else {
      setClaims((current) => {
        const next = new Map(current ?? []);
        next.delete(slug);
        return next;
      });
    }
  }, []);

  const selectedSummary = useMemo(
    () => queue.find((entry) => entry.slug === selectedSlug) ?? null,
    [queue, selectedSlug],
  );

  return {
    queue,
    queueFilter,
    setQueueFilter,
    queueError,
    initialLoading,
    refreshing,
    selectedSlug,
    setSelectedSlug,
    selectedSummary,
    missingSlug,
    dismissMissing: () => setMissingSlug(null),
    rows,
    detailError,
    isDetailLoading,
    actionFailure,
    dismissActionFailure: () => setActionFailure(null),
    reportActionFailure: setActionFailure,
    pendingClaimKeys,
    pendingStatus,
    isBulkUpdating,
    isUndoing,
    undoableDecision,
    undoLastDecision,
    dismissUndo: clearUndo,
    refreshQueue,
    refreshDetail,
    updateStatuses,
    claims,
    loadClaims,
    writeClaim,
    isFreezeError: (error: unknown) => error instanceof QueueLoadError && error.frozen,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
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

class QueueLoadError extends Error {
  readonly failure: CitationReviewQueueLoadFailure;

  constructor(failure: CitationReviewQueueLoadFailure) {
    super(failure.error);
    this.name = "QueueLoadError";
    this.failure = failure;
  }
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const failure = result as Partial<CitationReviewQueueLoadFailure>;
    throw new QueueLoadError({
      error: typeof failure.error === "string" ? failure.error : "Request failed.",
      cause: failure.cause === "query" ? failure.cause : undefined,
      requestId: typeof failure.requestId === "string" ? failure.requestId : undefined,
    });
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

export function useCitationReviewData(initialSlug?: string) {
  const [queue, setQueue] = useState<CitationReviewQueueSummary[]>([]);
  const [queueFilter, setQueueFilter] = useState<CitationReviewQueueFilter>("open");
  const [queueError, setQueueError] = useState<CitationReviewQueueLoadFailure | null>(null);
  // The full-page loader belongs to the first load only. Later refreshes keep
  // the queue and the evidence rows mounted, so expanded rows, half-typed
  // reject reasons and the scroll position survive a decision.
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedQueueRef = useRef(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug ?? null);
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
  const isDetailLoading = selectedSlug !== null && rowsSlug !== selectedSlug;
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingClaimKeys, setPendingClaimKeys] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  // The last write that landed, offered for undo until the next decision
  // replaces it. No timer: the reviewer may read on before deciding to undo.
  const [undoableDecision, setUndoableDecision] = useState<CitationReviewDecisionRecord | null>(null);
  const clearUndo = useCallback(() => {
    setUndoableDecision(null);
  }, []);

  const refreshQueue = useCallback(async () => {
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
      hasLoadedQueueRef.current = true;
      setQueue(nextQueue);

      setSelectedSlug((current) => {
        if (current && nextQueue.some((entry) => entry.slug === current)) {
          return current;
        }
        if (initialSlug && nextQueue.some((entry) => entry.slug === initialSlug)) {
          return initialSlug;
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
  }, [initialSlug, queueFilter]);

  // Every detail request takes a token; only the latest one may land, so
  // clicking A then B shows B even when A's reply arrives last.
  const refreshDetail = useCallback(async (slug: string) => {
    const requestId = ++detailRequestRef.current;
    setDetailError(null);

    try {
      const searchParams = new URLSearchParams({ slug });
      const result = await readJson<{ rows?: CitationEvidenceRow[] }>(
        `/api/citation-evidence?${searchParams.toString()}`,
      );
      if (requestId !== detailRequestRef.current) {
        return;
      }
      setDetail({ slug, rows: Array.isArray(result.rows) ? result.rows : [] });
    } catch (error) {
      if (requestId !== detailRequestRef.current) {
        return;
      }
      // A failed refresh keeps the rows already on screen for this article.
      setDetail((current) => (current?.slug === slug ? current : { slug, rows: [] }));
      setDetailError(loadFailure(error, "Unable to load citation evidence.").error);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (!selectedSlug) {
      detailRequestRef.current += 1;
      setDetail(null);
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
      const prior = rows
        .filter((row) => wanted.has(row.claimKey))
        .map((row) => ({ claimKey: row.claimKey, status: row.status, statusReason: row.statusReason }));
      if (prior.length === 0) {
        return;
      }
      const decidedKeys = prior.map((row) => row.claimKey);

      clearUndo();
      setActionError(null);
      setPendingClaimKeys(decidedKeys);
      setIsBulkUpdating(decidedKeys.length > 1);

      try {
        await postStatus({ slug, claimKeys: decidedKeys, status, statusReason });
        // A decision can drain an article out of the open count the rail shows.
        invalidateDevRailBadge("citations");
        await Promise.all([refreshQueue(), refreshDetail(slug)]);
        setUndoableDecision({ status, slug, prior });
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Unable to update citation review status.");
      } finally {
        setPendingClaimKeys([]);
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
    setActionError(null);
    const claimKeys = decision.prior.map((row) => row.claimKey);
    setPendingClaimKeys(claimKeys);
    setIsBulkUpdating(claimKeys.length > 1);

    try {
      for (const group of groupPriorRowsForRestore(decision.prior)) {
        await postStatus({ slug: decision.slug, ...group });
      }
      invalidateDevRailBadge("citations");
      await refreshQueue();
      // A decision can drain its article out of the queue and move the
      // selection on; undo brings the restored article back into view.
      if (selectedSlug === decision.slug) {
        await refreshDetail(decision.slug);
      } else {
        setSelectedSlug(decision.slug);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to undo the last decision.");
    } finally {
      setPendingClaimKeys([]);
      setIsBulkUpdating(false);
    }
  }, [clearUndo, refreshDetail, refreshQueue, selectedSlug, undoableDecision]);

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
    rows,
    detailError,
    isDetailLoading,
    actionError,
    pendingClaimKeys,
    isBulkUpdating,
    undoableDecision,
    undoLastDecision,
    dismissUndo: clearUndo,
    refreshQueue,
    refreshDetail,
    updateStatuses,
  };
}

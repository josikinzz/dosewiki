import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** How long the Undo stays offered after a decision lands. */
const CITATION_UNDO_WINDOW_MS = 8000

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
  const [isQueueLoading, setIsQueueLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug ?? null);
  const [rows, setRows] = useState<CitationEvidenceRow[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingClaimKeys, setPendingClaimKeys] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  // The last write that landed, offered for undo until the window closes or
  // the next decision replaces it.
  const [undoableDecision, setUndoableDecision] = useState<CitationReviewDecisionRecord | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const clearUndo = useCallback(() => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoableDecision(null);
  }, []);

  useEffect(() => clearUndo, [clearUndo]);

  const offerUndo = useCallback(
    (decision: CitationReviewDecisionRecord) => {
      clearUndo();
      setUndoableDecision(decision);
      undoTimerRef.current = window.setTimeout(() => {
        undoTimerRef.current = null;
        setUndoableDecision(null);
      }, CITATION_UNDO_WINDOW_MS);
    },
    [clearUndo],
  );

  const refreshQueue = useCallback(async () => {
    setIsQueueLoading(true);
    setQueueError(null);

    try {
      const searchParams = new URLSearchParams({ status: queueFilter });
      const result = await readJson<{ queue?: CitationReviewQueueSummary[] }>(
        `/api/citation-evidence/queue?${searchParams.toString()}`,
      );
      const nextQueue = Array.isArray(result.queue) ? result.queue : [];
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
      setQueue([]);
    } finally {
      setIsQueueLoading(false);
    }
  }, [initialSlug, queueFilter]);

  const refreshDetail = useCallback(async (slug: string) => {
    setIsDetailLoading(true);
    setDetailError(null);

    try {
      const searchParams = new URLSearchParams({ slug });
      const result = await readJson<{ rows?: CitationEvidenceRow[] }>(
        `/api/citation-evidence?${searchParams.toString()}`,
      );
      setRows(Array.isArray(result.rows) ? result.rows : []);
    } catch (error) {
      setRows([]);
      setDetailError(loadFailure(error, "Unable to load citation evidence.").error);
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (!selectedSlug) {
      setRows([]);
      return;
    }

    void refreshDetail(selectedSlug);
  }, [refreshDetail, selectedSlug]);

  const updateStatuses = useCallback(
    async (claimKeys: string[], status: CitationReviewDecisionStatus, statusReason?: string) => {
      if (!selectedSlug || claimKeys.length === 0) {
        return;
      }

      const slug = selectedSlug;
      const wanted = new Set(claimKeys);
      const prior = rows
        .filter((row) => wanted.has(row.claimKey))
        .map((row) => ({ claimKey: row.claimKey, status: row.status, statusReason: row.statusReason }));

      clearUndo();
      setActionError(null);
      setPendingClaimKeys(claimKeys);
      setIsBulkUpdating(claimKeys.length > 1);

      try {
        await postStatus({ slug, claimKeys, status, statusReason });
        await Promise.all([refreshQueue(), refreshDetail(slug)]);
        offerUndo({ status, slug, prior });
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Unable to update citation review status.");
      } finally {
        setPendingClaimKeys([]);
        setIsBulkUpdating(false);
      }
    },
    [clearUndo, offerUndo, refreshDetail, refreshQueue, rows, selectedSlug],
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
    isQueueLoading,
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

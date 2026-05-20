import { useCallback, useEffect, useMemo, useState } from "react";
import type { CitationEvidenceRow, CitationReviewQueueSummary } from "./citationReviewModels";

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error =
      typeof (result as { error?: unknown }).error === "string"
        ? (result as { error: string }).error
        : "Request failed.";
    throw new Error(error);
  }

  return result as T;
}

export function useCitationReviewData(initialSlug?: string) {
  const [queue, setQueue] = useState<CitationReviewQueueSummary[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isQueueLoading, setIsQueueLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug ?? null);
  const [rows, setRows] = useState<CitationEvidenceRow[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingClaimKeys, setPendingClaimKeys] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const refreshQueue = useCallback(async () => {
    setIsQueueLoading(true);
    setQueueError(null);

    try {
      const result = await readJson<{ queue?: CitationReviewQueueSummary[] }>("/api/citation-evidence/queue");
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
      setQueueError(error instanceof Error ? error.message : "Unable to load citation review queue.");
      setQueue([]);
    } finally {
      setIsQueueLoading(false);
    }
  }, [initialSlug]);

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
      setDetailError(error instanceof Error ? error.message : "Unable to load citation evidence.");
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
    async (claimKeys: string[], status: "approved" | "rejected") => {
      if (!selectedSlug || claimKeys.length === 0) {
        return;
      }

      setActionError(null);
      setPendingClaimKeys(claimKeys);
      setIsBulkUpdating(claimKeys.length > 1);

      try {
        await readJson("/api/citation-evidence/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: selectedSlug,
            claimKeys,
            status,
          }),
        });
        await Promise.all([refreshQueue(), refreshDetail(selectedSlug)]);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Unable to update citation review status.");
      } finally {
        setPendingClaimKeys([]);
        setIsBulkUpdating(false);
      }
    },
    [refreshDetail, refreshQueue, selectedSlug],
  );

  const selectedSummary = useMemo(
    () => queue.find((entry) => entry.slug === selectedSlug) ?? null,
    [queue, selectedSlug],
  );

  return {
    queue,
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
    refreshQueue,
    refreshDetail,
    updateStatuses,
  };
}

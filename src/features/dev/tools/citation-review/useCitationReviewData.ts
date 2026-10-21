import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isWriteFreezeRefusal } from "@/features/dev/components/writeFreeze";
import { devFetch, type DevFetchOptions, type DevFetchPayload } from "@/features/dev/tools/devFetch";
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

function readJson(
  url: string,
  init: Omit<DevFetchOptions, "messages" | "onError"> = {},
): Promise<DevFetchPayload> {
  return devFetch(url, {
    ...init,
    messages: { network: "Network error while contacting the server.", failure: "Request failed." },
    onError: (status, payload, message) =>
      new QueueLoadError(
        {
          error: message,
          cause: payload.cause === "query" ? "query" : undefined,
          requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
        },
        isWriteFreezeRefusal(status, payload),
      ),
  });
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
    emptyBodyOk: true,
  });
}

async function readRows(slug: string): Promise<CitationEvidenceRow[]> {
  const searchParams = new URLSearchParams({ slug });
  const result = await readJson(`/api/citation-evidence?${searchParams.toString()}`);
  if (!Array.isArray(result.rows)) {
    throw new Error("The server did not return the citation evidence.");
  }
  return result.rows as CitationEvidenceRow[];
}

const CLAIMS_PATH = "/api/dev/inbox/claims";

async function readClaims(): Promise<Map<string, ProposalClaim>> {
  const payload = await readJson(CLAIMS_PATH);
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

export type CitationActionFailure = {
  kind: "failed" | "frozen" | "conflict";
  message: string;
  slug: string;
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
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedQueueRef = useRef(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug ?? null);
  const [missingSlug, setMissingSlug] = useState<string | null>(null);
  const wantedSlugRef = useRef<string | null>(initialSlug ?? null);
  const [detail, setDetail] = useState<{ slug: string; rows: CitationEvidenceRow[] } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);
  const rowsSlug = detail?.slug ?? null;
  const rows = useMemo(
    () => (detail && detail.slug === selectedSlug ? detail.rows : NO_ROWS),
    [detail, selectedSlug],
  );
  const isDetailLoading = selectedSlug !== null && rowsSlug !== selectedSlug && detailError === null;
  const [actionFailure, setActionFailure] = useState<CitationActionFailure | null>(null);
  const [pendingClaimKeys, setPendingClaimKeys] = useState<string[]>([]);
  const [pendingStatus, setPendingStatus] = useState<CitationReviewDecisionStatus | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoableDecision, setUndoableDecision] = useState<CitationReviewDecisionRecord | null>(null);
  const clearUndo = useCallback(() => {
    setUndoableDecision(null);
  }, []);
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
      const result = await readJson(`/api/citation-evidence/queue?${searchParams.toString()}`);
      if (!Array.isArray(result.queue)) {
        throw new Error("The server did not return the citation review queue.");
      }
      const nextQueue = result.queue as CitationReviewQueueSummary[];
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
        if (options.keepSelection && current) return current;
        if (current && current !== wanted && nextQueue.some((entry) => entry.slug === current)) {
          return current;
        }
        return nextQueue[0]?.slug ?? null;
      });
    } catch (error) {
      setQueueError(loadFailure(error, "Unable to load citation review queue."));
      if (!hasLoadedQueueRef.current) {
        setQueue([]);
      }
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [queueFilter]);

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

  const writeClaim = useCallback(async (slug: string, action: "claim" | "release") => {
    const payload = await readJson(CLAIMS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, source: "citations", id: slug }),
    });
    if (action === "claim") {
      const claim = payload.claim as Record<string, unknown> | undefined;
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

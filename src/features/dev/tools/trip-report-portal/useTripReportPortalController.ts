"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ConvexTripReportImportPayload,
  TripReportSubmissionRow,
  TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import type { TripReportEditableFields } from "../../../../../convex/lib/tripReportEditing";
import type { EditorSaveRequest } from "./PortalReportEditor";
import type { PromotionAttribution } from "./PortalSubmissionReview";
import {
  EMPTY_PORTAL_FACETS,
  filterPortalRows,
  groupPortalRows,
  isNeedsReviewStatus,
  portalStats,
  toPortalRowFromReport,
  toPortalRowFromSubmission,
  type PortalBucket,
  type PortalContributorOption,
  type PortalFacets,
  type PortalGroupBy,
  type PortalRow,
  type PortalSort,
  type PublishedReportPayload,
} from "./tripReportPortalModel";

const CORPUS_API = "/api/dev/trip-reports";
const RECORD_API = "/api/dev/trip-reports/record";
/**
 * Every row the rail badge counts, uncapped: the Needs review bucket is cut
 * from these with the same status list the badge reads, so the two cannot
 * disagree however deep the queue gets.
 */
const NEEDS_REVIEW_QUEUE_API = "/api/trip-report-submissions/queue?scope=needs-review";
/** The rest of the private queue, at the store's cap: browse history, not a work list. */
const QUEUE_API = "/api/trip-report-submissions/queue?limit=250";

type CorpusPayload = {
  reports: PublishedReportPayload[];
  contributors: PortalContributorOption[];
  submissions: TripReportSubmissionRow[];
};

type LoadState = { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

type ReportDetail = { id: string; fields: TripReportEditableFields; revision: string };

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

type Feedback = { tone: "success" | "danger"; message: string };

/**
 * Last corpus this tab saw, kept outside React so leaving and re-entering the
 * tab paints the previous rows immediately instead of replaying the loading
 * state. The refetch still runs on every mount; it just happens behind the
 * already-rendered list.
 */
let cachedCorpus: CorpusPayload | null = null;

export function useTripReportPortalController() {
  const [corpus, setCorpus] = useState<CorpusPayload>(
    () => cachedCorpus ?? { reports: [], contributors: [], submissions: [] },
  );
  const [load, setLoad] = useState<LoadState>(cachedCorpus ? { status: "ready" } : { status: "loading" });

  const [bucket, setBucket] = useState<PortalBucket>("needs");
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<PortalFacets>(EMPTY_PORTAL_FACETS);
  const [groupBy, setGroupBy] = useState<PortalGroupBy>("none");
  const [sort, setSort] = useState<PortalSort>("newest");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle" });
  const [draft, setDraft] = useState<TripReportEditableFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [promotionPayload, setPromotionPayload] = useState<ConvexTripReportImportPayload | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const openReportRef = useRef<string | null>(null);

  /**
   * Fetch one published report's body, and seed the draft from it. Late
   * responses are dropped: only the row still open may write state.
   */
  const loadReportBody = useCallback(async (id: string) => {
    openReportRef.current = id;
    setDetailState({ status: "loading" });

    try {
      const response = await fetch(`${RECORD_API}?id=${encodeURIComponent(id)}`);
      if (openReportRef.current !== id) {
        return;
      }

      if (!response.ok) {
        setDetailState({
          status: "error",
          message: await readError(response, "Failed to load that report."),
        });
        return;
      }

      const payload = await response.json();
      const fields = payload?.report?.fields as TripReportEditableFields | undefined;
      const revision = payload?.report?.revision;
      if (openReportRef.current !== id) {
        return;
      }

      if (!fields || typeof revision !== "string") {
        setDetailState({ status: "error", message: "That report came back empty." });
        return;
      }

      setDetail({ id, fields, revision });
      setDraft(structuredClone(fields));
      setDetailState({ status: "idle" });
    } catch {
      if (openReportRef.current === id) {
        setDetailState({ status: "error", message: "Network error while loading the report." });
      }
    }
  }, []);

  const loadCorpus = useCallback(async (preferredId?: string) => {
    if (!cachedCorpus) {
      setLoad({ status: "loading" });
    }

    try {
      const [corpusResponse, needsReviewResponse, queueResponse] = await Promise.all([
        fetch(CORPUS_API),
        fetch(NEEDS_REVIEW_QUEUE_API),
        fetch(QUEUE_API),
      ]);

      if (!corpusResponse.ok) {
        setLoad({ status: "error", message: await readError(corpusResponse, "Failed to load the corpus.") });
        return;
      }

      const failedQueue = [needsReviewResponse, queueResponse].find((response) => !response.ok);
      if (failedQueue) {
        setLoad({
          status: "error",
          message: await readError(failedQueue, "Failed to load the submission queue."),
        });
        return;
      }

      const [corpusPayload, needsReviewPayload, queuePayload] = await Promise.all([
        corpusResponse.json(),
        needsReviewResponse.json(),
        queueResponse.json(),
      ]);

      const next: CorpusPayload = {
        reports: Array.isArray(corpusPayload.reports) ? corpusPayload.reports : [],
        contributors: Array.isArray(corpusPayload.contributors) ? corpusPayload.contributors : [],
        submissions: mergeSubmissions(
          Array.isArray(needsReviewPayload.submissions) ? needsReviewPayload.submissions : [],
          Array.isArray(queuePayload.submissions) ? queuePayload.submissions : [],
        ),
      };

      cachedCorpus = next;
      setCorpus(next);
      setLoad({ status: "ready" });

      if (preferredId) {
        setSelectedId(preferredId);

        if (openReportRef.current === preferredId) {
          void loadReportBody(preferredId);
        }
      }
    } catch {
      setLoad({ status: "error", message: "Failed to reach the trip report endpoints." });
    }
  }, [loadReportBody]);

  useEffect(() => {
    void loadCorpus();
  }, [loadCorpus]);

  const rows = useMemo<PortalRow[]>(
    () => [
      ...corpus.reports.map(toPortalRowFromReport),
      ...corpus.submissions.map(toPortalRowFromSubmission),
    ],
    [corpus],
  );

  const visible = useMemo(
    () => filterPortalRows(rows, { bucket, query, facets, sort }),
    [rows, bucket, query, facets, sort],
  );

  const groups = useMemo(() => groupPortalRows(visible, groupBy, sort), [visible, groupBy, sort]);

  const selected = useMemo(() => {
    const row = rows.find((entry) => entry.id === selectedId) ?? null;
    if (!row || row.origin !== "published") {
      return row;
    }

    return detail && detail.id === row.id ? { ...row, fields: detail.fields } : row;
  }, [detail, rows, selectedId]);

  const selectedSubmission = useMemo(
    () =>
      selected?.origin === "submission"
        ? corpus.submissions.find((submission) => submission.id === selected.id) ?? null
        : null,
    [corpus.submissions, selected],
  );

  const stats = useMemo(() => portalStats(rows), [rows]);
  const editorOpen = selected !== null;

  /** The rows in the order the list paints them: grouped, then sorted. */
  const orderedRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const queuePosition = useMemo(
    () => ({
      index: orderedRows.findIndex((row) => row.id === selectedId),
      total: orderedRows.length,
    }),
    [orderedRows, selectedId],
  );

  const selectRow = useCallback(
    (row: PortalRow) => {
      setSelectedId(row.id);
      setFeedback(null);
      setPromotionPayload(null);
      setDetail(null);
      setDraft(null);

      if (row.origin === "published") {
        void loadReportBody(row.id);
        return;
      }

      openReportRef.current = null;
      setDetailState({ status: "idle" });
    },
    [loadReportBody],
  );

  /**
   * Step to the neighbouring row in list order. A row that has just left the
   * list (accepted out of the Needs review bucket) has no neighbours, so Next
   * opens the head of the list and Previous its tail.
   */
  const selectAdjacent = useCallback(
    (direction: -1 | 1) => {
      const { index } = queuePosition;
      const next =
        index === -1
          ? direction === 1
            ? orderedRows[0]
            : orderedRows[orderedRows.length - 1]
          : orderedRows[index + direction];
      if (next) {
        selectRow(next);
      }
    },
    [orderedRows, queuePosition, selectRow],
  );

  const closeEditor = useCallback(() => {
    openReportRef.current = null;
    setSelectedId(null);
    setDetail(null);
    setDetailState({ status: "idle" });
    setDraft(null);
    setFeedback(null);
    setPromotionPayload(null);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target ? /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) : false;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === "Escape") {
        if (typing) {
          target?.blur();
          return;
        }

        closeEditor();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeEditor]);

  async function saveReport(request: EditorSaveRequest) {
    if (!selected || !selected.fields || !detail || detail.id !== selected.id) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(RECORD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "save",
          id: selected.id,
          expected: selected.fields,
          expectedRevision: detail.revision,
          operationId: crypto.randomUUID(),
          updates: request.updates,
          ...(request.profileKey !== undefined ? { profile_key: request.profileKey } : {}),
          ...(request.confirmAuthorNameClaim ? { confirm_author_name_claim: true } : {}),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: typeof payload.error === "string" ? payload.error : "Unable to save that report.",
        });
        return;
      }

      setFeedback({ tone: "success", message: `Saved "${request.updates.title}".` });
      await loadCorpus(selected.id);
    } catch {
      setFeedback({ tone: "danger", message: "Network error while saving the report." });
    } finally {
      setBusy(false);
    }
  }

  async function deleteReport() {
    if (!selected) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(RECORD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "delete", id: selected.id }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: typeof payload.error === "string" ? payload.error : "Unable to delete that report.",
        });
        return;
      }

      closeEditor();
      await loadCorpus();
    } catch {
      setFeedback({ tone: "danger", message: "Network error while deleting the report." });
    } finally {
      setBusy(false);
    }
  }

  async function changeSubmissionStatus(status: TripReportSubmissionStatus, notes: string) {
    if (!selectedSubmission) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/trip-report-submissions/${selectedSubmission.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: typeof payload.error === "string" ? payload.error : "Unable to update submission.",
        });
        return;
      }

      setFeedback({ tone: "success", message: STATUS_FEEDBACK[status](selectedSubmission.title) });
      setPromotionPayload(null);
      invalidateDevRailBadge("trip-reports");
      await loadCorpus(selectedSubmission.id);
    } catch {
      setFeedback({ tone: "danger", message: "Network error while updating the submission." });
    } finally {
      setBusy(false);
    }
  }

  async function runPromotion(publish: boolean, attribution: PromotionAttribution) {
    if (!selectedSubmission) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/trip-report-submissions/${selectedSubmission.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publish,
          ...(attribution.profileKey.trim() ? { profile_key: attribution.profileKey.trim() } : {}),
          ...(attribution.confirmAuthorNameClaim ? { confirm_author_name_claim: true } : {}),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: typeof payload.error === "string" ? payload.error : "Unable to promote submission.",
        });
        return;
      }

      setPromotionPayload(payload.payload ?? null);
      setFeedback({
        tone: "success",
        message: publish
          ? `Published "${selectedSubmission.title}" to the public trip reports.`
          : "Preview ready below. Nothing has been published yet.",
      });

      if (publish) {
        invalidateDevRailBadge("trip-reports");
        await loadCorpus();
      }
    } catch {
      setFeedback({ tone: "danger", message: "Network error while promoting the submission." });
    } finally {
      setBusy(false);
    }
  }

  return {
    bucket,
    busy,
    changeSubmissionStatus,
    closeEditor,
    corpus,
    deleteReport,
    detailState,
    draft,
    editorOpen,
    facets,
    feedback,
    groupBy,
    groups,
    load,
    loadCorpus,
    loadReportBody,
    promotionPayload,
    query,
    queuePosition,
    rows,
    runPromotion,
    saveReport,
    searchInputRef,
    selected,
    selectedId,
    selectedSubmission,
    selectAdjacent,
    selectRow,
    setBucket,
    setDraft,
    setFacets,
    setFeedback,
    setGroupBy,
    setQuery,
    setSort,
    sort,
    stats,
    visible,
  };
}

const STATUS_FEEDBACK: Record<TripReportSubmissionStatus, (title: string) => string> = {
  submitted: (title) => `Returned "${title}" to the queue.`,
  reviewing: (title) => `Review started on "${title}".`,
  accepted: (title) => `Accepted "${title}". Publish it below when ready.`,
  rejected: (title) => `Rejected "${title}".`,
  spam: (title) => `Marked "${title}" as spam.`,
  exported: (title) => `Published "${title}".`,
};

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => ({}));
  return typeof payload.error === "string" ? payload.error : fallback;
}

/**
 * The uncapped needs-review rows plus whatever else the capped queue page
 * holds. A row that changed status between the two reads could appear in
 * both; the needs-review read wins so the bucket never double-counts.
 */
function mergeSubmissions(
  needsReview: TripReportSubmissionRow[],
  queue: TripReportSubmissionRow[],
): TripReportSubmissionRow[] {
  const seen = new Set(needsReview.map((row) => row.id));
  const merged = [...needsReview];
  for (const row of queue) {
    if (!isNeedsReviewStatus(row.status) && !seen.has(row.id)) {
      merged.push(row);
    }
  }

  return merged;
}

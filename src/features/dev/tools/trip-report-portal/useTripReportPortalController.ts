"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DataTripReportImportPayload,
  TripReportSubmissionRow,
  TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";
import type {
  TripReportSubmissionPortalIndex,
  TripReportSubmissionPortalSummary,
} from "@/features/reports/submissions/dataTripReportSubmissionStore";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import type { EditorSaveRequest } from "./PortalReportEditor";
import type { PromotionAttribution } from "./PortalSubmissionReview";
import {
  EMPTY_PORTAL_FACETS,
  filterPortalRows,
  groupPortalRows,
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
const SUBMISSION_INDEX_API = "/api/trip-report-submissions/queue?scope=portal";
const SUBMISSION_DETAIL_API = "/api/trip-report-submissions/queue";

type CorpusPayload = {
  reports: PublishedReportPayload[];
  contributors: PortalContributorOption[];
  submissions: TripReportSubmissionPortalSummary[];
};

type DatasetState = { status: "loading" | "ready" } | { status: "error"; message: string };
type LoadState = { corpus: DatasetState; submissions: DatasetState };

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
let cachedPublished: Pick<CorpusPayload, "reports" | "contributors"> | null = null;
let cachedSubmissions: TripReportSubmissionPortalSummary[] | null = null;

export function useTripReportPortalController() {
  const [corpus, setCorpus] = useState<CorpusPayload>(() => ({
    reports: cachedPublished?.reports ?? [],
    contributors: cachedPublished?.contributors ?? [],
    submissions: cachedSubmissions ?? [],
  }));
  const [load, setLoad] = useState<LoadState>({
    corpus: cachedPublished ? { status: "ready" } : { status: "loading" },
    submissions: cachedSubmissions ? { status: "ready" } : { status: "loading" },
  });

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
  const [promotionPayload, setPromotionPayload] = useState<DataTripReportImportPayload | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<TripReportSubmissionRow | null>(null);

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

  const loadSubmissionDetail = useCallback(async (id: string) => {
    openReportRef.current = id;
    setDetailState({ status: "loading" });

    try {
      const response = await fetch(`${SUBMISSION_DETAIL_API}?id=${encodeURIComponent(id)}`);
      if (openReportRef.current !== id) return;
      if (!response.ok) {
        setDetailState({
          status: "error",
          message: await readError(response, "Failed to load that submission."),
        });
        return;
      }

      const payload = await response.json();
      if (openReportRef.current !== id || !payload?.submission) return;
      setSubmissionDetail(payload.submission as TripReportSubmissionRow);
      setDetailState({ status: "idle" });
    } catch {
      if (openReportRef.current === id) {
        setDetailState({ status: "error", message: "Network error while loading the submission." });
      }
    }
  }, []);

  const loadPublished = useCallback(async () => {
    setLoad((current) => ({
      ...current,
      corpus: cachedPublished ? current.corpus : { status: "loading" },
    }));
    try {
      const response = await fetch(CORPUS_API);
      if (!response.ok) {
        const message = await readError(response, "Failed to load the corpus.");
        setLoad((current) => ({
          ...current,
          corpus: { status: "error", message },
        }));
        return;
      }
      const payload = await response.json();
      const next = {
        reports: Array.isArray(payload.reports) ? payload.reports : [],
        contributors: Array.isArray(payload.contributors) ? payload.contributors : [],
      };
      cachedPublished = next;
      setCorpus((current) => ({ ...current, ...next }));
      setLoad((current) => ({ ...current, corpus: { status: "ready" } }));
    } catch {
      setLoad((current) => ({
        ...current,
        corpus: { status: "error", message: "Failed to reach the trip report corpus endpoint." },
      }));
    }
  }, []);

  const loadSubmissionIndex = useCallback(async () => {
    setLoad((current) => ({
      ...current,
      submissions: cachedSubmissions ? current.submissions : { status: "loading" },
    }));
    try {
      const response = await fetch(SUBMISSION_INDEX_API);
      if (!response.ok) {
        const message = await readError(response, "Failed to load the submission queue.");
        setLoad((current) => ({
          ...current,
          submissions: { status: "error", message },
        }));
        return;
      }
      const payload = await response.json() as Partial<TripReportSubmissionPortalIndex>;
      const next = [
        ...(Array.isArray(payload.needsReview) ? payload.needsReview : []),
        ...(Array.isArray(payload.history) ? payload.history : []),
      ];
      cachedSubmissions = next;
      setCorpus((current) => ({ ...current, submissions: next }));
      setLoad((current) => ({ ...current, submissions: { status: "ready" } }));
    } catch {
      setLoad((current) => ({
        ...current,
        submissions: { status: "error", message: "Failed to reach the submission queue endpoint." },
      }));
    }
  }, []);

  const loadCorpus = useCallback(async (preferredId?: string) => {
    await Promise.all([loadPublished(), loadSubmissionIndex()]);
    if (preferredId) setSelectedId(preferredId);
  }, [loadPublished, loadSubmissionIndex]);

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
      selected?.origin === "submission" && submissionDetail?.id === selected.id
        ? submissionDetail
        : null,
    [selected, submissionDetail],
  );

  const stats = useMemo(
    () => load.corpus.status === "ready" && load.submissions.status === "ready" ? portalStats(rows) : null,
    [load, rows],
  );
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
      setSubmissionDetail(null);

      if (row.origin === "published") {
        void loadReportBody(row.id);
        return;
      }

      void loadSubmissionDetail(row.id);
    },
    [loadReportBody, loadSubmissionDetail],
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
    setSubmissionDetail(null);
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

  function patchSubmission(submission: TripReportSubmissionRow) {
    const summary = submissionSummaryOf(submission);
    setSubmissionDetail(submission);
    setCorpus((current) => {
      const submissions = current.submissions.map((row) => row.id === summary.id ? summary : row);
      cachedSubmissions = submissions;
      return { ...current, submissions };
    });
  }

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

      const fields = payload.fields as TripReportEditableFields | undefined;
      const revision = payload.revision;
      if (!fields || typeof revision !== "string") {
        setFeedback({ tone: "danger", message: "The saved report response was incomplete." });
        return;
      }

      setDetail({ id: selected.id, fields, revision });
      setDraft(structuredClone(fields));
      setCorpus((current) => {
        const reports = current.reports.map((report) =>
          report.id === selected.id
            ? {
                ...report,
                title: fields.title,
                subject: { name: fields.subject.name, trip_date: fields.subject.trip_date },
                substances: fields.substances,
                tags: fields.tags,
              }
            : report,
        );
        cachedPublished = { reports, contributors: current.contributors };
        return { ...current, reports };
      });
      setFeedback({ tone: "success", message: `Saved "${fields.title}".` });
      void loadPublished();
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

      setCorpus((current) => {
        const reports = current.reports.filter((report) => report.id !== selected.id);
        cachedPublished = { reports, contributors: current.contributors };
        return { ...current, reports };
      });
      closeEditor();
      void loadPublished();
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

      const updated = payload.submission as TripReportSubmissionRow | undefined;
      if (!updated) {
        setFeedback({ tone: "danger", message: "The updated submission response was incomplete." });
        return;
      }
      patchSubmission(updated);
      setFeedback({ tone: "success", message: STATUS_FEEDBACK[updated.status](updated.title) });
      setPromotionPayload(null);
      invalidateDevRailBadge("trip-reports");
      void loadSubmissionIndex();
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

      const updated = payload.submission as TripReportSubmissionRow | undefined;
      if (!updated) {
        setFeedback({ tone: "danger", message: "The promotion response was incomplete." });
        return;
      }
      patchSubmission(updated);
      setPromotionPayload(payload.payload ?? null);
      setFeedback({
        tone: "success",
        message: publish
          ? `Published "${selectedSubmission.title}" to the public trip reports.`
          : "Preview ready below. Nothing has been published yet.",
      });

      if (publish) {
        invalidateDevRailBadge("trip-reports");
        void loadSubmissionIndex();
        void loadPublished();
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
    loadSubmissionDetail,
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

function submissionSummaryOf(submission: TripReportSubmissionRow): TripReportSubmissionPortalSummary {
  return {
    id: submission.id,
    status: submission.status,
    title: submission.title,
    author_name: submission.author_name,
    created_at: submission.created_at,
    report: {
      subject: submission.report.subject,
      substances: submission.report.substances,
      tags: submission.report.tags,
    },
  };
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DataTripReportImportPayload,
  TripReportSubmissionRow,
  TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";
import { useDirtyGuard, useUnsavedWork } from "@/features/dev/components";
import { INTAKE_STATUS_LABEL, TRIP_REPORT_INTAKE_STATUS } from "@/features/intake/intakeStatus";
import { canTransitionTripReportSubmission } from "@/features/reports/submissions/tripReportSubmissionStatus";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import type { EditorSaveRequest } from "./PortalReportEditor";
import type { PromotionAttribution } from "./PortalSubmissionReview";
import { assignReportOwner } from "../my-reports/myReportsModel";
import { assignedNotice, publishedNotice } from "../my-reports/ownershipCopy";
import {
  EMPTY_PORTAL_FACETS,
  filterPortalRows,
  groupPortalRows,
  portalStats,
  toPortalRowFromReport,
  toPortalRowFromSubmission,
  type PortalBucket,
  type PortalFacets,
  type PortalGroupBy,
  type PortalRow,
  type PortalSort,
} from "./tripReportPortalModel";
import { readError, useTripReportPortalCorpus } from "./useTripReportPortalCorpus";

const RECORD_API = "/api/dev/trip-reports/record";
const SUBMISSION_DETAIL_API = "/api/trip-report-submissions/queue";

type ReportDetail = { id: string; fields: TripReportEditableFields; revision: string };

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

type Feedback = { tone: "success" | "danger"; message: string };

const DISCARD_COPY = {
  title: "Discard your edits?",
  description: "This report has changes that were not saved. Discarding them leaves the live page as it is now.",
};

export function useTripReportPortalController() {
  const { corpus, load, loadPublished, loadSubmissionIndex, updateReports, replaceSubmission } =
    useTripReportPortalCorpus();

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
  /** A report just published whose contact email matches a member; the notice offers to assign it. */
  const [assignable, setAssignable] = useState<{ slug: string; email: string } | null>(null);
  /** The last single status change, so `u` and the Undo button can take it back. */
  const [lastDecision, setLastDecision] = useState<{
    id: string;
    title: string;
    from: TripReportSubmissionStatus;
    to: TripReportSubmissionStatus;
  } | null>(null);
  /** Submissions ticked for a bulk decision; separate from the open row. */
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set());
  /** The bulk bar's own notice, shown above the list rather than in one review. */
  const [bulkFeedback, setBulkFeedback] = useState<Feedback | null>(null);

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

  // Only a published report holds a draft; a submission review has nothing to drop.
  const dirty =
    selected?.origin === "published" &&
    draft !== null &&
    detail !== null &&
    detail.id === selected.id &&
    JSON.stringify(draft) !== JSON.stringify(detail.fields);
  // The in-tool guard keeps row clicks, Prev/Next and Close; the shell owns
  // rail clicks, Leave and unload. A report save replaces the live page, so
  // the shell only discards.
  const { guard, dialog: discardDialog } = useDirtyGuard(dirty, { ...DISCARD_COPY, warnOnUnload: false });
  useUnsavedWork({
    id: "trip-report-submissions:report",
    tab: "trip-report-submissions",
    label: `Trip reports: edits to ${selected?.title?.trim() ? `"${selected.title.trim()}"` : "a published report"}`,
    dirty,
    publishesLive: true,
    discard: () => {
      if (detail) setDraft(detail.fields);
    },
  });

  const openRow = useCallback(
    (row: PortalRow) => {
      setSelectedId(row.id);
      setFeedback(null);
      setPromotionPayload(null);
      setAssignable(null);
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

  /** Open a row from the list, asking first when that would drop unsaved edits. */
  const selectRow = useCallback((row: PortalRow) => guard(() => openRow(row)), [guard, openRow]);

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

  /** Close without asking; for paths where the record is already gone. */
  const dropEditor = useCallback(() => {
    openReportRef.current = null;
    setSelectedId(null);
    setDetail(null);
    setDetailState({ status: "idle" });
    setDraft(null);
    setFeedback(null);
    setPromotionPayload(null);
    setAssignable(null);
    setSubmissionDetail(null);
  }, []);

  /** Close the open record, asking first when that would drop unsaved edits. */
  const closeEditor = useCallback(() => guard(dropEditor), [guard, dropEditor]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // A dialog or field that handled the key keeps it.
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const typing = target ? /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) : false;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === "Escape") {
        // Escape that dismisses a dialog (confirm, discard) closes only that dialog.
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
          return;
        }

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
    setSubmissionDetail(submission);
    replaceSubmission(submission);
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
      updateReports((reports) =>
        reports.map((report) =>
          report.id === selected.id
            ? {
                ...report,
                title: fields.title,
                subject: { name: fields.subject.name, trip_date: fields.subject.trip_date },
                substances: fields.substances,
                tags: fields.tags,
              }
            : report,
        ),
      );
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

      updateReports((reports) => reports.filter((report) => report.id !== selected.id));
      dropEditor();
      void loadPublished();
    } catch {
      setFeedback({ tone: "danger", message: "Network error while deleting the report." });
    } finally {
      setBusy(false);
    }
  }

  async function changeSubmissionStatus(status: TripReportSubmissionStatus, notes?: string, publicReason?: string) {
    if (!selectedSubmission) {
      return;
    }

    const previousStatus = selectedSubmission.status;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await postSubmissionStatus(selectedSubmission.id, status, notes, publicReason);
      if (!result.ok) {
        setFeedback({ tone: "danger", message: result.message });
        return;
      }
      const updated = result.submission;
      patchSubmission(updated);
      setLastDecision(
        updated.status !== previousStatus
          ? { id: updated.id, title: updated.title, from: previousStatus, to: updated.status }
          : null,
      );
      setFeedback({ tone: "success", message: STATUS_FEEDBACK[updated.status](updated.title) });
      setPromotionPayload(null);
      invalidateDevRailBadge("trip-reports");
      void loadSubmissionIndex();
    } finally {
      setBusy(false);
    }
  }

  const undoTo = lastDecision ? submissionUndoTarget(lastDecision) : null;

  /** Take the last single decision back; the decision log records both moves. */
  async function undoLastDecision() {
    if (!lastDecision || !undoTo || busy) {
      return;
    }
    const decision = lastDecision;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await postSubmissionStatus(decision.id, undoTo);
      if (!result.ok) {
        setFeedback({ tone: "danger", message: result.message });
        return;
      }
      replaceSubmission(result.submission);
      if (submissionDetail?.id === result.submission.id) setSubmissionDetail(result.submission);
      setLastDecision(null);
      setFeedback({
        tone: "success",
        message: `Undone. "${result.submission.title}" is ${INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS[result.submission.status]]} again.`,
      });
      invalidateDevRailBadge("trip-reports");
      void loadSubmissionIndex();
    } finally {
      setBusy(false);
    }
  }

  function toggleChecked(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * One decision on every ticked submission, one request each so each item's
   * decision log records its own entry. Returns what happened for the notice.
   */
  async function runBulkDecision(status: Extract<TripReportSubmissionStatus, "rejected" | "spam">, targets: PortalRow[]) {
    setBusy(true);
    setFeedback(null);
    const failures: string[] = [];
    const done = new Set<string>();
    try {
      for (const row of targets) {
        const result = await postSubmissionStatus(row.id, status);
        if (result.ok) {
          replaceSubmission(result.submission);
          if (submissionDetail?.id === result.submission.id) setSubmissionDetail(result.submission);
          done.add(row.id);
        } else {
          failures.push(`${row.title}: ${result.message}`);
        }
      }
    } finally {
      setBusy(false);
    }
    setCheckedIds((current) => new Set([...current].filter((id) => !done.has(id))));
    setLastDecision(null);
    const verb = status === "spam" ? "Marked" : "Rejected";
    const tail = status === "spam" ? " as spam" : "";
    setBulkFeedback(
      failures.length === 0
        ? { tone: "success", message: `${verb} ${done.size} ${done.size === 1 ? "submission" : "submissions"}${tail}.` }
        : { tone: "danger", message: `${verb} ${done.size} of ${targets.length}${tail}. Not changed: ${failures.join("; ")}` },
    );
    invalidateDevRailBadge("trip-reports");
    void loadSubmissionIndex();
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
      const suggestedOwner =
        typeof payload.suggestedOwner?.email === "string" ? payload.suggestedOwner.email : null;
      const slug = typeof payload.payload?.slug === "string" ? payload.payload.slug : null;
      setAssignable(publish && suggestedOwner && slug ? { slug, email: suggestedOwner } : null);
      setFeedback({
        tone: "success",
        message: publish
          ? publishedNotice(selectedSubmission.title, suggestedOwner)
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

  /** Grant the just-published report to the matching member, through the same owner route My reports uses. */
  async function assignToSuggestedOwner() {
    if (!assignable || busy) {
      return;
    }
    const target = assignable;
    setBusy(true);
    try {
      const result = await assignReportOwner(target.slug, target.email);
      setAssignable(null);
      setFeedback({ tone: "success", message: assignedNotice(result.slug, result.ownerEmail) });
      void loadPublished();
    } catch (error) {
      setFeedback({
        tone: "danger",
        message: error instanceof Error ? error.message : "The owner was not assigned.",
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    assignable,
    assignToSuggestedOwner,
    bucket,
    bulkFeedback,
    busy,
    changeSubmissionStatus,
    checkedIds,
    lastDecision,
    orderedRows,
    runBulkDecision,
    setBulkFeedback,
    setCheckedIds,
    toggleChecked,
    undoLastDecision,
    undoTo,
    closeEditor,
    corpus,
    deleteReport,
    detailState,
    discardDialog,
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

type StatusResult = { ok: true; submission: TripReportSubmissionRow } | { ok: false; message: string };

/** One status write through the guarded route; the route resolves the actor and appends the log entry. */
async function postSubmissionStatus(
  id: string,
  status: TripReportSubmissionStatus,
  notes?: string,
  publicReason?: string,
): Promise<StatusResult> {
  try {
    const response = await fetch(`/api/trip-report-submissions/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ...(notes !== undefined ? { notes } : {}),
        ...(publicReason !== undefined ? { public_reason: publicReason } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, message: typeof payload.error === "string" ? payload.error : "Unable to update submission." };
    }
    const updated = payload.submission as TripReportSubmissionRow | undefined;
    return updated
      ? { ok: true, submission: updated }
      : { ok: false, message: "The updated submission response was incomplete." };
  } catch {
    return { ok: false, message: "Network error while updating the submission." };
  }
}

/**
 * Where undo takes a decided submission: back where it was when the
 * transitions allow it, else to Reviewing, which every decided status except
 * Published can reopen to. A published submission cannot be undone here.
 */
export function submissionUndoTarget(decision: {
  from: TripReportSubmissionStatus;
  to: TripReportSubmissionStatus;
}): TripReportSubmissionStatus | null {
  if (canTransitionTripReportSubmission(decision.to, decision.from)) return decision.from;
  return canTransitionTripReportSubmission(decision.to, "reviewing") ? "reviewing" : null;
}

/** A submission a bulk decision can move to `status`. */
export function canBulkDecide(row: PortalRow, status: "rejected" | "spam"): boolean {
  return (
    row.origin === "submission" &&
    row.status !== "published" &&
    canTransitionTripReportSubmission(row.status, status)
  );
}

const STATUS_FEEDBACK: Record<TripReportSubmissionStatus, (title: string) => string> = {
  submitted: (title) => `Returned "${title}" to the queue.`,
  reviewing: (title) => `Review started on "${title}".`,
  accepted: (title) => `Accepted "${title}". Publish it below when ready.`,
  rejected: (title) => `Rejected "${title}".`,
  spam: (title) => `Marked "${title}" as spam.`,
  exported: (title) => `Published "${title}".`,
};

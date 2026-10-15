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
  classifyRefusal,
  FREEZE_DECISION_COPY,
  FREEZE_SAVE_COPY,
  type WriteRefusal,
} from "./submissionReviewModel";
import {
  bucketOf,
  defaultSortFor,
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

/**
 * The result of the last write on the open record, shown in its pane's dock.
 * `kind` says what the dock offers with it: Undo after a decision, Load the
 * latest version after a conflict, the attribution choices after the byline
 * guard refused, the member assignment after a publish.
 */
export type PortalNotice = {
  tone: "success" | "danger" | "info" | "warning";
  message: string;
  title?: string;
  kind?: "decision" | "conflict" | "claim" | "frozen" | "published" | "loaded";
};
type Feedback = PortalNotice;

/** Every write the tool can start; the control that started it names its pending state. */
export type PortalPendingAction =
  | TripReportSubmissionStatus
  | "claim"
  | "release"
  | "reopen"
  | "undo"
  | "preview"
  | "publish"
  | "assign"
  | "save"
  | "delete"
  | "latest";

/** A notice at the list: what happened to something no longer open, or a link that found nothing. */
export type ListNotice = { tone: "success" | "danger" | "warning"; message: string };

const DISCARD_COPY = {
  description: "This report has changes that were not saved. Discarding them leaves the live page as it is now.",
};

export function useTripReportPortalController(initialSubmissionId?: string) {
  const { corpus, load, loadPublished, loadSubmissionIndex, updateReports, replaceSubmission } =
    useTripReportPortalCorpus();

  const [bucket, setBucket] = useState<PortalBucket>("needs");
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<PortalFacets>(EMPTY_PORTAL_FACETS);
  const [groupBy, setGroupBy] = useState<PortalGroupBy>("none");
  /** Null until the editor picks one: each bucket then opens in its own order. */
  const [sortChoice, setSortChoice] = useState<PortalSort | null>(null);
  const sort = sortChoice ?? defaultSortFor(bucket);
  const setSort = useCallback((next: PortalSort) => setSortChoice(next), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle" });
  const [draft, setDraft] = useState<TripReportEditableFields | null>(null);
  const [pending, setPending] = useState<PortalPendingAction | null>(null);
  const busy = pending !== null;
  const setBusy = (next: PortalPendingAction | false) => setPending(next === false ? null : next);
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
  /** A notice about something no longer open (a deleted report, a link that named nothing). */
  const [listNotice, setListNotice] = useState<ListNotice | null>(null);
  /** Bumped when a report's latest version replaces the draft, so the pane can say so and reset its choices. */
  const [reloadToken, setReloadToken] = useState(0);

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
  /** An attribution choice the pane holds apart from the draft; it counts as unsaved work too. */
  const [attributionDirty, setAttributionDirty] = useState(false);
  const dirty =
    selected?.origin === "published" &&
    draft !== null &&
    detail !== null &&
    detail.id === selected.id &&
    (JSON.stringify(draft) !== JSON.stringify(detail.fields) || attributionDirty);
  // The in-tool guard keeps row clicks, Prev/Next and Close; the shell owns
  // rail clicks, Leave and unload. A report save replaces the live page, so
  // the shell only discards.
  const openTitle = selected?.title?.trim() || "this report";
  const { guard, dialog: discardDialog } = useDirtyGuard(dirty, {
    ...DISCARD_COPY,
    title: `Discard your edits to “${openTitle}”?`,
    warnOnUnload: false,
  });
  useUnsavedWork({
    kind: "discard-only",
    because: "This change would go live. Publish it from the tool; leaving here never publishes.",
    id: "trip-report-submissions:report",
    tab: "trip-report-submissions",
    label: `Trip reports: edits to ${selected?.title?.trim() ? `"${selected.title.trim()}"` : "a published report"}`,
    dirty,
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

  // A deep link (`/dev/trip-report-submissions/<id>`, as the Inbox opens a
  // submission) selects that row once it has loaded, from whichever bucket
  // holds it. Once both reads are in and it is nowhere, the list says so.
  const initialOpenedRef = useRef(false);
  const [linkedBucket, setLinkedBucket] = useState<PortalBucket | null>(null);
  useEffect(() => {
    if (!initialSubmissionId || initialOpenedRef.current) return;
    const row = rows.find((entry) => entry.id === initialSubmissionId);
    if (!row) {
      if (load.corpus.status !== "loading" && load.submissions.status !== "loading") {
        initialOpenedRef.current = true;
        setListNotice({
          tone: "warning",
          message: "The link names a trip report or submission that is not here. It may have been removed, or its list did not load. Nothing else was opened.",
        });
      }
      return;
    }
    initialOpenedRef.current = true;
    if (row.origin === "published") {
      setBucket("published");
      setLinkedBucket("published");
    } else if (bucketOf(row) !== "needs") {
      setBucket("all");
      setLinkedBucket("all");
    }
    openRow(row);
  }, [initialSubmissionId, rows, openRow, load.corpus.status, load.submissions.status]);

  // The address follows the open record, so a reload or a shared link lands on it.
  // `replaceState` keeps Next's history state so the router does not treat it as a navigation.
  const addressRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const base = window.location.pathname.replace(/\/dev\/(trip-report-submissions|trip-reports)(\/.*)?$/, "/dev/$1");
    if (!/\/dev\/(trip-report-submissions|trip-reports)$/.test(base)) return;
    const next = selectedId ? `${base}/${encodeURIComponent(selectedId)}` : base;
    if (addressRef.current === null && !selectedId) {
      addressRef.current = window.location.pathname;
      return;
    }
    if (window.location.pathname === next) return;
    addressRef.current = next;
    window.history.replaceState(window.history.state, "", `${next}${window.location.search}`);
  }, [selectedId]);

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
    setLinkedBucket(null);
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

    setBusy("save");
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
        setFeedback(saveRefusalNotice(classifyRefusal(response.status, payload, "Unable to save that report.")));
        return false;
      }

      const fields = payload.fields as TripReportEditableFields | undefined;
      const revision = payload.revision;
      if (!fields || typeof revision !== "string") {
        setFeedback({ tone: "danger", message: "The saved report response was incomplete." });
        return false;
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
      setFeedback({
        tone: "success",
        message: `Saved "${fields.title}". The live page at /reports/${selected.publicSlug ?? ""} shows it now.`,
      });
      void loadPublished();
      return true;
    } catch {
      setFeedback({
        tone: "danger",
        message: "The answer was lost, so the save may or may not have gone through. Save again; a save that already landed is refused as a conflict rather than made twice.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Replace the draft with the report as it is live now; the pane asks before this drops edits. */
  async function loadLatest() {
    if (!selected || selected.origin !== "published") return;
    const id = selected.id;
    setBusy("latest");
    try {
      const response = await fetch(`${RECORD_API}?id=${encodeURIComponent(id)}`);
      const payload = await response.json().catch(() => ({}));
      const fields = payload?.report?.fields as TripReportEditableFields | undefined;
      const revision = payload?.report?.revision;
      if (!response.ok || !fields || typeof revision !== "string") {
        throw new Error(typeof payload?.error === "string" ? payload.error : "The latest version did not load. Try again.");
      }
      if (openReportRef.current !== id) return;
      setDetail({ id, fields, revision });
      setDraft(structuredClone(fields));
      setReloadToken((token) => token + 1);
      setFeedback({ tone: "info", kind: "loaded", message: "Loaded the latest version. Apply your edits again, then save." });
    } finally {
      setBusy(false);
    }
  }

  async function deleteReport() {
    if (!selected) {
      return;
    }

    setBusy("delete");
    setFeedback(null);
    try {
      const response = await fetch(RECORD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "delete", id: selected.id }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const refusal = classifyRefusal(response.status, payload, "Unable to delete that report.");
        setFeedback({
          tone: "danger",
          kind: refusal.kind === "frozen" ? "frozen" : undefined,
          message: refusal.kind === "frozen" ? "Writes are paused, so the report was not deleted." : refusal.message,
        });
        return;
      }

      updateReports((reports) => reports.filter((report) => report.id !== selected.id));
      setListNotice({ tone: "success", message: `Deleted "${selected.title}". /reports/${selected.publicSlug ?? ""} no longer exists.` });
      dropEditor();
      void loadPublished();
    } catch {
      setFeedback({ tone: "danger", message: "Network error while deleting the report." });
    } finally {
      setBusy(false);
    }
  }

  async function changeSubmissionStatus(
    status: TripReportSubmissionStatus,
    notes?: string,
    publicReason?: string,
    action: PortalPendingAction = status,
  ): Promise<boolean> {
    if (!selectedSubmission || busy) {
      return false;
    }

    const previousStatus = selectedSubmission.status;
    setBusy(action);
    setFeedback(null);
    try {
      const result = await postSubmissionStatus(selectedSubmission.id, status, notes, publicReason);
      if (!result.ok) {
        setFeedback(decisionRefusalNotice(result.refusal));
        return false;
      }
      const updated = result.submission;
      patchSubmission(updated);
      setLastDecision(
        updated.status !== previousStatus
          ? { id: updated.id, title: updated.title, from: previousStatus, to: updated.status }
          : null,
      );
      setFeedback({ tone: "success", kind: "decision", message: STATUS_FEEDBACK[updated.status](updated.title) });
      setPromotionPayload(null);
      invalidateDevRailBadge("trip-reports");
      void loadSubmissionIndex();
      return true;
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
    setBusy("undo");
    setFeedback(null);
    try {
      const result = await postSubmissionStatus(decision.id, undoTo);
      if (!result.ok) {
        setFeedback(decisionRefusalNotice(result.refusal));
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
    setBusy(status);
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
          failures.push(`${row.title}: ${result.refusal.kind === "frozen" ? "writes are paused" : result.refusal.message}`);
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

  /**
   * Preview (writes nothing public) or publish. `quiet` builds the preview the
   * publish confirm shows without a notice. Returns the payload the preview
   * describes, or null when the route refused.
   */
  async function runPromotion(
    publish: boolean,
    attribution: PromotionAttribution,
    { quiet = false }: { quiet?: boolean } = {},
  ): Promise<DataTripReportImportPayload | null> {
    if (!selectedSubmission) {
      return null;
    }

    setBusy(publish ? "publish" : "preview");
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
        const refusal = classifyRefusal(response.status, payload, "Unable to promote submission.");
        setFeedback(
          refusal.kind === "claim"
            ? {
                tone: "warning",
                kind: "claim",
                title: "The byline matches a contributor",
                message: `${refusal.message.split(". ")[0]}. Pick that contributor under Publishing, or tick “Publish without attribution”, then publish again.`,
              }
            : refusal.kind === "frozen"
              ? { tone: "danger", kind: "frozen", message: publish ? "Writes are paused, so nothing was published." : FREEZE_DECISION_COPY }
              : { tone: "danger", message: refusal.message },
        );
        return null;
      }

      const updated = payload.submission as TripReportSubmissionRow | undefined;
      if (!updated) {
        setFeedback({ tone: "danger", message: "The promotion response was incomplete." });
        return null;
      }
      // A preview changes nothing, so only a publish replaces the submission.
      if (publish) patchSubmission(updated);
      setPromotionPayload(payload.payload ?? null);
      const suggestedOwner =
        typeof payload.suggestedOwner?.email === "string" ? payload.suggestedOwner.email : null;
      const slug = typeof payload.payload?.slug === "string" ? payload.payload.slug : null;
      setAssignable(publish && suggestedOwner && slug ? { slug, email: suggestedOwner } : null);
      if (publish || !quiet) {
        setFeedback({
          tone: "success",
          kind: publish ? "published" : undefined,
          message: publish
            ? publishedNotice(selectedSubmission.title, suggestedOwner)
            : "Preview ready under Publishing. Nothing has been published yet.",
        });
      }

      if (publish) {
        setLastDecision(null);
        invalidateDevRailBadge("trip-reports");
        void loadSubmissionIndex();
        void loadPublished();
      }
      return (payload.payload as DataTripReportImportPayload | undefined) ?? null;
    } catch {
      setFeedback({ tone: "danger", message: "Network error while promoting the submission." });
      return null;
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
    setBusy("assign");
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
    setAttributionDirty,
    linkedBucket,
    listNotice,
    loadLatest,
    pending,
    reloadToken,
    setListNotice,
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

type StatusResult = { ok: true; submission: TripReportSubmissionRow } | { ok: false; refusal: WriteRefusal };

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
      return { ok: false, refusal: classifyRefusal(response.status, payload, "Unable to update submission.") };
    }
    const updated = payload.submission as TripReportSubmissionRow | undefined;
    return updated
      ? { ok: true, submission: updated }
      : { ok: false, refusal: { kind: "other", message: "The updated submission response was incomplete." } };
  } catch {
    return { ok: false, refusal: { kind: "other", message: "Network error while updating the submission." } };
  }
}

/** A refused decision in the dock: the freeze in its own words, anything else as the route said it. */
function decisionRefusalNotice(refusal: WriteRefusal): PortalNotice {
  return refusal.kind === "frozen"
    ? { tone: "danger", kind: "frozen", message: FREEZE_DECISION_COPY }
    : { tone: "danger", message: refusal.message };
}

/** A refused report save, with the way forward each refusal has. */
function saveRefusalNotice(refusal: WriteRefusal): PortalNotice {
  switch (refusal.kind) {
    case "frozen":
      return { tone: "danger", kind: "frozen", message: FREEZE_SAVE_COPY };
    case "conflict":
      return {
        tone: "danger",
        kind: "conflict",
        title: "Someone saved this report after you opened it.",
        message: "Your edits are still here. Copy anything you want to keep, then load the latest version and apply them again.",
      };
    case "claim":
      return {
        tone: "warning",
        kind: "claim",
        title: "The new byline matches a contributor",
        message: `${refusal.message.split(". ")[0]}. Pick that contributor under Byline and attribution, or tick “Keep the byline without attribution”, then save again.`,
      };
    default:
      return { tone: "danger", message: refusal.message };
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
  submitted: (title) => `Released "${title}" back to New.`,
  reviewing: (title) => `You are reviewing "${title}".`,
  accepted: (title) => `Accepted "${title}". Publish it when ready.`,
  rejected: (title) => `Rejected "${title}".`,
  spam: (title) => `Marked "${title}" as spam.`,
  exported: (title) => `Published "${title}".`,
};

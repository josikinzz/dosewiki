"use client";

/**
 * Trip reports: `/dev/trip-report-submissions` (alias `/dev/trip-reports`).
 *
 * One list of the published corpus and the intake queue, laid out as the
 * triage workspace: the list and its filters on the left (sticky from `lg`),
 * the open record docked on the right. A submission opens the review pane
 * with its decision dock; a published report opens the editing pane with its
 * save dock. On a phone the list is the view until a row is picked, the pane
 * then scrolls in with Back to list and a pager, and the dock owns the bottom
 * of the screen.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  EditorPanel,
  EditorSection,
  EditorStatusPill,
  LoadErrorState,
  Notice,
  SaveLine,
  useConfirm,
  useDevShortcuts,
  useScrollToDetail,
  useTriageShortcuts,
  useWriteFreeze,
  type DevShortcut,
} from "@/features/dev/components";
import { DevRailBadgeFreshness } from "@/features/dev/pages/DevRailBadgeFreshness";
import { useModifierKeyLabel } from "@/features/dev/pages/DevCommandPalette";
import { cn } from "@/lib/utils";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import { joinParts } from "../my-reports/myReportsModel";
import { PortalListColumn } from "./PortalListColumn";
import { PortalReportPane, type ReportAttribution } from "./PortalReportPane";
import { PortalSubmissionReview, type SubmissionTriageActions } from "./PortalSubmissionReview";
import {
  attributionMoved,
  changedReportParts,
  submissionHoldOf,
  submissionStatusLabel,
} from "./submissionReviewModel";
import {
  activeFacetCount,
  bucketOf,
  describePortalEmpty,
  EMPTY_PORTAL_FACETS,
  PORTAL_BUCKET_LABELS,
  type PortalRow,
} from "./tripReportPortalModel";
import { canBulkDecide, useTripReportPortalController } from "./useTripReportPortalController";

/** Keys the tool answers to beyond the shared triage keys. */
const TRIP_REPORT_SHORTCUTS: readonly DevShortcut[] = [
  { keys: "/", label: "Search reports" },
  { keys: "Esc", label: "Leave a field, or close the open report" },
];
const SAVE_SHORTCUTS: readonly DevShortcut[] = [{ keys: "Cmd+S", label: "Save and publish the open report" }];

const NO_ATTRIBUTION_CHANGE: ReportAttribution = { profileKey: null, confirmAuthorNameClaim: false };

export function TripReportPortalTab({
  initialSubmissionId,
  actorEmail = null,
}: { initialSubmissionId?: string; actorEmail?: string | null } = {}) {
  const controller = useTripReportPortalController(initialSubmissionId);
  const {
    assignable,
    assignToSuggestedOwner,
    bucket,
    busy,
    changeSubmissionStatus,
    closeEditor,
    corpus,
    deleteReport,
    detailState,
    discardDialog,
    draft,
    facets,
    feedback,
    groupBy,
    groups,
    load,
    loadCorpus,
    loadLatest,
    loadReportBody,
    loadSubmissionDetail,
    listNotice,
    orderedRows,
    pending,
    promotionPayload,
    query,
    queuePosition,
    reloadToken,
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
    setListNotice,
    setQuery,
    setSort,
    sort,
    stats,
    visible,
    bulkFeedback,
    checkedIds,
    lastDecision,
    runBulkDecision,
    setBulkFeedback,
    setCheckedIds,
    toggleChecked,
    undoLastDecision,
    undoTo,
  } = controller;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { frozen } = useWriteFreeze();
  const saveKeyLabel = useModifierKeyLabel("S");
  const triageRef = useRef<SubmissionTriageActions | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const paneHeadingRef = useRef<HTMLHeadingElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** The open report's attribution choice; reset whenever another report opens or the latest loads. */
  const [attribution, setAttribution] = useState<ReportAttribution>(NO_ATTRIBUTION_CHANGE);
  const attributionKey = `${selectedId ?? ""}:${reloadToken}`;
  const [attributionFor, setAttributionFor] = useState(attributionKey);
  if (attributionFor !== attributionKey) {
    setAttributionFor(attributionKey);
    setAttribution(NO_ATTRIBUTION_CHANGE);
  }

  // Picking a row below `lg` brings the pane into view and names the record for
  // keyboard and screen reader users. An effect, so a click into a field right
  // after cannot lose its focus to the heading.
  useScrollToDetail(paneRef, selectedId);
  const focusOnOpen = useRef(false);
  const paneReady = Boolean(selectedSubmission || (selected?.origin === "published" && selected.fields && draft));
  useEffect(() => {
    if (!paneReady || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    paneHeadingRef.current?.focus({ preventScroll: true });
  }, [paneReady, selectedId]);

  /**
   * Open a row. From the listbox, focus stays in the list so the arrow keys
   * keep walking it (the Feedback queue's rule); from anywhere else (the
   * pager, j/k, "Next waiting", a link across) the pane's heading takes it.
   */
  const pick = (row: PortalRow, { fromList = false }: { fromList?: boolean } = {}) => {
    if (row.id === selectedId) {
      if (!fromList) paneHeadingRef.current?.focus({ preventScroll: true });
      return;
    }
    focusOnOpen.current = !fromList;
    selectRow(row);
  };
  const move = (direction: -1 | 1) => {
    focusOnOpen.current = true;
    selectAdjacent(direction);
  };

  // Ticks only count while their row is in the list on screen.
  const checkedRows = visible.filter((row) => checkedIds.has(row.id));

  function bulkDecide(status: "rejected" | "spam") {
    const targets = checkedRows.filter((row) => canBulkDecide(row, status));
    if (targets.length === 0 || busy) {
      return;
    }
    const count = `${targets.length} ${targets.length === 1 ? "submission" : "submissions"}`;
    const skipped = checkedRows.length - targets.length;
    confirm({
      title: status === "spam" ? `Mark ${count} as spam?` : `Reject ${count}?`,
      description: `${
        status === "spam" ? "Each is filed as spam" : "Each is rejected"
      } and leaves the review queue. A wrong call can be reopened from All; authors are not notified, and no public reason is recorded.${
        skipped > 0 ? ` ${skipped} ticked ${skipped === 1 ? "row is" : "rows are"} left as they are.` : ""
      }`,
      confirmLabel: status === "spam" ? "Mark as spam" : "Reject",
      destructive: true,
      affected: targets.map((row) => row.title),
      affectedLabel: count,
      onConfirm: () => runBulkDecision(status, targets),
    });
  }

  const { helpDialog } = useTriageShortcuts({
    onMove: move,
    onAccept: () => triageRef.current?.accept(),
    onReject: () => triageRef.current?.reject(),
    onSpam: () => triageRef.current?.spam(),
    onNote: () => triageRef.current?.note(),
    onUndo: () => void undoLastDecision(),
  });
  useDevShortcuts(TRIP_REPORT_SHORTCUTS);

  // The open report: what changed, and Save behind a confirm that names it.
  const openReport = selected?.origin === "published" && selected.fields && draft ? selected : null;
  const savedFields = openReport?.fields ?? null;
  const attributionChanged = openReport ? attributionMoved(openReport.profileKey, attribution.profileKey) : false;
  const reportDirty =
    openReport !== null && savedFields !== null && draft !== null && (JSON.stringify(draft) !== JSON.stringify(savedFields) || attributionChanged);
  useDevShortcuts(SAVE_SHORTCUTS, openReport !== null);
  const { setAttributionDirty } = controller;
  useEffect(() => setAttributionDirty(attributionChanged || attribution.confirmAuthorNameClaim), [
    attributionChanged,
    attribution.confirmAuthorNameClaim,
    setAttributionDirty,
  ]);

  const confirmSave = () => {
    if (!openReport || !savedFields || !draft || busy || !reportDirty) return;
    const parts = joinParts(changedReportParts(savedFields, draft, attributionChanged));
    confirm({
      title: `Publish your changes to “${savedFields.title || openReport.title}”?`,
      description: `${parts ? `You changed ${parts}. ` : ""}Saving replaces the live page at /reports/${openReport.publicSlug ?? ""} right away, and readers see it as soon as it saves.`,
      confirmLabel: "Save and publish",
      onConfirm: () =>
        void saveReport({
          updates: draft,
          ...(attribution.profileKey !== null ? { profileKey: attribution.profileKey } : {}),
          ...(attribution.confirmAuthorNameClaim ? { confirmAuthorNameClaim: true } : {}),
        }).then((saved) => {
          if (saved) setAttribution(NO_ATTRIBUTION_CHANGE);
        }),
    });
  };
  const confirmSaveRef = useRef(confirmSave);
  confirmSaveRef.current = confirmSave;
  const reportOpen = openReport !== null;
  useEffect(() => {
    if (!reportOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) confirmSaveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportOpen]);

  const askLoadLatest = () =>
    confirm({
      title: "Load the latest version?",
      description:
        "Your edits here are dropped and the editor shows the report as it is live now. Copy anything you want to keep first.",
      confirmLabel: "Load latest",
      destructive: true,
      onConfirm: loadLatest,
    });

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadCorpus(selectedId ?? undefined);
    } finally {
      setRefreshing(false);
    }
  };

  const backToList = () => {
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    listRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
  };

  // Load failures: one card for both reads when both failed, else one per read where its rows would be.
  const corpusFailed = load.corpus.status === "error" ? load.corpus.message : null;
  const queueFailed = load.submissions.status === "error" ? load.submissions.message : null;
  const loadError =
    corpusFailed && queueFailed ? (
      <LoadErrorState what="trip reports" message={queueFailed} onRetry={() => void refresh()} busy={refreshing} />
    ) : queueFailed ? (
      <LoadErrorState what="the submission queue" message={queueFailed} onRetry={() => void refresh()} busy={refreshing} />
    ) : corpusFailed ? (
      <LoadErrorState what="published reports" message={corpusFailed} onRetry={() => void refresh()} busy={refreshing} />
    ) : null;
  const bucketLoading =
    (bucket !== "published" && load.submissions.status === "loading") ||
    (bucket !== "needs" && load.corpus.status === "loading");
  const bucketFailed =
    (bucket === "needs" && queueFailed !== null) || (bucket === "published" && corpusFailed !== null) || (corpusFailed !== null && queueFailed !== null);
  const empty = describePortalEmpty(rows, { bucket, query, facets, sort });

  // The oldest submission still waiting on a decision, other than the open one.
  const nextWaitingRow = useMemo(
    () =>
      [...rows]
        .filter((row) => row.origin === "submission" && row.id !== selectedId && (row.status === "submitted" || row.status === "reviewing"))
        .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt))[0] ?? null,
    [rows, selectedId],
  );

  const hiddenByList =
    selected && queuePosition.index < 0 ? (
      <p className="flex flex-wrap items-center gap-x-2">
        <Icon icon="lucide:eye-off" size={13} className="theme-text-faint shrink-0" />
        <span>
          {bucket !== "all" && bucketOf(selected) !== bucket
            ? `${PORTAL_BUCKET_LABELS[bucket]} does not list ${selected.origin === "published" ? "published reports" : `${selected.intakeStatus === "published" ? "published" : selected.intakeStatus} submissions`}, so this one is not in the list now.`
            : "Your search or filters hide this from the list."}
        </span>
        <Button
          type="button"
          variant="link"
          size="auto"
          className="text-sm"
          onClick={() => {
            setQuery("");
            setFacets(EMPTY_PORTAL_FACETS);
            if (bucket !== "all" && bucketOf(selected) !== bucket) setBucket("all");
          }}
        >
          Show it in the list
        </Button>
      </p>
    ) : null;

  const publishedRowFor = (reportId: string | undefined) =>
    reportId ? rows.find((row) => row.origin === "published" && row.id === reportId) ?? null : null;

  const bulkBar =
    checkedRows.length > 0 || bulkFeedback ? (
      <div className="space-y-2">
        {checkedRows.length > 0 ? (
          <div
            role="toolbar"
            aria-label="Bulk submission actions"
            className="flex flex-wrap items-center gap-2 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2"
          >
            <p className="theme-text-secondary mr-auto text-sm tabular-nums" aria-live="polite">
              {checkedRows.length} selected
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !checkedRows.some((row) => canBulkDecide(row, "spam"))}
              onClick={() => bulkDecide("spam")}
            >
              Mark as spam
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy || !checkedRows.some((row) => canBulkDecide(row, "rejected"))}
              onClick={() => bulkDecide("rejected")}
            >
              Reject
            </Button>
            <Button type="button" variant="quiet" size="quiet" disabled={busy} onClick={() => setCheckedIds(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}
        {bulkFeedback ? (
          <Notice placement="inline" tone={bulkFeedback.tone === "info" ? "info" : bulkFeedback.tone} dismiss={() => setBulkFeedback(null)}>
            {bulkFeedback.message}
          </Notice>
        ) : null}
      </div>
    ) : null;

  const statsLine = stats && stats.reports > 0
    ? `${stats.reports} reports from ${stats.authors} ${stats.authors === 1 ? "author" : "authors"}, covering ${stats.substances} ${stats.substances === 1 ? "substance" : "substances"}. New submissions wait here for a decision; published reports open to edit.`
    : "New submissions wait here for a decision; published reports open to edit.";

  // Below `lg` the pane waits for a pick; the idle pane is a desktop hint.
  const paneOpen = selected !== null;

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-6">
      {discardDialog}
      {confirmDialog}
      {helpDialog}
      <EditorSection icon="lucide:notebook-pen" title="Trip reports" description={statsLine}>
        <DevRailBadgeFreshness badge="trip-reports" noun="reports" />
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
        <PortalListColumn
          listRef={listRef}
          rows={rows}
          visibleCount={visible.length}
          groups={groups}
          bucket={bucket}
          onBucketChange={setBucket}
          needsKnown={load.submissions.status === "ready"}
          publishedKnown={load.corpus.status === "ready"}
          query={query}
          onQueryChange={setQuery}
          searchInputRef={searchInputRef}
          sort={sort}
          onSortChange={setSort}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          facets={facets}
          onFacetsChange={setFacets}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          notice={
            listNotice ? (
              <Notice placement="inline" tone={listNotice.tone} dismiss={() => setListNotice(null)}>
                {listNotice.message}
              </Notice>
            ) : null
          }
          bulk={bulkBar}
          error={loadError}
          loading={bucketLoading}
          hideList={bucketFailed}
          empty={visible.length === 0 ? empty : null}
          onShowEverything={() => setBucket("all")}
          onClearSearch={() => {
            setQuery("");
            setFacets(EMPTY_PORTAL_FACETS);
            searchInputRef.current?.focus();
          }}
          selectedId={selectedId}
          dirtyId={reportDirty ? selectedId : null}
          onSelect={(row) => pick(row, { fromList: true })}
          checkedIds={checkedIds}
          canCheck={(row) => canBulkDecide(row, "spam") || canBulkDecide(row, "rejected")}
          onToggleChecked={toggleChecked}
        />

        <section
          ref={paneRef}
          aria-label={selected ? `${selected.origin === "published" ? "Editor" : "Review"}: ${selected.title}` : "Review"}
          className={cn("scroll-mt-24", !paneOpen && "hidden lg:block")}
        >
          {selected?.origin === "published" && !(selected.fields && draft) ? (
            <OpeningPane
              title={selected.title}
              failed={detailState.status === "error" ? detailState.message : null}
              what="that report"
              onRetry={() => void loadReportBody(selected.id)}
              onBackToList={backToList}
            />
          ) : selected?.origin === "submission" && !selectedSubmission ? (
            <OpeningPane
              title={selected.title}
              failed={detailState.status === "error" ? detailState.message : null}
              what="that submission"
              onRetry={() => void loadSubmissionDetail(selected.id)}
              onBackToList={backToList}
            />
          ) : openReport && draft && savedFields ? (
            <PortalReportPane
              // Keyed so a draft never carries over to another report.
              key={openReport.id}
              row={openReport}
              saved={savedFields}
              draft={draft}
              attribution={attribution}
              onAttributionChange={setAttribution}
              contributors={corpus.contributors}
              dirty={reportDirty}
              pending={pending}
              busy={busy}
              saveKeyLabel={saveKeyLabel}
              notice={feedback}
              onDismissNotice={() => setFeedback(null)}
              onLoadLatest={askLoadLatest}
              onChange={setDraft}
              onSave={confirmSave}
              onDiscard={() => {
                setDraft(structuredClone(savedFields as TripReportEditableFields));
                setAttribution(NO_ATTRIBUTION_CHANGE);
              }}
              onDelete={() => void deleteReport().then(() => requestAnimationFrame(backToList))}
              onClose={closeEditor}
              onBackToList={backToList}
              headingRef={paneHeadingRef}
              position={queuePosition.index >= 0 ? queuePosition : null}
              onMove={move}
              hiddenByList={hiddenByList}
              saveLine={<SaveLine model="instant" />}
            />
          ) : selectedSubmission ? (
            <PortalSubmissionReview
              key={selectedSubmission.id}
              submission={selectedSubmission}
              hold={submissionHoldOf(selectedSubmission, actorEmail)}
              pending={pending}
              busy={busy}
              frozen={frozen}
              contributors={corpus.contributors}
              notice={feedback}
              onDismissNotice={() => setFeedback(null)}
              undo={
                lastDecision && undoTo && lastDecision.id === selectedSubmission.id
                  ? {
                      label: `“${lastDecision.title}” back to ${submissionStatusLabel(undoTo)}`,
                      onUndo: () => void undoLastDecision(),
                    }
                  : null
              }
              assign={assignable ? { email: assignable.email, onAssign: () => void assignToSuggestedOwner() } : null}
              nextWaiting={nextWaitingRow ? { title: nextWaitingRow.title, onOpen: () => pick(nextWaitingRow) } : null}
              publishedReport={(() => {
                const report = publishedRowFor(selectedSubmission.exported_trip_report_id);
                return report
                  ? {
                      slug: report.publicSlug,
                      onOpen: () => {
                        if (bucket === "needs") setBucket("all");
                        pick(report);
                      },
                    }
                  : null;
              })()}
              headingRef={paneHeadingRef}
              position={queuePosition.index >= 0 ? queuePosition : null}
              onMove={move}
              onBackToList={backToList}
              onClose={closeEditor}
              hiddenByList={hiddenByList}
              promotionPayload={promotionPayload}
              triageRef={triageRef}
              onPromotion={runPromotion}
              onStatusChange={changeSubmissionStatus}
            />
          ) : (
            <IdlePane
              waiting={orderedRows.length > 0}
              undo={
                lastDecision && undoTo ? (
                  <Button
                    type="button"
                    variant="link"
                    size="auto"
                    className="text-sm"
                    disabled={busy}
                    aria-keyshortcuts="u"
                    onClick={() => void undoLastDecision()}
                  >
                    Undo: “{lastDecision.title}” back to {submissionStatusLabel(undoTo)}
                  </Button>
                ) : null
              }
              filtered={activeFacetCount(facets) > 0 || query.trim() !== ""}
            />
          )}
        </section>
      </div>
    </div>
  );
}

/** A picked row whose record is still on its way, or failed to arrive. */
function OpeningPane({
  title,
  failed,
  what,
  onRetry,
  onBackToList,
}: {
  title: string;
  failed: string | null;
  what: string;
  onRetry: () => void;
  onBackToList: () => void;
}) {
  return (
    <EditorPanel className="space-y-4 p-4 sm:p-5">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 lg:hidden" onClick={onBackToList}>
        <Icon icon="lucide:arrow-left" size={14} />
        Back to list
      </Button>
      <h3 className="theme-accent-heading break-words text-xl font-semibold leading-tight">{title}</h3>
      {failed ? (
        <LoadErrorState what={what} message={failed} onRetry={onRetry} />
      ) : (
        <EditorStatusPill tone="info" loading live>
          Opening “{title}”
        </EditorStatusPill>
      )}
    </EditorPanel>
  );
}

/** What the pane says on desktop before a row is open. Hidden on phones, where the list is the whole view. */
function IdlePane({
  waiting,
  undo,
  filtered,
}: {
  waiting: boolean;
  undo: React.ReactNode;
  filtered: boolean;
}) {
  return (
    <div className="space-y-3">
      {undo ? <p className="theme-text-muted text-sm">{undo}</p> : null}
      <EditorPanel variant="subtle" className="space-y-3 px-5 py-6">
        <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
          <Icon icon="lucide:notebook-pen" size={18} className="theme-icon-accent shrink-0" />
          {waiting ? "Pick a report to open it here" : filtered ? "Nothing in this view" : "Nothing to open"}
        </p>
        <p className="theme-text-muted max-w-[60ch] text-sm">
          A submission opens for review: claim it, accept, reject or mark it as spam, and publish it once accepted. A
          published report opens to edit; each save asks first and replaces the live page.
          <span className="[@media(pointer:coarse)]:hidden">
            {" "}
            Press <kbd className="theme-dev-kbd">j</kbd> to start at the top.
          </span>
        </p>
        {/* The shared line: it says how decisions and saves land, and turns into the freeze sentence while writes are paused. */}
        <SaveLine model="instant" />
      </EditorPanel>
    </div>
  );
}

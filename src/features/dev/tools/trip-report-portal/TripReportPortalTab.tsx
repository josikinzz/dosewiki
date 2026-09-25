"use client";

import { useRef, useState } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Button } from "@/components/ui/button";
import {
  ActionNotice,
  EditorActionGroup,
  EditorNotice,
  EditorPanel,
  EditorToolbar,
  TagToken,
  TriageShortcutHint,
  useConfirm,
  useDevShortcuts,
  useTriageShortcuts,
  type DevShortcut,
} from "@/features/dev/components";
import { DevRailBadgeFreshness } from "@/features/dev/pages/DevRailBadgeFreshness";
import { INTAKE_STATUS_LABEL, TRIP_REPORT_INTAKE_STATUS } from "@/features/intake/intakeStatus";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import { PortalOrganizerRail } from "./PortalOrganizerRail";
import { PortalReportEditor } from "./PortalReportEditor";
import { PortalSubmissionReview, type SubmissionTriageActions } from "./PortalSubmissionReview";
import { PortalReportList } from "./PortalReportList";
import {
  activeFacetCount,
  EMPTY_PORTAL_FACETS,
  toggleFacetValue,
  type PortalFacetKind,
  type PortalSort,
} from "./tripReportPortalModel";
import { canBulkDecide, useTripReportPortalController } from "./useTripReportPortalController";

const SORTS: { value: PortalSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Title" },
];

/** Keys the portal answers to beyond the shared triage keys. */
const TRIP_REPORT_SEARCH_SHORTCUTS: readonly DevShortcut[] = [
  { keys: "/", label: "Search submissions" },
  { keys: "Esc", label: "Leave a field, or close the open submission" },
];

export function TripReportPortalTab({ initialSubmissionId }: { initialSubmissionId?: string } = {}) {
  // Below xl the list folds into a strip above the open record; this is that
  // strip's disclosure. At xl the list has its own column and ignores it.
  const [stripOpen, setStripOpen] = useState(true);
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
    bulkFeedback,
    checkedIds,
    lastDecision,
    runBulkDecision,
    setBulkFeedback,
    setCheckedIds,
    toggleChecked,
    undoLastDecision,
    undoTo,
  } = useTripReportPortalController(initialSubmissionId);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const triageRef = useRef<SubmissionTriageActions | null>(null);

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
      } and leaves the review queue. A wrong call can be reopened from the All bucket; authors are not notified.${
        skipped > 0 ? ` ${skipped} ticked ${skipped === 1 ? "row is" : "rows are"} left as they are.` : ""
      }`,
      confirmLabel: status === "spam" ? "Mark as spam" : "Reject",
      destructive: true,
      affected: targets.map((row) => row.title),
      onConfirm: () => runBulkDecision(status, targets),
    });
  }

  const { helpDialog } = useTriageShortcuts({
    onMove: selectAdjacent,
    onAccept: () => triageRef.current?.accept(),
    onReject: () => triageRef.current?.reject(),
    onSpam: () => triageRef.current?.spam(),
    onNote: () => triageRef.current?.note(),
    onUndo: () => void undoLastDecision(),
  });
  useDevShortcuts(TRIP_REPORT_SEARCH_SHORTCUTS);

  return (
    <div className="space-y-4">
      {discardDialog}
      {confirmDialog}
      {helpDialog}
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="theme-accent-heading font-display text-2xl font-semibold">Trip Report Portal</h2>
          <p className="theme-text-faint mt-0.5 font-mono text-xs tabular-nums">
            {stats
              ? `${stats.reports} reports · ${stats.authors} authors · ${stats.substances} substances`
              : "Totals pending until every dataset is available"}
          </p>
        </div>
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={() => void loadCorpus(selectedId ?? undefined)}>
          Reload
        </Button>
      </header>

      {load.corpus.status === "error" ? (
        <EditorNotice
          notice={{
            tone: "danger",
            title: "Published reports unavailable",
            message: load.corpus.message,
            actions: (
              <Button type="button" variant="outline" size="sm" onClick={() => void loadCorpus()}>
                Try again
              </Button>
            ),
          }}
        />
      ) : null}

      {load.submissions.status === "error" ? (
        <EditorNotice
          notice={{
            tone: "danger",
            title: "Submission queue unavailable",
            message: load.submissions.message,
            actions: (
              <Button type="button" variant="outline" size="sm" onClick={() => void loadCorpus()}>
                Try again
              </Button>
            ),
          }}
        />
      ) : null}

      <DevRailBadgeFreshness badge="trip-reports" noun="reports" />

      <div
        className={`grid gap-4 ${
          editorOpen
            ? "lg:grid-cols-[17.5rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_20rem_minmax(0,1fr)]"
            : "lg:grid-cols-[17.5rem_minmax(0,1fr)]"
        }`}
      >
          <PortalOrganizerRail
            complete={stats !== null}
            bucket={bucket}
            facets={facets}
            groupBy={groupBy}
            needsComplete={load.submissions.status === "ready"}
            query={query}
            rows={rows}
            searchInputRef={searchInputRef}
            onBucketChange={setBucket}
            onGroupByChange={setGroupBy}
            onQueryChange={setQuery}
            onClearFacet={(kind) => setFacets((current) => ({ ...current, [kind]: [] }))}
            onToggleFacet={(kind: PortalFacetKind, value: string) =>
              setFacets((current) => toggleFacetValue(current, kind, value))
            }
          />

          {/*
            One grid cell below xl (list strip stacked over the open record),
            dissolved into separate cells at xl where the list has a column.
          */}
          <div className="min-w-0 space-y-4 xl:contents">
            <main className="min-w-0">
              <div className="theme-portal-rule flex flex-wrap items-center gap-2.5 border-b px-1 pb-2.5">
                <p className="theme-text-faint text-xs tabular-nums">
                  <span className="theme-text-secondary font-semibold">{visible.length}</span> of {rows.length}
                  {stats ? "" : " loaded"}
                </p>

                {(["substance", "author", "tag"] as const).flatMap((kind) =>
                  facets[kind].map((value) => (
                    <TagToken
                      key={`${kind}:${value}`}
                      label={value}
                      variant="compact"
                      removeLabel={`Remove filter ${value}`}
                      onRemove={() => setFacets((current) => toggleFacetValue(current, kind, value))}
                    />
                  )),
                )}
                {activeFacetCount(facets) > 0 ? (
                  <button
                    type="button"
                    onClick={() => setFacets(EMPTY_PORTAL_FACETS)}
                    className="theme-text-faint hover:text-dose-text text-xs"
                  >
                    Clear all
                  </button>
                ) : null}

                <span className="flex-1" />
                {editorOpen ? (
                  <ExpandButton
                    className="xl:hidden"
                    isExpanded={stripOpen}
                    label={stripOpen ? "Hide list" : "Show list"}
                    ariaLabel={stripOpen ? "Hide the report list" : "Show the report list"}
                    ariaControls="trip-report-portal-list"
                    onToggle={() => setStripOpen((current) => !current)}
                  />
                ) : (
                  SORTS.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      data-active={sort === entry.value}
                      onClick={() => setSort(entry.value)}
                      className="theme-control-pill rounded-full px-2.5 py-1 text-xs"
                    >
                      {entry.label}
                    </button>
                  ))
                )}
              </div>

              <div
                id="trip-report-portal-list"
                className={
                  editorOpen
                    ? `[--portal-list-max:14rem] xl:[--portal-list-max:calc(100vh-12rem)] ${stripOpen ? "" : "hidden xl:block"}`
                    : undefined
                }
              >
                {bulkFeedback || (lastDecision && undoTo) || checkedRows.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 px-1 py-2">
                    {checkedRows.length > 0 ? (
                      <EditorToolbar label="Bulk submission actions" variant="compact">
                        <span className="theme-text-secondary text-xs tabular-nums" aria-live="polite">
                          {checkedRows.length} selected
                        </span>
                        <EditorActionGroup label="Bulk decision">
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
                            variant="ghostDestructive"
                            size="sm"
                            disabled={busy || !checkedRows.some((row) => canBulkDecide(row, "rejected"))}
                            onClick={() => bulkDecide("rejected")}
                          >
                            Reject
                          </Button>
                          <Button type="button" variant="quiet" size="quiet" disabled={busy} onClick={() => setCheckedIds(new Set())}>
                            Clear
                          </Button>
                        </EditorActionGroup>
                      </EditorToolbar>
                    ) : null}
                    {bulkFeedback ? (
                      <ActionNotice tone={bulkFeedback.tone} onDismiss={() => setBulkFeedback(null)}>
                        {bulkFeedback.message}
                      </ActionNotice>
                    ) : null}
                    {lastDecision && undoTo ? (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void undoLastDecision()}>
                        Undo: &ldquo;{lastDecision.title}&rdquo; back to{" "}
                        {INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS[undoTo]]}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {bucket === "needs" && load.submissions.status === "error" ? null : (
                  <PortalReportList
                    compact={editorOpen}
                    groups={groups}
                    selectedId={selectedId}
                    onSelect={selectRow}
                    checkedIds={checkedIds}
                    canCheck={(row) => canBulkDecide(row, "spam") || canBulkDecide(row, "rejected")}
                    onToggleChecked={toggleChecked}
                    maxHeight={editorOpen ? "var(--portal-list-max)" : "min(75vh, 960px)"}
                  />
                )}
                <TriageShortcutHint className="mt-2 px-1" />
              </div>
            </main>

            {selected?.origin === "published" && !selected.fields ? (
              detailState.status === "error" ? (
                <EditorNotice
                  notice={{
                    tone: "danger",
                    title: "Unable to open that report",
                    message: detailState.message,
                    actions: (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadReportBody(selected.id)}
                      >
                        Try again
                      </Button>
                    ),
                  }}
                />
              ) : (
                <EditorPanel variant="empty" className="p-8 text-center text-sm">
                  Loading “{selected.title}”…
                </EditorPanel>
              )
            ) : null}

            {selected?.origin === "submission" && !selectedSubmission ? (
              detailState.status === "error" ? (
                <EditorNotice
                  notice={{
                    tone: "danger",
                    title: "Unable to open that submission",
                    message: detailState.message,
                    actions: (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadSubmissionDetail(selected.id)}
                      >
                        Try again
                      </Button>
                    ),
                  }}
                />
              ) : (
                <EditorPanel variant="empty" className="p-8 text-center text-sm">
                  Loading “{selected.title}”…
                </EditorPanel>
              )
            ) : null}

            {selected && draft && selected.fields ? (
              <PortalReportEditor
                // Keyed so a draft never carries over to another report.
                key={selected.id}
                busy={busy}
                contributors={corpus.contributors}
                draft={draft}
                feedback={feedback}
                row={selected}
                onChange={setDraft}
                onClose={closeEditor}
                onDelete={() => void deleteReport()}
                onDismissFeedback={() => setFeedback(null)}
                onRevert={() => setDraft(structuredClone(selected.fields as TripReportEditableFields))}
                onSave={(request) => void saveReport(request)}
              />
            ) : null}

            {selectedSubmission ? (
              <PortalSubmissionReview
                key={selectedSubmission.id}
                busy={busy}
                contributors={corpus.contributors}
                triageRef={triageRef}
                feedback={feedback}
                feedbackAction={
                  assignable ? (
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void assignToSuggestedOwner()}>
                      Assign to this member
                    </Button>
                  ) : null
                }
                promotionPayload={promotionPayload}
                queuePosition={queuePosition}
                submission={selectedSubmission}
                onClose={closeEditor}
                onDismissFeedback={() => setFeedback(null)}
                onNavigate={selectAdjacent}
                onPromotion={(publish, attribution) => void runPromotion(publish, attribution)}
                onStatusChange={(status, notes, publicReason) => void changeSubmissionStatus(status, notes, publicReason)}
              />
            ) : null}
          </div>
        </div>
    </div>
  );
}

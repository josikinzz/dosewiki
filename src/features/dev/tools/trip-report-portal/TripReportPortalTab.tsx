"use client";

import { Button } from "@/components/ui/button";
import {
  EditorNotice,
  EditorPanel,
  TagToken,
} from "@/features/dev/components";
import type { TripReportEditableFields } from "../../../../../convex/lib/tripReportEditing";
import { PortalOrganizerRail } from "./PortalOrganizerRail";
import { PortalReportEditor } from "./PortalReportEditor";
import { PortalSubmissionReview } from "./PortalSubmissionReview";
import { PortalReportList } from "./PortalReportList";
import {
  activeFacetCount,
  EMPTY_PORTAL_FACETS,
  toggleFacetValue,
  type PortalFacetKind,
  type PortalSort,
} from "./tripReportPortalModel";
import { useTripReportPortalController } from "./useTripReportPortalController";

const SORTS: { value: PortalSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Title" },
];

export function TripReportPortalTab() {
  const {
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
    rows,
    runPromotion,
    saveReport,
    searchInputRef,
    selected,
    selectedId,
    selectedSubmission,
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
  } = useTripReportPortalController();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="theme-accent-heading font-display text-2xl font-semibold">Trip Report Portal</h2>
          <p className="theme-text-faint mt-0.5 font-mono text-xs tabular-nums">
            {stats.reports} reports · {stats.authors} authors · {stats.substances} substances
          </p>
        </div>
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={() => void loadCorpus(selectedId ?? undefined)}>
          Reload
        </Button>
      </header>

      {load.status === "error" ? (
        <EditorNotice
          notice={{
            tone: "danger",
            title: "Unable to load trip reports",
            message: load.message,
            actions: (
              <Button type="button" variant="outline" size="sm" onClick={() => void loadCorpus()}>
                Try again
              </Button>
            ),
          }}
        />
      ) : null}

      {load.status === "loading" ? (
        <EditorPanel variant="empty" className="p-8 text-center text-sm">
          Loading the trip report corpus…
        </EditorPanel>
      ) : (
        <div
          className={`grid gap-4 ${
            editorOpen
              ? "lg:grid-cols-[17.5rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_20rem_minmax(0,1fr)]"
              : "lg:grid-cols-[17.5rem_minmax(0,1fr)]"
          }`}
        >
          <PortalOrganizerRail
            bucket={bucket}
            facets={facets}
            groupBy={groupBy}
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

          <main className={`min-w-0 ${editorOpen ? "hidden xl:block" : ""}`}>
            <div className="theme-portal-rule flex flex-wrap items-center gap-2.5 border-b px-1 pb-2.5">
              <p className="theme-text-faint text-xs tabular-nums">
                <span className="theme-text-secondary font-semibold">{visible.length}</span> of {rows.length}
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
              {editorOpen
                ? null
                : SORTS.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      data-active={sort === entry.value}
                      onClick={() => setSort(entry.value)}
                      className="theme-control-pill rounded-full px-2.5 py-1 text-xs"
                    >
                      {entry.label}
                    </button>
                  ))}
            </div>

            <PortalReportList
              compact={editorOpen}
              groups={groups}
              selectedId={selectedId}
              onSelect={selectRow}
            />
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
              feedback={feedback}
              promotionPayload={promotionPayload}
              submission={selectedSubmission}
              onClose={closeEditor}
              onDismissFeedback={() => setFeedback(null)}
              onPromotion={(publish, attribution) => void runPromotion(publish, attribution)}
              onStatusChange={(status, notes) => void changeSubmissionStatus(status, notes)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

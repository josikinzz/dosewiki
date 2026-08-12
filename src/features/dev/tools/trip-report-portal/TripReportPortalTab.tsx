"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  EditorNotice,
  EditorPanel,
  TagToken,
} from "@/features/dev/components";
import type {
  ConvexTripReportImportPayload,
  TripReportSubmissionRow,
  TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";
import type { TripReportEditableFields } from "../../../../../convex/lib/tripReportEditing";
import { PortalOrganizerRail } from "./PortalOrganizerRail";
import { PortalReportEditor, type EditorSaveRequest } from "./PortalReportEditor";
import { PortalSubmissionReview, type PromotionAttribution } from "./PortalSubmissionReview";
import { PortalReportList } from "./PortalReportList";
import {
  activeFacetCount,
  EMPTY_PORTAL_FACETS,
  filterPortalRows,
  groupPortalRows,
  portalStats,
  toggleFacetValue,
  toPortalRowFromReport,
  toPortalRowFromSubmission,
  type PortalBucket,
  type PortalContributorOption,
  type PortalFacetKind,
  type PortalFacets,
  type PortalGroupBy,
  type PortalRow,
  type PortalSort,
  type PublishedReportPayload,
} from "./tripReportPortalModel";

const CORPUS_API = "/api/dev/trip-reports";
const RECORD_API = "/api/dev/trip-reports/record";
const QUEUE_API = "/api/trip-report-submissions/queue";

const SORTS: { value: PortalSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Title" },
];

type CorpusPayload = {
  reports: PublishedReportPayload[];
  contributors: PortalContributorOption[];
  submissions: TripReportSubmissionRow[];
};

type LoadState = { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

type Feedback = { tone: "success" | "danger"; message: string };

/**
 * Last corpus this tab saw, kept outside React so leaving and re-entering the
 * tab paints the previous rows immediately instead of replaying the loading
 * state. The refetch still runs on every mount — it just happens behind the
 * already-rendered list.
 */
let cachedCorpus: CorpusPayload | null = null;

export function TripReportPortalTab() {
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
  const [draft, setDraft] = useState<TripReportEditableFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [promotionPayload, setPromotionPayload] = useState<ConvexTripReportImportPayload | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const loadCorpus = useCallback(async (preferredId?: string) => {
    // A cached corpus is already on screen, so a refresh must not blank it out.
    if (!cachedCorpus) {
      setLoad({ status: "loading" });
    }

    try {
      const [corpusResponse, queueResponse] = await Promise.all([
        fetch(CORPUS_API),
        fetch(QUEUE_API),
      ]);

      if (!corpusResponse.ok) {
        setLoad({ status: "error", message: await readError(corpusResponse, "Failed to load the corpus.") });
        return;
      }

      const corpusPayload = await corpusResponse.json();
      const queuePayload = queueResponse.ok ? await queueResponse.json() : { submissions: [] };

      const next: CorpusPayload = {
        reports: Array.isArray(corpusPayload.reports) ? corpusPayload.reports : [],
        contributors: Array.isArray(corpusPayload.contributors) ? corpusPayload.contributors : [],
        submissions: Array.isArray(queuePayload.submissions) ? queuePayload.submissions : [],
      };

      cachedCorpus = next;
      setCorpus(next);
      setLoad({ status: "ready" });

      if (preferredId) {
        setSelectedId(preferredId);
      }
    } catch {
      setLoad({ status: "error", message: "Failed to reach the trip report endpoints." });
    }
  }, []);

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

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const selectedSubmission = useMemo(
    () =>
      selected?.origin === "submission"
        ? corpus.submissions.find((submission) => submission.id === selected.id) ?? null
        : null,
    [corpus.submissions, selected],
  );

  const stats = useMemo(() => portalStats(rows), [rows]);
  const editorOpen = selected !== null;

  const selectRow = useCallback((row: PortalRow) => {
    setSelectedId(row.id);
    setFeedback(null);
    setPromotionPayload(null);
    setDraft(row.fields ? structuredClone(row.fields) : null);
  }, []);

  const closeEditor = useCallback(() => {
    setSelectedId(null);
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
    if (!selected || !selected.fields) {
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

      setFeedback({ tone: "success", message: `Moved "${selectedSubmission.title}" to ${status}.` });
      setPromotionPayload(null);
      await loadCorpus(selectedSubmission.id);
    } catch {
      setFeedback({ tone: "danger", message: "Network error while updating the submission." });
    }
  }

  async function runPromotion(publish: boolean, attribution: PromotionAttribution) {
    if (!selectedSubmission) {
      return;
    }

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
        message: publish ? "Submission published to public trip reports." : "Promotion preview built.",
      });

      if (publish) {
        await loadCorpus();
      }
    } catch {
      setFeedback({ tone: "danger", message: "Network error while promoting the submission." });
    }
  }

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

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => ({}));
  return typeof payload.error === "string" ? payload.error : fallback;
}

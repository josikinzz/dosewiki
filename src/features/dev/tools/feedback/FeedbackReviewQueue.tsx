"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ActionNotice,
  EditorActionGroup,
  EditorField,
  EditorList,
  EditorListItem,
  EditorPanel,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  LoadErrorState,
  useConfirm,
  useDirtyGuard,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import { DecisionLogSection } from "@/features/dev/tools/DecisionLogSection";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { DevRailBadgeFreshness } from "@/features/dev/pages/DevRailBadgeFreshness";
import { decisionLogOf, type DecisionLogEntry } from "@/features/intake/decisionLog";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";

import {
  QUEUE_STATUSES,
  defaultSort,
  totalFor,
  type FeedbackPage,
  type FeedbackPageQuery,
  type QueueSort,
  type StatusCounts,
} from "./feedbackQueueModel";

export type FeedbackQueueStatus = "new" | "reviewing" | "resolved" | "rejected" | "spam";

export type FeedbackQueueFilter = FeedbackQueueStatus | "all";

export type FeedbackTransitionInput = { status: FeedbackQueueStatus; note?: string };

export type FeedbackQueueItem = {
  id: string;
  status: FeedbackQueueStatus;
  details: string;
  created_at: string;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  decision_log?: DecisionLogEntry<FeedbackQueueStatus>[];
};

/** How much a reader said a report matters; the queue shows it as a pill and can sort by it. */
export type FeedbackImportance = "critical" | "high" | "normal" | "low";

export type FeedbackSourceAdapter<Item extends FeedbackQueueItem> = {
  source: "article" | "site" | "glossary";
  /**
   * One page of the queue with status, search and order applied by the
   * source, plus the per-status counts of every row the search matches.
   */
  fetchPage: (query: FeedbackPageQuery) => Promise<FeedbackPage<Item>>;
  transition: (id: string, input: FeedbackTransitionInput) => Promise<Item>;
  transitions: Record<FeedbackQueueStatus, FeedbackQueueStatus[]>;
  /** The row's importance, for sources whose form asks for one. */
  importance?: (item: Item) => FeedbackImportance | null | undefined;
  /** Source-specific header and metadata; the queue renders details, notes, and decisions. */
  renderDetail: (item: Item) => ReactNode;
  /**
   * True when the source stores a decision log, so the review shows every
   * decision. A source without one shows only its latest note.
   */
  keepsDecisionLog?: boolean;
  labels: {
    icon: string;
    title: string;
    description: string;
    emptyQueue: string;
    itemTitle: (item: Item) => string;
    itemSubtitle: (item: Item) => string | null;
    transitioned: (item: Item, statusLabel: string) => string;
  };
};

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type MoreState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string };

type ActionFeedback = { tone: "success" | "danger"; message: string };

/** Pause after the last keystroke before the search goes to the server. */
const SEARCH_DEBOUNCE_MS = 250;

const QUEUE_FILTERS: FeedbackQueueFilter[] = ["all", ...QUEUE_STATUSES];

const STATUS_LABELS: Record<FeedbackQueueFilter, string> = {
  all: "All",
  new: "New",
  reviewing: "Reviewing",
  resolved: "Resolved",
  rejected: "Rejected",
  spam: "Spam",
};

const STATUS_PILL_TONE: Record<FeedbackQueueStatus, EditorStatusPillTone> = {
  new: "info",
  reviewing: "caution",
  resolved: "success",
  rejected: "danger",
  spam: "danger",
};

/** Decisions that take the row off the queue and are asked about before they write. */
const CONFIRMED_DECISIONS: Record<
  Extract<FeedbackQueueStatus, "rejected" | "spam">,
  { title: string; verb: string; confirmLabel: string; destructive: boolean }
> = {
  rejected: { title: "Reject this feedback?", verb: "Rejecting", confirmLabel: "Reject", destructive: true },
  spam: { title: "Mark as spam?", verb: "Marking", confirmLabel: "Mark as spam", destructive: false },
};

const IMPORTANCE_LABELS: Record<FeedbackImportance, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const IMPORTANCE_PILL_TONE: Record<FeedbackImportance, EditorStatusPillTone> = {
  critical: "danger",
  high: "caution",
  normal: "info",
  low: "neutral",
};

const SORT_LABELS: Record<QueueSort, string> = {
  oldest: "Oldest first",
  newest: "Newest first",
  importance: "Importance",
};

export function isFeedbackQueueFilter(value: unknown): value is FeedbackQueueFilter {
  return typeof value === "string" && (QUEUE_FILTERS as string[]).includes(value);
}

/** "3 new · 4 resolved": the statuses that have rows, in queue order. */
function describeCounts(counts: StatusCounts): string {
  const parts = QUEUE_STATUSES.filter((status) => counts[status] > 0).map(
    (status) => `${counts[status]} ${STATUS_LABELS[status].toLowerCase()}`,
  );
  return parts.length === 0 ? "Empty" : parts.join(" · ");
}

/**
 * Where the automatic filter goes when its status has nothing: New, then
 * Reviewing, then everything, so the queue opens on the oldest waiting work.
 */
function automaticFallback(filter: FeedbackQueueFilter, counts: StatusCounts): FeedbackQueueFilter {
  if (filter === "new" && counts.new === 0) {
    return counts.reviewing > 0 ? "reviewing" : "all";
  }
  if (filter === "reviewing" && counts.reviewing === 0) {
    return "all";
  }
  return filter;
}

export type FeedbackDraftGuard = (proceed: () => void) => void;

export function FeedbackReviewQueue<Item extends FeedbackQueueItem>({
  adapter,
  headerActions,
  statusFilter,
  onStatusFilterChange,
}: {
  adapter: FeedbackSourceAdapter<Item>;
  /**
   * Trailing controls on the tool heading, such as the tab's source filter.
   * They receive the queue's draft guard: a control that replaces the queue
   * runs its change through `guard` so a typed note is never dropped silently.
   */
  headerActions?: (guard: FeedbackDraftGuard) => ReactNode;
  /**
   * Which statuses the list shows. `null` leaves the choice to the queue: the
   * New rows when there are any, since clearing them is the job, then
   * Reviewing, else all.
   */
  statusFilter: FeedbackQueueFilter | null;
  onStatusFilterChange: (filter: FeedbackQueueFilter) => void;
}) {
  const { labels } = adapter;
  // The rail count this queue feeds: glossary feedback has its own badge.
  const railBadge = adapter.source === "glossary" ? "glossary-feedback" : "feedback";
  const reviewSectionId = `${adapter.source}-feedback-review-section`;
  const [feedback, setFeedback] = useState<Item[]>([]);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [heldRow, setHeldRow] = useState<Item | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [moreState, setMoreState] = useState<MoreState>({ status: "idle" });
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [note, setNote] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [autoFilter, setAutoFilter] = useState<FeedbackQueueFilter>("new");
  const [sortChoice, setSortChoice] = useState<QueueSort | null>(null);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  /**
   * Which list request is allowed to write state. Every load takes the next
   * number, so a response arriving after a newer load (or after unmount) is
   * dropped instead of overwriting the newer list.
   */
  const loadVersion = useRef(0);
  /** How many rows are loaded, so a background refresh re-reads as many. */
  const loadedCount = useRef(0);

  const activeFilter: FeedbackQueueFilter = statusFilter ?? autoFilter;
  const sort = sortChoice ?? defaultSort(activeFilter);
  const automatic = statusFilter === null;

  const { guard, dialog: draftDialog } = useDirtyGuard(note.trim().length > 0, {
    title: "Discard the review note?",
    description: "The note you typed is only saved with a decision. Leaving this item now drops it.",
  });
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    loadedCount.current = feedback.length;
  }, [feedback]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  /**
   * Load the first page for the current status, search and order, or refresh
   * the rows already loaded. A load never moves the selection: the row the
   * admin is on stays selected while it is listed. A `background` refresh
   * keeps the rows on screen, re-reads as many rows as are loaded, and shows
   * no loading label.
   */
  const loadQueue = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      const version = ++loadVersion.current;
      if (!background) {
        setLoadState({ status: "loading" });
        setFeedback([]);
        setNextCursor(null);
        setMoreState({ status: "idle" });
      }
      const query = { status: activeFilter, search, sort };
      const wanted = background ? loadedCount.current : 0;
      try {
        let page = await adapter.fetchPage({ ...query, cursor: null });
        const rows = [...page.rows];
        while (page.nextCursor && rows.length < wanted) {
          page = await adapter.fetchPage({ ...query, cursor: page.nextCursor });
          rows.push(...page.rows);
        }
        if (version !== loadVersion.current) {
          return;
        }
        const fallback = automatic && !background ? automaticFallback(activeFilter, page.counts) : activeFilter;
        if (fallback !== activeFilter) {
          // The effect loads the fallback status; this list is never shown.
          setAutoFilter(fallback);
          return;
        }
        setFeedback(rows);
        setCounts(page.counts);
        setNextCursor(page.nextCursor);
        setLoadState({ status: "ready" });
      } catch (error) {
        if (version !== loadVersion.current) {
          return;
        }
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load feedback.",
        });
      }
    },
    [adapter, activeFilter, automatic, search, sort],
  );

  useEffect(() => {
    void loadQueue();
    return () => {
      loadVersion.current += 1;
    };
  }, [loadQueue]);

  /** The next page, appended; the selection and any typed note stay where they are. */
  async function loadMore() {
    if (!nextCursor || moreState.status === "loading") {
      return;
    }
    const version = ++loadVersion.current;
    setMoreState({ status: "loading" });
    try {
      const page = await adapter.fetchPage({ status: activeFilter, search, sort, cursor: nextCursor });
      if (version !== loadVersion.current) {
        return;
      }
      setFeedback((rows) => {
        const loaded = new Set(rows.map((row) => row.id));
        return [...rows, ...page.rows.filter((row) => !loaded.has(row.id))];
      });
      setCounts(page.counts);
      setNextCursor(page.nextCursor);
      setMoreState({ status: "idle" });
    } catch (error) {
      if (version !== loadVersion.current) {
        return;
      }
      setMoreState({
        status: "error",
        message: error instanceof Error ? error.message : "Unable to load more feedback.",
      });
    }
  }

  // Rows come in the server's order; a decided row leaves a status filter at once.
  const visible = useMemo(
    () => (activeFilter === "all" ? feedback : feedback.filter((row) => row.status === activeFilter)),
    [feedback, activeFilter],
  );
  const total = counts ? totalFor(counts, activeFilter) : null;

  // A row that left the current filter (after a decision, or a filter change)
  // hands the review over to the first row still showing. While a note is
  // typed, a row the search or a reload no longer lists stays under review,
  // so the note never moves to another row.
  const selected = useMemo(() => {
    const listed = visible.find((row) => row.id === selectedId);
    if (listed) {
      return listed;
    }
    if (heldRow && heldRow.id === selectedId && note.trim().length > 0) {
      return heldRow;
    }
    return visible[0] ?? null;
  }, [heldRow, note, selectedId, visible]);

  useEffect(() => {
    if (selected) {
      setHeldRow(selected);
    }
  }, [selected]);

  /**
   * The row on screen, for work that finishes later: a decision that lands
   * after the admin moved on must not touch the note typed on the new row.
   */
  const currentRowId = useRef<string | null>(null);
  useEffect(() => {
    currentRowId.current = selected?.id ?? null;
  }, [selected]);

  function changeNote(value: string) {
    // Typing pins the row, so a refresh that reorders the list cannot move the note to another one.
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
    setNote(value);
  }

  function selectRow(id: string) {
    if (id === selected?.id) {
      return;
    }
    guard(() => {
      setSelectedId(id);
      setActionFeedback(null);
      setNote("");
      scrollReviewIntoViewOnSmallScreens(reviewSectionId);
    });
  }

  function changeFilter(next: FeedbackQueueFilter) {
    if (!selected || next === "all" || selected.status === next) {
      onStatusFilterChange(next);
      return;
    }
    guard(() => {
      onStatusFilterChange(next);
      setActionFeedback(null);
      setNote("");
    });
  }

  async function updateStatus(status: FeedbackQueueStatus) {
    if (!selected || pendingId) {
      return;
    }

    const decidedId = selected.id;
    const previousStatus = selected.status;
    setPendingId(decidedId);
    setActionFeedback(null);
    const trimmedNote = note.trim();
    try {
      const updated = await adapter.transition(decidedId, {
        status,
        note: trimmedNote.length > 0 ? trimmedNote : undefined,
      });
      setFeedback((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setCounts((current) =>
        current && updated.status !== previousStatus
          ? { ...current, [previousStatus]: current[previousStatus] - 1, [updated.status]: current[updated.status] + 1 }
          : current,
      );
      setPendingId(null);
      // The admin may have moved to another row while this was in flight;
      // that row, its note and its notices are theirs to keep.
      if (currentRowId.current === decidedId) {
        setActionFeedback({
          tone: "success",
          message: labels.transitioned(updated, STATUS_LABELS[status].toLowerCase()),
        });
        setNote("");
        if (activeFilter !== "all" && updated.status !== activeFilter) {
          // The decided row leaves this filter: hand the review to its neighbour, pinned.
          const index = visible.findIndex((row) => row.id === decidedId);
          const next = visible[index + 1] ?? visible[index - 1] ?? null;
          setSelectedId(next?.id ?? null);
        }
      }
      // Any transition can move the row in or out of the pending bucket the rail counts.
      invalidateDevRailBadge(railBadge);
      // Reconcile counts and concurrent reviewer changes in the background,
      // keeping the list and the selection where they are.
      void loadQueue({ background: true });
    } catch (error) {
      setActionFeedback({
        tone: "danger",
        message: error instanceof Error ? error.message : "Unable to update feedback.",
      });
      setPendingId(null);
    }
  }

  function decide(status: FeedbackQueueStatus) {
    if (!selected) {
      return;
    }
    if (status !== "rejected" && status !== "spam") {
      void updateStatus(status);
      return;
    }
    const decision = CONFIRMED_DECISIONS[status];
    confirm({
      title: decision.title,
      description: (
        <>
          {decision.verb} the feedback for &ldquo;{labels.itemTitle(selected)}&rdquo; writes to production right away
          and takes it off the queue. It stays in the {STATUS_LABELS[status]} list, where it can go back to Reviewing.
          {note.trim().length > 0 ? " Your review note is saved with it." : null}
        </>
      ),
      confirmLabel: decision.confirmLabel,
      destructive: decision.destructive,
      onConfirm: () => updateStatus(status),
    });
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <EditorSection
        icon={labels.icon}
        title={labels.title}
        description={labels.description}
        actions={headerActions?.(guard)}
      >
        {loadState.status === "error" ? (
          <LoadErrorState message={loadState.message} onRetry={() => void loadQueue({ background: feedback.length > 0 })} />
        ) : null}
        <DevRailBadgeFreshness badge={railBadge} noun="feedback items" />
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <EditorSection
          icon="lucide:list"
          title="Queue"
          description={counts && loadState.status !== "loading" ? describeCounts(counts) : "Loading"}
          delay={0.05}
          actions={(
            <>
              <label htmlFor={`${adapter.source}-feedback-sort`} className="sr-only">
                Sort
              </label>
              <Select value={sort} onValueChange={(value) => setSortChoice(value as QueueSort)}>
                <SelectTrigger id={`${adapter.source}-feedback-sort`} selectSize="compact" className="w-36">
                  <SelectValue>{SORT_LABELS[sort]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as QueueSort[])
                    .filter((option) => option !== "importance" || adapter.importance)
                    .map((option) => (
                      <SelectItem key={option} value={option}>
                        {SORT_LABELS[option]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <label htmlFor={`${adapter.source}-feedback-filter`} className="sr-only">
                Queue filter
              </label>
              <Select value={activeFilter} onValueChange={(value) => changeFilter(value as FeedbackQueueFilter)}>
                <SelectTrigger id={`${adapter.source}-feedback-filter`} selectSize="compact" className="w-36">
                  <SelectValue>
                    {STATUS_LABELS[activeFilter]}
                    {total === null ? null : ` (${total})`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {QUEUE_FILTERS.map((filter) => (
                    <SelectItem key={filter} value={filter}>
                      <span className="flex w-full items-center justify-between gap-3">
                        {STATUS_LABELS[filter]}{" "}
                        <span className="theme-text-faint tabular-nums">{counts ? totalFor(counts, filter) : ""}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        >
          {loadState.status === "loading" ? (
            <EditorStatusPill tone="info" loading live>
              Loading feedback...
            </EditorStatusPill>
          ) : null}
          <Input
            type="search"
            inputSize="sm"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search feedback"
            aria-label="Search feedback"
            className="mb-2"
          />
          {loadState.status === "ready" || feedback.length > 0 ? (
            <EditorList
              label="Feedback queue"
              items={visible}
              getKey={(row) => row.id}
              selectedKey={selected?.id ?? null}
              onSelect={selectRow}
              emptyText={
                search
                  ? `No ${activeFilter === "all" ? "" : `${STATUS_LABELS[activeFilter].toLowerCase()} `}feedback matches "${search}".`
                  : activeFilter === "all"
                    ? labels.emptyQueue
                    : `No ${STATUS_LABELS[activeFilter].toLowerCase()} feedback right now.`
              }
              renderItem={(row, { selected: active }) => (
                <QueueRow
                  title={labels.itemTitle(row)}
                  subtitle={labels.itemSubtitle(row)}
                  importance={adapter.importance?.(row) ?? null}
                  row={row}
                  active={active}
                />
              )}
            />
          ) : null}
          {loadState.status === "ready" && total !== null && total > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="theme-text-faint text-xs tabular-nums">
                {visible.length} of {total} loaded
              </p>
              {nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={moreState.status === "loading"}
                  onClick={() => void loadMore()}
                >
                  {moreState.status === "loading" ? "Loading more..." : "Load more"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {moreState.status === "error" ? (
            <ActionNotice tone="danger" onDismiss={() => setMoreState({ status: "idle" })}>
              {moreState.message}
            </ActionNotice>
          ) : null}
        </EditorSection>

        <EditorSection
          id={reviewSectionId}
          icon="lucide:file-search"
          title="Review"
          description={
            selected
              ? `${labels.itemTitle(selected)} · received ${formatFeedbackDate(selected.created_at) ?? "unknown date"}`
              : "No feedback selected"
          }
          delay={0.1}
        >
          {selected ? (
            <FeedbackDetail
              row={selected}
              header={adapter.renderDetail(selected)}
              keepsDecisionLog={adapter.keepsDecisionLog === true}
              validTargets={adapter.transitions[selected.status] ?? []}
              pending={pendingId === selected.id}
              note={note}
              noteId={`${adapter.source}-feedback-review-note`}
              onNoteChange={changeNote}
              actionFeedback={actionFeedback}
              onDismissFeedback={() => setActionFeedback(null)}
              onStatusChange={decide}
            />
          ) : (
            <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted text-sm">
              Select a feedback entry to review.
            </EmptyStateSurface>
          )}
        </EditorSection>
      </div>
      {draftDialog}
      {confirmDialog}
    </div>
  );
}

/** Below xl the queue sits above the review, so picking a row brings the review up. */
function scrollReviewIntoViewOnSmallScreens(sectionId: string) {
  if (typeof window === "undefined" || window.innerWidth >= 1280) {
    return;
  }
  document.getElementById(sectionId)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

export function formatFeedbackDate(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Two lines at a fixed pitch, so the windowed list can place rows: title and
 * subtitle share the first line with the status pill, details take the second.
 */
function QueueRow({
  active,
  importance,
  row,
  subtitle,
  title,
}: {
  active: boolean;
  importance: FeedbackImportance | null;
  row: FeedbackQueueItem;
  subtitle: string | null;
  title: string;
}) {
  return (
    <EditorListItem active={active} tabIndex={-1} className="items-start">
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm">
            <span className={`font-semibold ${active ? "theme-accent-heading" : "theme-text-primary"}`}>{title}</span>
            {subtitle ? <span className="theme-text-faint text-xs"> · {subtitle}</span> : null}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {importance ? <FeedbackImportancePill importance={importance} /> : null}
            <FeedbackStatusPill status={row.status} />
          </span>
        </span>
        <span className="theme-text-muted block truncate text-xs">{row.details}</span>
      </span>
    </EditorListItem>
  );
}

function FeedbackDetail({
  actionFeedback,
  header,
  keepsDecisionLog,
  note,
  noteId,
  onDismissFeedback,
  onNoteChange,
  onStatusChange,
  pending,
  row,
  validTargets,
}: {
  actionFeedback: ActionFeedback | null;
  header: ReactNode;
  keepsDecisionLog: boolean;
  note: string;
  noteId: string;
  onDismissFeedback: () => void;
  onNoteChange: (note: string) => void;
  onStatusChange: (status: FeedbackQueueStatus) => void;
  pending: boolean;
  row: FeedbackQueueItem;
  validTargets: FeedbackQueueStatus[];
}) {
  const canMoveTo = (status: FeedbackQueueStatus) => !pending && validTargets.includes(status);

  return (
    <div className="space-y-6">
      {header}

      <section>
        <h4 className="theme-accent-heading text-sm font-semibold">Details</h4>
        <p className="theme-text-secondary mt-2 whitespace-pre-line text-sm leading-6">{row.details}</p>
      </section>

      {keepsDecisionLog ? (
        <DecisionLogSection entries={decisionLogOf(row)} statusLabel={(status) => STATUS_LABELS[status]} />
      ) : row.review_notes || row.reviewed_by ? (
        <section>
          <h4 className="theme-accent-heading text-sm font-semibold">Review notes</h4>
          {row.reviewed_by || row.reviewed_at ? (
            <p className="theme-text-faint mt-1 text-xs">
              {[formatReviewerIdentity(row.reviewed_by), formatFeedbackDate(row.reviewed_at)].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {row.review_notes ? (
            <p className="theme-text-secondary mt-2 whitespace-pre-line text-sm leading-6">
              {row.review_notes}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="space-y-3">
        <EditorField
          htmlFor={noteId}
          label="Review note"
          description={
            keepsDecisionLog
              ? "Optional. Added to the decision log with the decision you make next."
              : "Optional. Saved with the decision and replaces the previous note."
          }
        >
          <Textarea
            id={noteId}
            textareaSize="sm"
            value={note}
            disabled={pending}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="What was checked, changed, or why this was declined."
          />
        </EditorField>
        <EditorPanel variant="toolbar" className="p-3">
          <EditorToolbar label="Feedback review actions" variant="split">
            <EditorActionGroup label="Review decision">
              <Button
                type="button"
                variant="outline"
                disabled={!canMoveTo("reviewing")}
                onClick={() => onStatusChange("reviewing")}
              >
                Reviewing
              </Button>
              <Button
                type="button"
                variant="success"
                disabled={!canMoveTo("resolved")}
                onClick={() => onStatusChange("resolved")}
              >
                Resolve
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!canMoveTo("rejected")}
                onClick={() => onStatusChange("rejected")}
              >
                Reject
              </Button>
            </EditorActionGroup>
            <EditorActionGroup label="Classification" align="end">
              <Button
                type="button"
                variant="outline"
                disabled={!canMoveTo("spam")}
                onClick={() => onStatusChange("spam")}
              >
                Spam
              </Button>
            </EditorActionGroup>
          </EditorToolbar>
        </EditorPanel>
        {actionFeedback ? (
          <ActionNotice tone={actionFeedback.tone} onDismiss={onDismissFeedback}>
            {actionFeedback.message}
          </ActionNotice>
        ) : null}
      </div>
    </div>
  );
}

export function FeedbackStatusPill({ status }: { status: FeedbackQueueStatus }) {
  return (
    <EditorStatusPill tone={STATUS_PILL_TONE[status] ?? "neutral"}>
      {STATUS_LABELS[status] ?? status}
    </EditorStatusPill>
  );
}

export function FeedbackImportancePill({ importance }: { importance: FeedbackImportance }) {
  return <EditorStatusPill tone={IMPORTANCE_PILL_TONE[importance]}>{IMPORTANCE_LABELS[importance]}</EditorStatusPill>;
}

export function FeedbackMetadataItem({ href, label, value }: { href?: string; label: string; value?: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="theme-accent-heading mt-1 block break-all text-sm hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className="theme-text-primary mt-1 text-sm">{value}</p>
      )}
    </div>
  );
}

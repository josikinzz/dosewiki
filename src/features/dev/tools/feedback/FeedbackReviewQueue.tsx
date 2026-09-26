"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import {
  EditorPanel,
  EditorSection,
  EditorStatusPill,
  LoadErrorState,
  Notice,
  useConfirm,
  useDevShortcuts,
  useDirtyGuard,
  useScrollToDetail,
  useTriageShortcuts,
  useWriteFreeze,
} from "@/features/dev/components";
import { DecisionLogSection } from "@/features/dev/tools/DecisionLogSection";
import { MISSING_TASK_TITLE } from "@/features/dev/tools/missingTask";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { DevRailBadgeFreshness } from "@/features/dev/pages/DevRailBadgeFreshness";
import { decisionLogOf, type DecisionLogEntry } from "@/features/intake/decisionLog";
import { FEEDBACK_OUTCOME_LABEL, type FeedbackOutcome } from "@/features/intake/feedbackCorrection";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import { cn } from "@/lib/utils";

import { FeedbackQueueColumn } from "./FeedbackQueueColumn";
import { FeedbackReviewPane, type FeedbackNotice, type FeedbackPendingAction } from "./FeedbackReviewPane";
import {
  QUEUE_STATUSES,
  defaultSort,
  looksLikeContactDetails,
  matchesFilter,
  totalFor,
  type FeedbackPage,
  type FeedbackPageQuery,
  type QueueSort,
  type StatusCounts,
} from "./feedbackQueueModel";
import {
  FEEDBACK_STATUS_LABELS,
  FREEZE_DECISION_COPY,
  IMPORTANCE_PILL_TONE,
  IMPORTANCE_WORD,
  STATUS_PILL_TONE,
  describeEmptyQueue,
  holdOf,
  isFreezeRefusal,
} from "./feedbackReviewModel";

export type FeedbackQueueStatus = "new" | "reviewing" | "resolved" | "rejected" | "spam";

/** A status, `all`, or `unresolved` (New and Reviewing together). */
export type FeedbackQueueFilter = FeedbackQueueStatus | "all" | "unresolved";

export type FeedbackTransitionInput = { status: FeedbackQueueStatus; note?: string; outcome?: FeedbackOutcome };

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
  /**
   * One item by id, for a task link whose item the current list does not
   * show. Null when it no longer exists or the session cannot open it.
   */
  fetchItem?: (id: string) => Promise<Item | null>;
  transition: (id: string, input: FeedbackTransitionInput) => Promise<Item>;
  transitions: Record<FeedbackQueueStatus, FeedbackQueueStatus[]>;
  /** The row's importance, for sources whose form asks for one. */
  importance?: (item: Item) => FeedbackImportance | null | undefined;
  /**
   * The item's facts (where it came from, received, contact, spam trap) as
   * `FeedbackFacts`. The review pane draws the title, pills and what the
   * reader wrote itself, so this draws neither.
   */
  renderDetail: (item: Item) => ReactNode;
  /**
   * True when the source stores a decision log, so the review shows every
   * decision. A source without one shows only its latest note.
   */
  keepsDecisionLog?: boolean;
  /**
   * True when the source records an explicit outcome (Duplicate, Explanation
   * provided, No change needed) with the decision that closes an item.
   */
  recordsOutcomes?: boolean;
  /**
   * The source's correction tracking under the details (article feedback:
   * Start correction, Link existing change, and where each linked change
   * stands). `onRowChange` puts the row a link left back in the queue.
   */
  renderCorrection?: (item: Item, onRowChange: (updated: Item) => void) => ReactNode;
  labels: {
    icon: string;
    title: string;
    description: string;
    emptyQueue: string;
    /** What one item is called in sentences ("article feedback"). */
    noun?: string;
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

/**
 * The search a queue request may carry: the typed text, or nothing when it
 * looks like a reader's contact details, which never enter a request URL.
 */
function searchableText(text: string): string {
  return looksLikeContactDetails(text) ? "" : text.trim();
}

/** Pause after the last keystroke before the search goes to the server. */
const SEARCH_DEBOUNCE_MS = 250;

const QUEUE_FILTERS: FeedbackQueueFilter[] = ["all", "unresolved", ...QUEUE_STATUSES];

const STATUS_LABELS = FEEDBACK_STATUS_LABELS;

/** Decisions the bulk bar can make on ticked rows. */
type BulkDecision = Extract<FeedbackQueueStatus, "rejected" | "spam">;

/** The last single decision, so `u` and the Undo button can take it back. */
type LastDecision = { id: string; title: string; from: FeedbackQueueStatus; to: FeedbackQueueStatus };

/**
 * Where undo takes a decided row: back where it was when the transitions
 * allow it, else to Reviewing, which every decided status can reopen to.
 */
export function undoTarget(
  transitions: Record<FeedbackQueueStatus, FeedbackQueueStatus[]>,
  decision: Pick<LastDecision, "from" | "to">,
): FeedbackQueueStatus | null {
  const allowed = transitions[decision.to] ?? [];
  if (allowed.includes(decision.from)) return decision.from;
  return allowed.includes("reviewing") ? "reviewing" : null;
}

/** Decisions that take the row off the queue and are asked about before they write. */
const CONFIRMED_DECISIONS: Record<
  Extract<FeedbackQueueStatus, "rejected" | "spam">,
  { title: string; lead: (title: string) => string; confirmLabel: string; destructive: boolean }
> = {
  rejected: { title: "Reject this feedback?", lead: (title) => `Rejecting the feedback on “${title}”`, confirmLabel: "Reject", destructive: true },
  spam: { title: "Mark as spam?", lead: (title) => `Marking the feedback on “${title}” as spam`, confirmLabel: "Mark as spam", destructive: true },
};

const SEARCH_SHORTCUTS = [{ keys: "/", label: "Search feedback" }] as const;

export function isFeedbackQueueFilter(value: unknown): value is FeedbackQueueFilter {
  return typeof value === "string" && (QUEUE_FILTERS as string[]).includes(value);
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

/** The queue context a task link restores: the chosen order, the search, and the item. */
export type FeedbackQueueContext = { sort: QueueSort | null; search: string; selectedId: string | null };

/**
 * Where a task link's item stands. `pending` while the queue looks for it,
 * `found` once it is on screen, `missing` when it no longer exists or the
 * session cannot open it, `error` when the lookup itself failed.
 */
type LinkState =
  | { id: string; state: "pending" | "found" | "missing" }
  | { id: string; state: "error"; message: string };

/**
 * A feedback queue as a triage workspace: the list and its filters on the
 * left (sticky from `lg`), the item under review docked on the right with
 * one header and a decision dock (see the Inbox, which embeds the same
 * adapters). Below `lg` the two stack: picking a row scrolls the pane in, the
 * pane carries Back to list and a pager, and the automatic first row stays
 * off screen until a pick.
 */
export function FeedbackReviewQueue<Item extends FeedbackQueueItem>({
  adapter,
  heading,
  headerActions,
  statusFilter,
  onStatusFilterChange,
  initialSelectedId = null,
  initialSort = null,
  initialSearch = "",
  onContextChange,
  taskLinkFor,
  actorEmail = null,
}: {
  adapter: FeedbackSourceAdapter<Item>;
  /** The tool heading, when it is not the source's own (the Feedback tab names the tool). */
  heading?: { icon: string; title: string; description?: ReactNode };
  /**
   * Controls under the tool heading, such as the tab's source filter.
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
  /** The item a task link names; the queue opens on it, or says it is gone. */
  initialSelectedId?: string | null;
  initialSort?: QueueSort | null;
  initialSearch?: string;
  /**
   * The order the admin chose, the search that went to the server, and the
   * item they picked or a link named (never the automatic first row), so
   * the tab can keep them in the address.
   */
  onContextChange?: (context: FeedbackQueueContext) => void;
  /** The task link for one item, for the pane's Copy link button. */
  taskLinkFor?: (id: string) => string;
  /** The signed-in admin, so the pane can say "You are reviewing this". */
  actorEmail?: string | null;
}) {
  const { labels } = adapter;
  const noun = labels.noun ?? "feedback";
  // The rail count this queue feeds: glossary feedback has its own badge.
  const railBadge = adapter.source === "glossary" ? "glossary-feedback" : "feedback";
  const [feedback, setFeedback] = useState<Item[]>([]);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [heldRow, setHeldRow] = useState<Item | null>(null);
  const [link, setLink] = useState<LinkState | null>(() =>
    initialSelectedId ? { id: initialSelectedId, state: "pending" } : null,
  );
  /** A linked item the current list does not show (another status, or beyond the loaded pages). */
  const [linkedRow, setLinkedRow] = useState<Item | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [moreState, setMoreState] = useState<MoreState>({ status: "idle" });
  const [notice, setNotice] = useState<FeedbackNotice | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<{ id: string; action: FeedbackPendingAction } | null>(null);
  const [autoFilter, setAutoFilter] = useState<FeedbackQueueFilter>("new");
  const [sortChoice, setSortChoice] = useState<QueueSort | null>(initialSort);
  const [searchText, setSearchText] = useState(initialSearch);
  const [search, setSearch] = useState(() => searchableText(initialSearch));
  const contactSearch = looksLikeContactDetails(searchText);
  const pendingId = pending?.id ?? null;
  const { frozen } = useWriteFreeze();
  /**
   * Which list request is allowed to write state. Every load takes the next
   * number, so a response arriving after a newer load (or after unmount) is
   * dropped instead of overwriting the newer list.
   */
  const loadVersion = useRef(0);
  /** How many rows are loaded, so a background refresh re-reads as many. */
  const loadedCount = useRef(0);

  const baseId = useId();
  const noteId = `${adapter.source}-feedback-review-note`;
  const searchId = `${adapter.source}-feedback-search`;
  const listHeadingId = `${baseId}-queue`;
  const paneHeadingId = `${baseId}-review`;
  const listRef = useRef<HTMLElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const activeFilter: FeedbackQueueFilter = statusFilter ?? autoFilter;
  // Waiting work opens most important first when the source asks readers for importance, so a
  // safety report never sits under older nits; history opens newest first.
  const sort = sortChoice ?? (adapter.importance && defaultSort(activeFilter) === "oldest" ? "importance" : defaultSort(activeFilter));
  const automatic = statusFilter === null;

  const { guard, dialog: draftDialog } = useDirtyGuard(note.trim().length > 0, {
    title: "Discard the review note?",
    description: "The note you typed is only saved with a decision. Leaving this item now drops it.",
  });
  const { confirm, dialog: confirmDialog } = useConfirm();
  /** Rows ticked for a bulk decision; separate from the one row under review. */
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [lastDecision, setLastDecision] = useState<LastDecision | null>(null);

  useEffect(() => {
    loadedCount.current = feedback.length;
  }, [feedback]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchableText(searchText)), SEARCH_DEBOUNCE_MS);
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
      } finally {
        if (version === loadVersion.current) setRefreshing(false);
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

  function refresh() {
    setRefreshing(true);
    void loadQueue({ background: feedback.length > 0 });
  }

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
    () => feedback.filter((row) => matchesFilter(row.status, activeFilter)),
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
    if (linkedRow && linkedRow.id === selectedId) {
      return linkedRow;
    }
    if (heldRow && heldRow.id === selectedId && note.trim().length > 0) {
      return heldRow;
    }
    // A task link never falls back to another row: while its item is looked
    // for, or once it is known to be gone, the review says so instead.
    if (link && link.id === selectedId && link.state !== "found") {
      return null;
    }
    return visible[0] ?? null;
  }, [heldRow, link, linkedRow, note, selectedId, visible]);
  const selectedIndex = selected ? visible.findIndex((row) => row.id === selected.id) : -1;
  /** A row the admin picked, or a link named, as opposed to the automatic first row. */
  const picked = selected !== null && selected.id === selectedId;

  // Picking a row below `lg` brings the pane into view; the automatic first row never scrolls.
  useScrollToDetail(paneRef, picked ? selected.id : link && link.id === selectedId && !selected ? `link:${link.id}:${link.state}` : null);

  // Find a task link's item once the first list is in: on the list, or read
  // on its own when this filter, search or page does not show it.
  const lookupStarted = useRef(false);
  const fetchItem = adapter.fetchItem;
  const lookUpLinked = useCallback(
    async (id: string) => {
      if (!fetchItem) {
        setLink({ id, state: "missing" });
        return;
      }
      setLink({ id, state: "pending" });
      try {
        const row = await fetchItem(id);
        if (row) {
          setLinkedRow(row);
          setLink({ id, state: "found" });
        } else {
          setLink({ id, state: "missing" });
        }
      } catch (error) {
        setLink({ id, state: "error", message: error instanceof Error ? error.message : "Unable to open that feedback." });
      }
    },
    [fetchItem],
  );
  useEffect(() => {
    if (!link || link.state !== "pending" || lookupStarted.current || loadState.status !== "ready") {
      return;
    }
    lookupStarted.current = true;
    if (feedback.some((row) => row.id === link.id && matchesFilter(row.status, activeFilter))) {
      setLink({ id: link.id, state: "found" });
      return;
    }
    void lookUpLinked(link.id);
  }, [activeFilter, feedback, link, loadState.status, lookUpLinked]);

  // Report the context a task link restores. The automatic first row is not
  // a choice, so only a picked or linked item goes out.
  const onContextChangeRef = useRef(onContextChange);
  useEffect(() => {
    onContextChangeRef.current = onContextChange;
  }, [onContextChange]);
  // The address already holds what the queue opened on; only changes go out.
  const reportedContext = useRef(`${initialSort}|${initialSearch.trim()}|${initialSelectedId}`);
  useEffect(() => {
    const key = `${sortChoice}|${search}|${selectedId}`;
    if (key === reportedContext.current) return;
    reportedContext.current = key;
    onContextChangeRef.current?.({ sort: sortChoice, search, selectedId });
  }, [sortChoice, search, selectedId]);

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
      // Picking the automatic row still counts as a pick: on a phone it brings the pane in.
      if (selectedId !== id) setSelectedId(id);
      return;
    }
    guard(() => {
      setSelectedId(id);
      setLink(null);
      setNotice(null);
      setNote("");
    });
  }

  function changeFilter(next: FeedbackQueueFilter) {
    // Ticks belong to the list they were made on.
    const apply = () => {
      onStatusFilterChange(next);
      setChecked(new Set());
    };
    if (!selected || matchesFilter(selected.status, next)) {
      apply();
      return;
    }
    guard(() => {
      apply();
      setNotice(null);
      setNote("");
    });
  }

  function changeSearch(text: string) {
    setSearchText(text);
  }

  /** Put a written row in the list and move its count from the old status to the new one. */
  function applyTransition(updated: Item, previousStatus: FeedbackQueueStatus) {
    setFeedback((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
    setLinkedRow((row) => (row && row.id === updated.id ? updated : row));
    setHeldRow((row) => (row && row.id === updated.id ? updated : row));
    setCounts((current) =>
      current && updated.status !== previousStatus
        ? { ...current, [previousStatus]: current[previousStatus] - 1, [updated.status]: current[updated.status] + 1 }
        : current,
    );
  }

  function failureNotice(error: unknown, fallback: string): FeedbackNotice {
    const message = error instanceof Error ? error.message : fallback;
    return { tone: "danger", message: isFreezeRefusal(message) ? FREEZE_DECISION_COPY : message };
  }

  /**
   * Write one status change on the row under review. Claims and releases
   * change the hold line in place and are announced; decisions leave a notice
   * with Undo in the dock.
   */
  async function updateStatus(
    status: FeedbackQueueStatus,
    outcome?: FeedbackOutcome,
    kind: "decision" | "claim" | "release" | "reopen" = "decision",
  ) {
    if (!selected || pendingId || bulkPending) {
      return;
    }

    const decidedId = selected.id;
    const previousStatus = selected.status;
    const title = labels.itemTitle(selected);
    setPending({ id: decidedId, action: kind === "decision" ? outcome ?? (status as FeedbackPendingAction) : kind });
    setNotice(null);
    const trimmedNote = note.trim();
    try {
      const updated = await adapter.transition(decidedId, {
        status,
        note: trimmedNote.length > 0 ? trimmedNote : undefined,
        ...(outcome ? { outcome } : {}),
      });
      applyTransition(updated, previousStatus);
      const quiet = kind === "claim" || kind === "release";
      setLastDecision(
        updated.status !== previousStatus && !quiet
          ? { id: updated.id, title, from: previousStatus, to: updated.status }
          : null,
      );
      setPending(null);
      // The admin may have moved to another row while this was in flight;
      // that row, its note and its notices are theirs to keep.
      if (currentRowId.current === decidedId) {
        if (quiet) {
          setAnnouncement(kind === "claim" ? `You are reviewing "${title}".` : `Released "${title}" for anyone to pick up.`);
        } else {
          setNotice({
            tone: "success",
            undo: true,
            message: labels.transitioned(
              updated,
              outcome
                ? `${STATUS_LABELS[status].toLowerCase()} as ${FEEDBACK_OUTCOME_LABEL[outcome]}`
                : STATUS_LABELS[status].toLowerCase(),
            ),
          });
        }
        if (trimmedNote.length > 0) setNote("");
        if (!matchesFilter(updated.status, activeFilter)) {
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
      setNotice(failureNotice(error, "Unable to update feedback."));
      setPending(null);
    }
  }

  function decide(status: FeedbackQueueStatus, outcome?: FeedbackOutcome) {
    if (!selected) {
      return;
    }
    if (status !== "rejected" && status !== "spam") {
      void updateStatus(status, outcome);
      return;
    }
    const decision = CONFIRMED_DECISIONS[status];
    const typed = note.trim().length > 0;
    confirm({
      title: outcome ? `Close as ${FEEDBACK_OUTCOME_LABEL[outcome]}?` : decision.title,
      description: `${
        outcome
          ? `Closing the feedback on “${labels.itemTitle(selected)}” as ${FEEDBACK_OUTCOME_LABEL[outcome]} rejects it at once`
          : `${decision.lead(labels.itemTitle(selected))} writes at once`
      } and takes it off the queue. It stays under ${STATUS_LABELS[status]}, where it can be reopened. ${typed ? "Your review note is saved with it." : "No review note is attached."}`,
      confirmLabel: outcome ? FEEDBACK_OUTCOME_LABEL[outcome] : decision.confirmLabel,
      destructive: decision.destructive,
      onConfirm: () => updateStatus(status, outcome),
    });
  }

  /** Put a row a correction link left back in the list; its status did not move. */
  function replaceRow(updated: Item) {
    setFeedback((rows) => rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
    setLinkedRow((row) => (row && row.id === updated.id ? { ...row, ...updated } : row));
  }

  const undoTo = lastDecision ? undoTarget(adapter.transitions, lastDecision) : null;

  /** Take the last single decision back; the decision log records both moves. */
  async function undoLastDecision() {
    if (!lastDecision || !undoTo || pendingId || bulkPending) {
      return;
    }
    const decision = lastDecision;
    setPending({ id: decision.id, action: "undo" });
    setNotice(null);
    try {
      const updated = await adapter.transition(decision.id, { status: undoTo });
      applyTransition(updated, decision.to);
      setLastDecision(null);
      setPending(null);
      setNotice({
        tone: "success",
        message: `Undone. ${labels.transitioned(updated, STATUS_LABELS[updated.status].toLowerCase())}`,
      });
      // Bring the row back under review when it is listed and no note would be dropped.
      if (note.trim().length === 0 && matchesFilter(updated.status, activeFilter)) {
        setSelectedId(updated.id);
      }
      invalidateDevRailBadge(railBadge);
      void loadQueue({ background: true });
    } catch (error) {
      setNotice(failureNotice(error, "Unable to undo that decision."));
      setPending(null);
    }
  }

  /** The task link on screen: one the review is still looking for, or cannot show. */
  const openLink = link && link.id === selectedId && !selected ? link : null;

  /** Drop a link that cannot open; the review goes to the queue's first row. */
  function leaveLink() {
    setLink(null);
    setSelectedId(null);
  }

  async function copyTaskLink(id: string) {
    if (!taskLinkFor) return;
    const href = new URL(taskLinkFor(id), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(href);
      setNotice({ tone: "success", message: "Link copied. It opens this item with the current filter, order and search." });
    } catch {
      setNotice({ tone: "danger", message: `Copy did not work in this browser. The link is ${href}` });
    }
  }

  const canBulk = (row: Item, status: BulkDecision) => (adapter.transitions[row.status] ?? []).includes(status);
  const checkedRows = visible.filter((row) => checked.has(row.id));

  function toggleChecked(id: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(status: BulkDecision, targets: Item[]) {
    setBulkPending(true);
    setNotice(null);
    const failures: string[] = [];
    const done = new Set<string>();
    // One at a time: each write is its own decision in the item's log.
    for (const row of targets) {
      try {
        const updated = await adapter.transition(row.id, { status });
        applyTransition(updated, row.status);
        done.add(row.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed";
        failures.push(`${labels.itemTitle(row)}: ${isFreezeRefusal(message) ? "writes are paused" : message}`);
      }
    }
    setChecked((current) => new Set([...current].filter((id) => !done.has(id))));
    setLastDecision(null);
    setBulkPending(false);
    const verb = status === "spam" ? "Marked" : "Rejected";
    const tail = status === "spam" ? " as spam" : "";
    setNotice(
      failures.length === 0
        ? { tone: "success", message: `${verb} ${done.size} feedback ${done.size === 1 ? "item" : "items"}${tail}.` }
        : {
            tone: "danger",
            message: `${verb} ${done.size} of ${targets.length}${tail}. Not changed: ${failures.join("; ")}`,
          },
    );
    invalidateDevRailBadge(railBadge);
    void loadQueue({ background: true });
  }

  function bulkDecide(status: BulkDecision) {
    const targets = checkedRows.filter((row) => canBulk(row, status));
    if (targets.length === 0 || bulkPending || pendingId) {
      return;
    }
    const count = `${targets.length} feedback ${targets.length === 1 ? "item" : "items"}`;
    const skipped = checkedRows.length - targets.length;
    confirm({
      title: status === "spam" ? `Mark ${count} as spam?` : `Reject ${count}?`,
      description: `This writes at once and takes ${targets.length === 1 ? "it" : "them"} off the queue. Each stays under ${STATUS_LABELS[status]}, where it can be reopened.${skipped > 0 ? ` ${skipped} ticked ${skipped === 1 ? "item is" : "items are"} already there and stay as they are.` : ""}`,
      confirmLabel: status === "spam" ? "Mark as spam" : "Reject",
      destructive: true,
      affected: targets.map((row) => labels.itemTitle(row)),
      affectedLabel: `${targets.length} ${targets.length === 1 ? "item" : "items"}`,
      onConfirm: () => runBulk(status, targets),
    });
  }

  const canDecide = (status: FeedbackQueueStatus) =>
    selected !== null && !pendingId && !bulkPending && (adapter.transitions[selected.status] ?? []).includes(status);

  function move(direction: 1 | -1) {
    if (visible.length === 0) return;
    const index = visible.findIndex((row) => row.id === selected?.id);
    const next = index < 0 ? (direction === 1 ? visible[0] : visible[visible.length - 1]) : visible[index + direction];
    if (next) selectRow(next.id);
  }

  const { helpDialog } = useTriageShortcuts({
    onMove: move,
    onAccept: () => {
      if (canDecide("resolved")) decide("resolved");
    },
    onReject: () => {
      if (canDecide("rejected")) decide("rejected");
    },
    onSpam: () => {
      if (canDecide("spam")) decide("spam");
    },
    onNote: () => noteRef.current?.focus(),
    onUndo: () => void undoLastDecision(),
    labels: { accept: "Resolve" },
  });

  // `/` focuses the search, as in every other list tool.
  useDevShortcuts(SEARCH_SHORTCUTS);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const backToList = () => {
    listRef.current?.scrollIntoView({ block: "start" });
    listRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
  };

  const ready = loadState.status === "ready" || (loadState.status === "error" && feedback.length > 0);
  const empty = ready && visible.length === 0 ? describeEmptyQueue(activeFilter, counts, search, noun) : null;
  const busy = pendingId !== null || bulkPending;
  const title = heading?.title ?? labels.title;
  const icon = heading?.icon ?? labels.icon;
  const hiddenByList =
    selected && selectedIndex < 0 ? (
      <p className="flex flex-wrap items-center gap-x-2">
        <Icon icon="lucide:eye-off" size={13} className="theme-text-faint shrink-0" />
        <span>
          {matchesFilter(selected.status, activeFilter)
            ? "The list does not show this item right now."
            : `The list shows ${STATUS_LABELS[activeFilter].toLowerCase()} feedback, so this ${STATUS_LABELS[selected.status].toLowerCase()} item is not in it.`}
        </span>
      </p>
    ) : null;

  const bulkBar =
    checkedRows.length > 0 ? (
      <div
        role="toolbar"
        aria-label="Bulk feedback actions"
        className="flex flex-wrap items-center gap-2 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2"
      >
        <p className="theme-text-secondary mr-auto text-sm tabular-nums" aria-live="polite">
          {checkedRows.length} selected
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={bulkPending || !checkedRows.some((row) => canBulk(row, "spam"))}
          onClick={() => bulkDecide("spam")}
        >
          Mark as spam
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={bulkPending || !checkedRows.some((row) => canBulk(row, "rejected"))}
          onClick={() => bulkDecide("rejected")}
        >
          Reject
        </Button>
        <Button type="button" variant="quiet" size="quiet" disabled={bulkPending} onClick={() => setChecked(new Set())}>
          Clear
        </Button>
      </div>
    ) : null;

  // Below `lg` the pane waits for a pick: the automatic first row is a desktop convenience.
  const paneHidden = !picked && !openLink && !notice;

  return (
    <div className="flex w-full flex-col gap-6">
      <EditorSection icon={icon} title={title} description={heading ? heading.description : labels.description}>
        {headerActions ? <div className="space-y-2">{headerActions(guard)}</div> : null}
        <DevRailBadgeFreshness badge={railBadge} noun="feedback items" />
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
        <FeedbackQueueColumn
          listRef={listRef}
          headingId={listHeadingId}
          noun={noun}
          filter={activeFilter}
          counts={loadState.status === "loading" ? null : counts}
          onFilterChange={changeFilter}
          sort={sort}
          sortOptions={(["oldest", "newest", "importance"] as QueueSort[]).filter(
            (option) => option !== "importance" || Boolean(adapter.importance),
          )}
          onSortChange={setSortChoice}
          searchId={searchId}
          searchRef={searchRef}
          searchText={searchText}
          onSearchChange={changeSearch}
          contactSearch={contactSearch}
          loading={loadState.status === "loading"}
          refreshing={refreshing}
          onRefresh={refresh}
          bulk={bulkBar}
          rows={visible}
          total={total}
          selectedId={selected?.id ?? null}
          onSelect={selectRow}
          checked={checked}
          onToggleChecked={toggleChecked}
          canCheck={(row) => canBulk(row, "spam") || canBulk(row, "rejected")}
          titleOf={labels.itemTitle}
          subtitleOf={labels.itemSubtitle}
          importanceOf={(row) => adapter.importance?.(row) ?? null}
          holdOf={(row) => holdOf(row, actorEmail)}
          empty={empty}
          onShowEverything={() => changeFilter("all")}
          onClearSearch={() => {
            setSearchText("");
            searchRef.current?.focus();
          }}
          canLoadMore={Boolean(nextCursor)}
          loadingMore={moreState.status === "loading"}
          onLoadMore={() => void loadMore()}
          moreError={moreState.status === "error" ? moreState.message : null}
          onDismissMoreError={() => setMoreState({ status: "idle" })}
          ready={ready}
          error={
            loadState.status === "error" ? (
              <LoadErrorState
                what={noun}
                message={loadState.message}
                onRetry={() => void loadQueue({ background: feedback.length > 0 })}
              />
            ) : null
          }
        />

        <section
          ref={paneRef}
          aria-label={selected ? `Review: ${labels.itemTitle(selected)}` : "Review"}
          className={cn("scroll-mt-24", paneHidden && (ready ? "hidden lg:block" : "hidden"))}
        >
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
          {openLink ? (
            <EditorPanel className="space-y-4 p-4 sm:p-5">
              <Button type="button" variant="ghost" size="sm" className="-ml-2 lg:hidden" onClick={backToList}>
                <Icon icon="lucide:arrow-left" size={14} />
                Back to list
              </Button>
              {openLink.state === "missing" ? (
                <Notice
                  tone="warning"
                  title={MISSING_TASK_TITLE}
                  message="The link names a feedback item that was removed, or one your role cannot open. Nothing else was selected in its place."
                  actions={(
                    <Button type="button" variant="outline" size="sm" onClick={leaveLink}>
                      Show the queue
                    </Button>
                  )}
                />
              ) : openLink.state === "error" ? (
                <Notice
                  tone="danger"
                  title="The linked feedback did not load"
                  message={openLink.message}
                  actions={(
                    <Button type="button" variant="outline" size="sm" onClick={() => void lookUpLinked(openLink.id)}>
                      Try again
                    </Button>
                  )}
                />
              ) : (
                <EditorStatusPill tone="info" loading live>
                  Opening the linked feedback
                </EditorStatusPill>
              )}
            </EditorPanel>
          ) : selected ? (
            <FeedbackReviewPane
              key={selected.id}
              title={labels.itemTitle(selected)}
              subtitle={labels.itemSubtitle(selected)}
              status={selected.status}
              importance={adapter.importance?.(selected) ?? null}
              receivedAt={selected.created_at}
              hold={holdOf(selected, actorEmail)}
              headingId={paneHeadingId}
              position={selectedIndex >= 0 ? { index: selectedIndex, total: visible.length } : null}
              onMove={move}
              onBackToList={backToList}
              onCopyLink={taskLinkFor ? () => void copyTaskLink(selected.id) : undefined}
              hiddenByList={hiddenByList}
              facts={adapter.renderDetail(selected)}
              details={selected.details}
              correction={
                adapter.renderCorrection ? (
                  <CorrectionSlot key={selected.id} folded={selected.status === "spam"}>
                    {adapter.renderCorrection(selected, replaceRow)}
                  </CorrectionSlot>
                ) : null
              }
              history={<FeedbackHistory row={selected} keepsDecisionLog={adapter.keepsDecisionLog === true} />}
              note={note}
              noteId={noteId}
              noteRef={noteRef}
              noteDescription={
                adapter.keepsDecisionLog
                  ? "Optional. Added to the decision log with the decision you make next."
                  : "Optional. Saved with the decision and replaces the previous note."
              }
              onNoteChange={changeNote}
              validTargets={adapter.transitions[selected.status] ?? []}
              recordsOutcomes={adapter.recordsOutcomes === true}
              pending={pending && pending.id === selected.id ? pending.action : null}
              // Another row's decision in flight leaves this one free to read and note.
              busy={pending?.id === selected.id || bulkPending}
              frozen={frozen}
              notice={notice}
              onDismissNotice={() => setNotice(null)}
              canUndo={Boolean(lastDecision && undoTo)}
              onUndo={() => void undoLastDecision()}
              onDecide={decide}
              onClaim={() => void updateStatus("reviewing", undefined, "claim")}
              onRelease={() => void updateStatus("new", undefined, "release")}
              onReopen={() => void updateStatus("reviewing", undefined, "reopen")}
            />
          ) : (
            <div className="space-y-3">
              {notice ? (
                <Notice placement="inline" tone={notice.tone} dismiss={() => setNotice(null)}>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{notice.message}</span>
                    {notice.undo && lastDecision && undoTo ? (
                      <Button
                        type="button"
                        variant="link"
                        size="auto"
                        className="text-sm"
                        disabled={busy}
                        aria-keyshortcuts="u"
                        onClick={() => void undoLastDecision()}
                      >
                        Undo
                      </Button>
                    ) : null}
                  </span>
                </Notice>
              ) : null}
              <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted hidden text-sm lg:block">
                {ready && visible.length === 0 ? (
                  <span className="flex items-center gap-2">
                    <Icon icon="lucide:inbox" size={16} className="theme-text-faint shrink-0" />
                    Nothing to review under this filter.
                  </span>
                ) : (
                  <>
                    Pick feedback to review it here
                    <span className="[@media(pointer:coarse)]:hidden">
                      , or press <kbd className="theme-dev-kbd">j</kbd> to start at the top
                    </span>
                    .
                  </>
                )}
              </EmptyStateSurface>
            </div>
          )}
        </section>
      </div>
      {draftDialog}
      {confirmDialog}
      {helpDialog}
    </div>
  );
}

/**
 * The source's correction panel. On spam it folds shut (nothing to correct,
 * but a mistaken spam call can still be corrected) and mounts only when opened.
 */
function CorrectionSlot({ folded, children }: { folded: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!folded);
  const regionId = useId();
  if (!folded) return <>{children}</>;
  return (
    <section className="space-y-3">
      <h4 className="theme-accent-heading text-sm font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((value) => !value)}
          className="theme-focus-ring inline-flex items-center gap-2 rounded-control"
        >
          Correction
          <ExpandIndicator isExpanded={open} />
        </button>
      </h4>
      <div id={regionId} hidden={!open}>
        {open ? children : null}
      </div>
      {open ? null : <p className="theme-text-muted text-sm">Marked as spam, so there is nothing to correct. Open it to start or link a correction anyway.</p>}
    </section>
  );
}

/** The decision log for sources that keep one; otherwise the latest note with who and when. */
function FeedbackHistory({ row, keepsDecisionLog }: { row: FeedbackQueueItem; keepsDecisionLog: boolean }) {
  if (keepsDecisionLog) {
    return (
      <DecisionLogSection
        entries={decisionLogOf(row)}
        statusLabel={(status) => STATUS_LABELS[status]}
        outcomeLabel={(outcome) => FEEDBACK_OUTCOME_LABEL[outcome]}
      />
    );
  }
  if (!row.review_notes && !row.reviewed_by) return null;
  return (
    <section>
      <h4 className="theme-accent-heading text-sm font-semibold">Review notes</h4>
      {row.reviewed_by || row.reviewed_at ? (
        <p className="theme-text-faint mt-1 text-xs">
          {[formatReviewerIdentity(row.reviewed_by), formatFeedbackDate(row.reviewed_at)].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {row.review_notes ? (
        <p className="theme-text-secondary mt-2 whitespace-pre-line text-sm leading-6">{row.review_notes}</p>
      ) : null}
    </section>
  );
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

export function FeedbackStatusPill({ status, inline = false }: { status: FeedbackQueueStatus; inline?: boolean }) {
  return (
    <EditorStatusPill inline={inline} tone={STATUS_PILL_TONE[status] ?? "neutral"}>
      {STATUS_LABELS[status] ?? status}
    </EditorStatusPill>
  );
}

export function FeedbackImportancePill({ importance, inline = false }: { importance: FeedbackImportance; inline?: boolean }) {
  return (
    <EditorStatusPill inline={inline} tone={IMPORTANCE_PILL_TONE[importance]}>
      {IMPORTANCE_WORD[importance]}
    </EditorStatusPill>
  );
}

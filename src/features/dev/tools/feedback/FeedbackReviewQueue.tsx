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
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";

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
};

export type FeedbackSourceAdapter<Item extends FeedbackQueueItem> = {
  source: "article" | "site";
  /** The newest rows of every status, at most `FEEDBACK_QUEUE_WINDOW` of them. */
  fetchList: () => Promise<Item[]>;
  transition: (id: string, input: FeedbackTransitionInput) => Promise<Item>;
  transitions: Record<FeedbackQueueStatus, FeedbackQueueStatus[]>;
  /** Source-specific header and metadata; the queue renders details, notes, and decisions. */
  renderDetail: (item: Item) => ReactNode;
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

/**
 * How many rows one load brings down, the most the queue endpoint returns.
 * The filter and its counts work over this window; the queue says so when
 * the window is full.
 */
export const FEEDBACK_QUEUE_WINDOW = 250;

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type ActionFeedback = { tone: "success" | "danger"; message: string };

const QUEUE_STATUSES: FeedbackQueueStatus[] = ["new", "reviewing", "resolved", "rejected", "spam"];

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

export function isFeedbackQueueFilter(value: unknown): value is FeedbackQueueFilter {
  return typeof value === "string" && (QUEUE_FILTERS as string[]).includes(value);
}

type StatusCounts = Record<FeedbackQueueFilter, number>;

function countByStatus(rows: readonly FeedbackQueueItem[]): StatusCounts {
  const counts: StatusCounts = { all: rows.length, new: 0, reviewing: 0, resolved: 0, rejected: 0, spam: 0 };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}

/** "3 new · 4 resolved": the statuses that have rows, in queue order. */
function describeCounts(counts: StatusCounts): string {
  const parts = QUEUE_STATUSES.filter((status) => counts[status] > 0).map(
    (status) => `${counts[status]} ${STATUS_LABELS[status].toLowerCase()}`,
  );
  if (parts.length === 0) {
    return "Empty";
  }
  const summary = parts.join(" · ");
  return counts.all >= FEEDBACK_QUEUE_WINDOW ? `${summary} · latest ${FEEDBACK_QUEUE_WINDOW} only` : summary;
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
   * New rows when there are any, since clearing them is the job, else all.
   */
  statusFilter: FeedbackQueueFilter | null;
  onStatusFilterChange: (filter: FeedbackQueueFilter) => void;
}) {
  const { labels } = adapter;
  const reviewSectionId = `${adapter.source}-feedback-review-section`;
  const [feedback, setFeedback] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [note, setNote] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  /**
   * Which list request is allowed to write state. Every load takes the next
   * number, so a response arriving after a newer load (or after unmount) is
   * dropped instead of overwriting the newer list.
   */
  const loadVersion = useRef(0);

  const { guard, dialog: draftDialog } = useDirtyGuard(note.trim().length > 0, {
    title: "Discard the review note?",
    description: "The note you typed is only saved with a decision. Leaving this item now drops it.",
  });
  const { confirm, dialog: confirmDialog } = useConfirm();

  const loadQueue = useCallback(
    async (preferredId?: string) => {
      const version = ++loadVersion.current;
      setLoadState({ status: "loading" });
      try {
        const rows = await adapter.fetchList();
        if (version !== loadVersion.current) {
          return;
        }
        setFeedback(rows);
        setSelectedId(preferredId && rows.some((row) => row.id === preferredId) ? preferredId : null);
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
    [adapter],
  );

  useEffect(() => {
    void loadQueue();
    return () => {
      loadVersion.current += 1;
    };
  }, [loadQueue]);

  const counts = useMemo(() => countByStatus(feedback), [feedback]);
  const activeFilter: FeedbackQueueFilter = statusFilter ?? (counts.new > 0 ? "new" : "all");
  const visible = useMemo(
    () => (activeFilter === "all" ? feedback : feedback.filter((row) => row.status === activeFilter)),
    [feedback, activeFilter],
  );

  // A row that left the current filter (after a decision, or a filter change)
  // hands the review over to the first row still showing.
  const selected = useMemo(
    () => visible.find((row) => row.id === selectedId) ?? visible[0] ?? null,
    [selectedId, visible],
  );

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

    setPendingId(selected.id);
    setActionFeedback(null);
    const trimmedNote = note.trim();
    try {
      const updated = await adapter.transition(selected.id, {
        status,
        note: trimmedNote.length > 0 ? trimmedNote : undefined,
      });
      setFeedback((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setActionFeedback({
        tone: "success",
        message: labels.transitioned(updated, STATUS_LABELS[status].toLowerCase()),
      });
      setNote("");
      setPendingId(null);
      // Any transition can move the row in or out of the pending bucket the rail counts.
      invalidateDevRailBadge("feedback");
      // Reconcile the latest-window boundary and concurrent reviewer changes without
      // keeping this action pending behind another full queue transfer.
      void loadQueue(updated.id);
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
          <LoadErrorState message={loadState.message} onRetry={() => void loadQueue(selected?.id)} />
        ) : null}
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <EditorSection
          icon="lucide:list"
          title="Queue"
          description={loadState.status === "ready" ? describeCounts(counts) : "Loading"}
          delay={0.05}
          actions={(
            <>
              <label htmlFor={`${adapter.source}-feedback-filter`} className="sr-only">
                Queue filter
              </label>
              <Select value={activeFilter} onValueChange={(value) => changeFilter(value as FeedbackQueueFilter)}>
                <SelectTrigger id={`${adapter.source}-feedback-filter`} selectSize="compact" className="w-36">
                  <SelectValue>
                    {STATUS_LABELS[activeFilter]} ({counts[activeFilter]})
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {QUEUE_FILTERS.map((filter) => (
                    <SelectItem key={filter} value={filter}>
                      <span className="flex w-full items-center justify-between gap-3">
                        {STATUS_LABELS[filter]}{" "}
                        <span className="theme-text-faint tabular-nums">{counts[filter]}</span>
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
          {loadState.status === "ready" || feedback.length > 0 ? (
            <EditorList
              label="Feedback queue"
              items={visible}
              getKey={(row) => row.id}
              selectedKey={selected?.id ?? null}
              onSelect={selectRow}
              search={{
                placeholder: "Search feedback",
                matches: (row, query) =>
                  [labels.itemTitle(row), labels.itemSubtitle(row) ?? "", row.details]
                    .join(" ")
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              }}
              emptyText={
                activeFilter === "all"
                  ? labels.emptyQueue
                  : `No ${STATUS_LABELS[activeFilter].toLowerCase()} feedback right now.`
              }
              renderItem={(row, { selected: active }) => (
                <QueueRow
                  title={labels.itemTitle(row)}
                  subtitle={labels.itemSubtitle(row)}
                  row={row}
                  active={active}
                />
              )}
            />
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
              validTargets={adapter.transitions[selected.status] ?? []}
              pending={pendingId === selected.id}
              note={note}
              noteId={`${adapter.source}-feedback-review-note`}
              onNoteChange={setNote}
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
  row,
  subtitle,
  title,
}: {
  active: boolean;
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
          <FeedbackStatusPill status={row.status} />
        </span>
        <span className="theme-text-muted block truncate text-xs">{row.details}</span>
      </span>
    </EditorListItem>
  );
}

function FeedbackDetail({
  actionFeedback,
  header,
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

      {row.review_notes || row.reviewed_by ? (
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
          description="Optional. Saved with the decision and replaces the previous note."
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

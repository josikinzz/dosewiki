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
  EditorNotice,
  EditorPanel,
  EditorListItem,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
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
  fetchList: (filter: FeedbackQueueFilter) => Promise<Item[]>;
  transition: (id: string, input: FeedbackTransitionInput) => Promise<void>;
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

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type ActionFeedback = { tone: "success" | "danger"; message: string };

const QUEUE_STATUSES: FeedbackQueueFilter[] = [
  "all",
  "new",
  "reviewing",
  "resolved",
  "rejected",
  "spam",
];

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

export function FeedbackReviewQueue<Item extends FeedbackQueueItem>({
  adapter,
  headerActions,
}: {
  adapter: FeedbackSourceAdapter<Item>;
  /** Trailing controls on the tool heading, such as the tab's source filter. */
  headerActions?: ReactNode;
}) {
  const { labels } = adapter;
  const reviewSectionId = `${adapter.source}-feedback-review-section`;
  const [feedback, setFeedback] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeedbackQueueFilter>("all");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [note, setNote] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  /**
   * Which list request is allowed to write state. Every load takes the next
   * number, so a response for an earlier filter (or one arriving after
   * unmount) is dropped instead of overwriting the newer list.
   */
  const loadVersion = useRef(0);

  const loadQueue = useCallback(
    async (preferredId?: string) => {
      const version = ++loadVersion.current;
      setLoadState({ status: "loading" });
      try {
        const rows = await adapter.fetchList(statusFilter);
        if (version !== loadVersion.current) {
          return;
        }
        setFeedback(rows);
        setSelectedId(
          preferredId && rows.some((row) => row.id === preferredId)
            ? preferredId
            : rows[0]?.id ?? null,
        );
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
    [adapter, statusFilter],
  );

  useEffect(() => {
    void loadQueue();
    return () => {
      loadVersion.current += 1;
    };
  }, [loadQueue]);

  const selected = useMemo(
    () => feedback.find((row) => row.id === selectedId) ?? feedback[0] ?? null,
    [selectedId, feedback],
  );

  async function updateStatus(status: FeedbackQueueStatus) {
    if (!selected || pendingId) {
      return;
    }

    setPendingId(selected.id);
    setActionFeedback(null);
    const trimmedNote = note.trim();
    try {
      await adapter.transition(selected.id, {
        status,
        note: trimmedNote.length > 0 ? trimmedNote : undefined,
      });
      setActionFeedback({
        tone: "success",
        message: labels.transitioned(selected, STATUS_LABELS[status].toLowerCase()),
      });
      setNote("");
      // Any transition can move the row in or out of the pending bucket the rail counts.
      invalidateDevRailBadge("feedback");
      await loadQueue(selected.id);
    } catch (error) {
      setActionFeedback({
        tone: "danger",
        message: error instanceof Error ? error.message : "Unable to update feedback.",
      });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <EditorSection icon={labels.icon} title={labels.title} description={labels.description} actions={headerActions}>
        {loadState.status === "error" ? (
          <EditorNotice notice={{ tone: "danger", title: "Unable to load feedback", message: loadState.message }} />
        ) : null}
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <EditorSection
          icon="lucide:list"
          title="Queue"
          description={`${feedback.length} loaded`}
          delay={0.05}
          actions={(
            <>
              <label htmlFor={`${adapter.source}-feedback-filter`} className="sr-only">
                Queue filter
              </label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FeedbackQueueFilter)}>
                <SelectTrigger id={`${adapter.source}-feedback-filter`} selectSize="compact" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUEUE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
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
          {feedback.length === 0 && loadState.status === "ready" ? (
            <EmptyStateSurface padding="md" radius="lg" className="theme-text-muted text-sm">
              {statusFilter === "all"
                ? labels.emptyQueue
                : `No ${STATUS_LABELS[statusFilter].toLowerCase()} feedback matches this filter.`}
            </EmptyStateSurface>
          ) : null}
          {feedback.length > 0 ? (
            <div className="space-y-2">
              {feedback.map((row) => (
                <QueueRow
                  key={row.id}
                  title={labels.itemTitle(row)}
                  subtitle={labels.itemSubtitle(row)}
                  row={row}
                  active={selected?.id === row.id}
                  onSelect={() => {
                    setSelectedId(row.id);
                    setActionFeedback(null);
                    setNote("");
                    scrollReviewIntoViewOnSmallScreens(reviewSectionId);
                  }}
                />
              ))}
            </div>
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
              onStatusChange={updateStatus}
            />
          ) : (
            <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted text-sm">
              Select a feedback entry to review.
            </EmptyStateSurface>
          )}
        </EditorSection>
      </div>
    </div>
  );
}

function scrollReviewIntoViewOnSmallScreens(sectionId: string) {
  if (typeof window === "undefined" || window.innerWidth >= 1024) {
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

function QueueRow({
  active,
  onSelect,
  row,
  subtitle,
  title,
}: {
  active: boolean;
  onSelect: () => void;
  row: FeedbackQueueItem;
  subtitle: string | null;
  title: string;
}) {
  return (
    <EditorListItem active={active} onSelect={onSelect} className="items-start">
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className={`block truncate text-sm font-semibold ${active ? "theme-accent-heading" : "theme-text-primary"}`}>
              {title}
            </span>
            {subtitle ? (
              <span className="theme-text-faint mt-1 block truncate text-xs">{subtitle}</span>
            ) : null}
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
              <Button
                type="button"
                variant="destructive"
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

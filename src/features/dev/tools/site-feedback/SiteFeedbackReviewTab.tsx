"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SITE_FEEDBACK_CATEGORY_LABELS,
  SITE_FEEDBACK_STATUS_TRANSITIONS,
  SITE_FEEDBACK_URGENCY_LABELS,
  type SiteFeedbackRow,
  type SiteFeedbackStatus,
  type SiteFeedbackUrgency,
} from "@/features/site-feedback/siteFeedback";
import {
  ActionNotice,
  EditorActionGroup,
  EditorNotice,
  EditorPanel,
  EditorListItem,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type ActionFeedback = { tone: "success" | "danger"; message: string };

type QueueFilter = SiteFeedbackStatus | "all";

const QUEUE_STATUSES: QueueFilter[] = [
  "all",
  "new",
  "reviewing",
  "resolved",
  "rejected",
  "spam",
];

const STATUS_LABELS: Record<QueueFilter, string> = {
  all: "All",
  new: "New",
  reviewing: "Reviewing",
  resolved: "Resolved",
  rejected: "Rejected",
  spam: "Spam",
};

const STATUS_PILL_TONE: Record<SiteFeedbackStatus, EditorStatusPillTone> = {
  new: "info",
  reviewing: "caution",
  resolved: "success",
  rejected: "danger",
  spam: "danger",
};

const URGENCY_PILL_TONE: Record<SiteFeedbackUrgency, EditorStatusPillTone> = {
  critical: "danger",
  high: "caution",
  normal: "info",
  low: "neutral",
};

const REVIEW_SECTION_ID = "site-feedback-review-section";

export function SiteFeedbackReviewTab() {
  const [feedback, setFeedback] = useState<SiteFeedbackRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QueueFilter>("all");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);

  useEffect(() => {
    void loadQueue(statusFilter, setFeedback, setSelectedId, setLoadState);
  }, [statusFilter]);

  const selected = useMemo(
    () => feedback.find((row) => row.id === selectedId) ?? feedback[0] ?? null,
    [selectedId, feedback],
  );

  async function updateStatus(status: SiteFeedbackStatus, notes: string) {
    if (!selected) {
      return;
    }

    setActionFeedback(null);
    try {
      const response = await fetch(`/api/site-feedback/${selected.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionFeedback({
          tone: "danger",
          message: typeof payload.error === "string" ? payload.error : "Unable to update feedback.",
        });
        return;
      }

      setActionFeedback({
        tone: "success",
        message: `Moved ${SITE_FEEDBACK_CATEGORY_LABELS[selected.category].toLowerCase()} feedback to ${STATUS_LABELS[status].toLowerCase()}.`,
      });
      await loadQueue(statusFilter, setFeedback, setSelectedId, setLoadState, selected.id);
    } catch {
      setActionFeedback({ tone: "danger", message: "Network error while updating the feedback." });
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <EditorSection
        icon="lucide:megaphone"
        title="Site Feedback"
        description="General site feedback from readers: requests, bugs, design, performance, and accessibility reports."
      >
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
              <label htmlFor="site-feedback-filter" className="sr-only">
                Queue filter
              </label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as QueueFilter)}>
                <SelectTrigger id="site-feedback-filter" selectSize="compact" className="w-36">
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
                ? "No site feedback yet."
                : `No ${STATUS_LABELS[statusFilter].toLowerCase()} feedback matches this filter.`}
            </EmptyStateSurface>
          ) : null}
          {feedback.length > 0 ? (
            <div className="space-y-2">
              {feedback.map((row) => (
                <QueueRow
                  key={row.id}
                  row={row}
                  active={selected?.id === row.id}
                  onSelect={() => {
                    setSelectedId(row.id);
                    setActionFeedback(null);
                    scrollReviewIntoViewOnSmallScreens();
                  }}
                />
              ))}
            </div>
          ) : null}
        </EditorSection>

        <EditorSection
          id={REVIEW_SECTION_ID}
          icon="lucide:file-search"
          title="Review"
          description={
            selected
              ? `${SITE_FEEDBACK_CATEGORY_LABELS[selected.category]} · received ${formatDate(selected.created_at) ?? "unknown date"}`
              : "No feedback selected"
          }
          delay={0.1}
        >
          {selected ? (
            <FeedbackDetail
              row={selected}
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

async function loadQueue(
  status: QueueFilter,
  setFeedback: (rows: SiteFeedbackRow[]) => void,
  setSelectedId: (id: string | null) => void,
  setLoadState: (state: LoadState) => void,
  preferredId?: string,
) {
  setLoadState({ status: "loading" });
  try {
    const suffix = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
    const response = await fetch(`/api/site-feedback/queue${suffix}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setLoadState({
        status: "error",
        message: typeof payload.error === "string" ? payload.error : "Unable to load feedback.",
      });
      return;
    }

    const rows = Array.isArray(payload.feedback) ? payload.feedback : [];
    setFeedback(rows);
    setSelectedId(
      preferredId && rows.some((row: SiteFeedbackRow) => row.id === preferredId)
        ? preferredId
        : rows[0]?.id ?? null,
    );
    setLoadState({ status: "ready" });
  } catch {
    setLoadState({ status: "error", message: "Network error while loading feedback." });
  }
}

function scrollReviewIntoViewOnSmallScreens() {
  if (typeof window === "undefined" || window.innerWidth >= 1024) {
    return;
  }
  document.getElementById(REVIEW_SECTION_ID)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function formatDate(value?: string): string | null {
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
}: {
  active: boolean;
  onSelect: () => void;
  row: SiteFeedbackRow;
}) {
  return (
    <EditorListItem active={active} onSelect={onSelect} className="items-start">
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className={`block truncate text-sm font-semibold ${active ? "theme-accent-heading" : "theme-text-primary"}`}>
              {SITE_FEEDBACK_CATEGORY_LABELS[row.category]}
            </span>
            {row.urgency ? (
              <span className="theme-text-faint mt-1 block truncate text-xs">
                {SITE_FEEDBACK_URGENCY_LABELS[row.urgency]}
              </span>
            ) : null}
          </span>
          <StatusPill status={row.status} />
        </span>
        <span className="theme-text-muted block truncate text-xs">{row.details}</span>
      </span>
    </EditorListItem>
  );
}

function FeedbackDetail({
  actionFeedback,
  onDismissFeedback,
  onStatusChange,
  row,
}: {
  actionFeedback: ActionFeedback | null;
  onDismissFeedback: () => void;
  onStatusChange: (status: SiteFeedbackStatus, notes: string) => void;
  row: SiteFeedbackRow;
}) {
  const validTargets = SITE_FEEDBACK_STATUS_TRANSITIONS[row.status] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="theme-accent-heading text-xl font-semibold">
            {SITE_FEEDBACK_CATEGORY_LABELS[row.category]}
          </h3>
          {row.page ? (
            <p className="theme-text-muted mt-1 text-sm">
              <a
                href={row.page}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all hover:underline"
              >
                {row.page}
              </a>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.urgency ? (
            <EditorStatusPill tone={URGENCY_PILL_TONE[row.urgency]}>
              {SITE_FEEDBACK_URGENCY_LABELS[row.urgency]}
            </EditorStatusPill>
          ) : null}
          <StatusPill status={row.status} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <MetadataItem label="Received" value={formatDate(row.created_at)} />
        <MetadataItem label="Contact email" value={row.email} />
        <MetadataItem label="Honeypot" value={row.honeypot_triggered ? "Triggered" : undefined} />
      </div>

      <section>
        <h4 className="theme-accent-heading text-sm font-semibold">Details</h4>
        <p className="theme-text-secondary mt-2 whitespace-pre-line text-sm leading-6">{row.details}</p>
      </section>

      {row.review_notes || row.reviewed_by ? (
        <section>
          <h4 className="theme-accent-heading text-sm font-semibold">Review notes</h4>
          {row.reviewed_by || row.reviewed_at ? (
            <p className="theme-text-faint mt-1 text-xs">
              {[formatReviewerIdentity(row.reviewed_by), formatDate(row.reviewed_at)].filter(Boolean).join(" · ")}
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
        <EditorPanel variant="toolbar" className="p-3">
          <EditorToolbar label="Feedback review actions" variant="split">
            <EditorActionGroup label="Review decision">
              <Button
                type="button"
                variant="outline"
                disabled={!validTargets.includes("reviewing")}
                onClick={() => onStatusChange("reviewing", "Review started.")}
              >
                Reviewing
              </Button>
              <Button
                type="button"
                variant="success"
                disabled={!validTargets.includes("resolved")}
                onClick={() => onStatusChange("resolved", "Resolved — issue addressed or no change needed.")}
              >
                Resolve
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!validTargets.includes("rejected")}
                onClick={() => onStatusChange("rejected", "Rejected after editorial review.")}
              >
                Reject
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!validTargets.includes("spam")}
                onClick={() => onStatusChange("spam", "Marked as spam.")}
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

function StatusPill({ status }: { status: SiteFeedbackStatus }) {
  return (
    <EditorStatusPill tone={STATUS_PILL_TONE[status] ?? "neutral"}>
      {STATUS_LABELS[status] ?? status}
    </EditorStatusPill>
  );
}

function MetadataItem({ href, label, value }: { href?: string; label: string; value?: string | null }) {
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

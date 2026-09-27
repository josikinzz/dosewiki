"use client";

import type { ReactNode, RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField, EditorPanel, EditorStatusPill, Notice } from "@/features/dev/components";
import { describeDay } from "@/features/dev/tools/home/homeModel";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import {
  FEEDBACK_OUTCOMES,
  FEEDBACK_OUTCOME_LABEL,
  FEEDBACK_OUTCOME_STATUS,
  type FeedbackOutcome,
} from "@/features/intake/feedbackCorrection";
import { cn } from "@/lib/utils";

import type { FeedbackImportance, FeedbackQueueStatus } from "./FeedbackReviewQueue";
import {
  FEEDBACK_STATUS_LABELS,
  IMPORTANCE_PILL_TONE,
  IMPORTANCE_WORD,
  STATUS_PILL_TONE,
  isDecided,
  type FeedbackHold,
} from "./feedbackReviewModel";

/** What a pending control reads while its write is in flight. */
export type FeedbackPendingAction =
  | "claim"
  | "release"
  | "reopen"
  | "undo"
  | "resolved"
  | "rejected"
  | "spam"
  | FeedbackOutcome;

const PENDING_LABEL: Record<FeedbackPendingAction, string> = {
  claim: "Claiming",
  release: "Releasing",
  reopen: "Reopening",
  undo: "Undoing",
  resolved: "Resolving",
  rejected: "Rejecting",
  spam: "Marking as spam",
  duplicate: "Closing",
  explanation_provided: "Closing",
  no_change_needed: "Closing",
};

/** What each outcome does, in the words of the decision it records. */
const OUTCOME_HINT: Record<FeedbackOutcome, string> = {
  duplicate: "Resolves it: another report covers the same thing.",
  explanation_provided: "Resolves it: you answered the reader.",
  no_change_needed: "Rejects it: the page stays as it is.",
};

const DECISIONS: readonly { status: Extract<FeedbackQueueStatus, "resolved" | "rejected" | "spam">; label: string; key: string }[] = [
  { status: "resolved", label: "Resolve", key: "a" },
  { status: "rejected", label: "Reject", key: "r" },
  { status: "spam", label: "Mark as spam", key: "s" },
];

export type FeedbackNotice = { tone: "success" | "danger" | "info"; message: string; undo?: boolean };

export type FeedbackReviewPaneProps = {
  title: string;
  subtitle: string | null;
  status: FeedbackQueueStatus;
  importance: FeedbackImportance | null;
  receivedAt: string;
  hold: FeedbackHold;
  headingId: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** "N of M" and previous/next; null when the item is not in the list. */
  position: { index: number; total: number } | null;
  onMove: (direction: 1 | -1) => void;
  onBackToList: () => void;
  onCopyLink?: () => void;
  /** Said when the list's filter or search does not show this item. */
  hiddenByList?: ReactNode;
  facts: ReactNode;
  details: string;
  correction: ReactNode;
  history: ReactNode;
  note: string;
  noteId: string;
  noteRef?: RefObject<HTMLTextAreaElement | null>;
  noteDescription: string;
  onNoteChange: (value: string) => void;
  validTargets: readonly FeedbackQueueStatus[];
  recordsOutcomes: boolean;
  pending: FeedbackPendingAction | null;
  busy: boolean;
  frozen: boolean;
  notice: FeedbackNotice | null;
  onDismissNotice: () => void;
  canUndo: boolean;
  onUndo: () => void;
  onDecide: (status: FeedbackQueueStatus, outcome?: FeedbackOutcome) => void;
  onClaim: () => void;
  onRelease: () => void;
  onReopen: () => void;
};

/**
 * One feedback item under review, docked beside the list: a header that names
 * it once (title, category, age, importance, status, Copy link, pager), what
 * the reader sent, the correction, the history and the note, and a decision
 * dock that sticks to the bottom of the screen while the pane is on it (the
 * phone thumb zone). The Inbox's `ReviewPane` is the pattern.
 */
export function FeedbackReviewPane(props: FeedbackReviewPaneProps) {
  const {
    title,
    subtitle,
    status,
    importance,
    receivedAt,
    headingId,
    headingRef,
    position,
    onMove,
    onBackToList,
    onCopyLink,
    hiddenByList,
    facts,
    details,
    correction,
    history,
    note,
    noteId,
    noteRef,
    noteDescription,
    onNoteChange,
    validTargets,
    recordsOutcomes,
    pending,
    busy,
    frozen,
    notice,
    onDismissNotice,
    canUndo,
    onUndo,
    onDecide,
  } = props;
  const decided = isDecided(status);
  const can = (target: FeedbackQueueStatus) => !busy && validTargets.includes(target);
  const received = describeDay(receivedAt);

  const pager = position ? (
    <div className="flex items-center gap-1">
      <span className="theme-text-muted px-1 text-xs tabular-nums">
        {position.index + 1} of {position.total}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-8", TOUCH_ICON)}
        aria-label="Previous feedback"
        aria-keyshortcuts="k"
        title="Previous feedback (k)"
        disabled={position.index <= 0}
        onClick={() => onMove(-1)}
      >
        <Icon icon="lucide:chevron-up" size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-8", TOUCH_ICON)}
        aria-label="Next feedback"
        aria-keyshortcuts="j"
        title="Next feedback (j)"
        disabled={position.index >= position.total - 1}
        onClick={() => onMove(1)}
      >
        <Icon icon="lucide:chevron-down" size={16} />
      </Button>
    </div>
  ) : null;

  return (
    <EditorPanel className="overflow-visible">
      <header className="theme-portal-rule space-y-3 border-b px-4 py-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
          {pager}
        </div>

        <div className="flex items-start justify-between gap-3">
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="theme-accent-heading min-w-0 text-xl font-semibold leading-tight focus:outline-none"
          >
            {title}
          </h3>
          <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-1">
            {onCopyLink ? (
              <Button type="button" variant="ghost" size="sm" onClick={onCopyLink}>
                <Icon icon="lucide:link" size={14} />
                Copy link
              </Button>
            ) : null}
            <span className="hidden lg:contents">{pager}</span>
          </div>
        </div>

        {subtitle ? <p className="theme-text-secondary -mt-1 text-sm font-medium">{subtitle}</p> : null}
        <div className="theme-text-muted flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
          {received ? (
            <span>
              {decided ? "Received " : "Waiting since "}
              <time dateTime={receivedAt} title={received.full}>
                {received.relative}
              </time>
            </span>
          ) : null}
          {importance ? <FeedbackImportancePillInline importance={importance} /> : null}
          <FeedbackStatusPillInline status={status} />
        </div>
        {hiddenByList ? <div className="theme-text-muted text-sm">{hiddenByList}</div> : null}
      </header>

      <div className="space-y-7 px-4 py-5 sm:px-5 [&_:is(input,button,textarea,select,a)]:scroll-mb-48 [&_:is(input,button,textarea,select,a)]:scroll-mt-28">
        {facts}

        <section aria-labelledby={`${headingId}-words`}>
          <h4 id={`${headingId}-words`} className="theme-accent-heading text-sm font-semibold">
            What they wrote
          </h4>
          <div className="mt-2 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-4 py-3">
            <p className="theme-text-primary max-w-prose whitespace-pre-line text-sm leading-6">{details}</p>
          </div>
        </section>

        {correction}

        {history}

        <EditorField htmlFor={noteId} label="Review note" description={noteDescription}>
          <Textarea
            ref={noteRef}
            id={noteId}
            textareaSize="sm"
            value={note}
            disabled={busy}
            aria-keyshortcuts="n"
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="What was checked, changed, or why this was declined."
          />
        </EditorField>
      </div>

      <footer
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
        aria-label="Decision"
      >
        {notice ? (
          <Notice placement="inline" tone={notice.tone} dismiss={onDismissNotice}>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{notice.message}</span>
              {notice.undo && canUndo ? (
                <Button
                  type="button"
                  variant="link"
                  size="auto"
                  className="text-sm"
                  disabled={busy}
                  aria-keyshortcuts="u"
                  aria-busy={pending === "undo" || undefined}
                  onClick={onUndo}
                >
                  {pending === "undo" ? PENDING_LABEL.undo : "Undo"}
                </Button>
              ) : null}
            </span>
          </Notice>
        ) : null}
        {frozen && !notice ? (
          <p className="theme-text-muted flex items-center gap-2 text-xs">
            <Icon icon="lucide:circle-pause" size={13} className="theme-warning-text-strong shrink-0" />
            Writes are paused right now; a decision will not save until they resume.
          </p>
        ) : null}
        <HoldLine {...props} />
        {decided ? null : (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Decide">
            {DECISIONS.map((decision) => (
              <Button
                key={decision.status}
                type="button"
                size="sm"
                variant={decision.status === "resolved" ? "accent" : "outline"}
                disabled={!can(decision.status)}
                aria-keyshortcuts={decision.key}
                aria-busy={pending === decision.status || undefined}
                onClick={() => onDecide(decision.status)}
              >
                {pending === decision.status ? PENDING_LABEL[decision.status] : decision.label}
                {/* The wrapper hides the cap on touch screens; the kbd class sets its own display. */}
                <span aria-hidden className="[@media(pointer:coarse)]:hidden">
                  <kbd className="theme-dev-kbd !text-current opacity-70">{decision.key}</kbd>
                </span>
              </Button>
            ))}
            {recordsOutcomes ? (
              <OutcomeMenu
                pending={pending}
                can={(outcome) => can(FEEDBACK_OUTCOME_STATUS[outcome])}
                disabled={busy}
                onPick={(outcome) => onDecide(FEEDBACK_OUTCOME_STATUS[outcome], outcome)}
              />
            ) : null}
          </div>
        )}
      </footer>
    </EditorPanel>
  );
}

/** Close without a correction: Duplicate, Explanation provided, No change needed, each with what it records. */
function OutcomeMenu({
  pending,
  can,
  disabled,
  onPick,
}: {
  pending: FeedbackPendingAction | null;
  can: (outcome: FeedbackOutcome) => boolean;
  disabled: boolean;
  onPick: (outcome: FeedbackOutcome) => void;
}) {
  const closing = pending !== null && (FEEDBACK_OUTCOMES as readonly string[]).includes(pending);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} aria-busy={closing || undefined}>
          {closing ? PENDING_LABEL[pending as FeedbackOutcome] : "Close as"}
          <Icon icon="lucide:chevron-down" size={14} className="theme-text-faint shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(20rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Close without a correction</DropdownMenuLabel>
        {FEEDBACK_OUTCOMES.map((outcome) => (
          <DropdownMenuItem
            key={outcome}
            disabled={!can(outcome)}
            onSelect={() => onPick(outcome)}
            className="h-auto flex-col items-start gap-0.5 py-2"
          >
            <span className="font-medium">{FEEDBACK_OUTCOME_LABEL[outcome]}</span>
            <span className="theme-text-muted text-xs">{OUTCOME_HINT[outcome]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Who has this item, or who decided it, with the one action that changes that. */
function HoldLine({ hold, status, validTargets, busy, pending, onClaim, onRelease, onReopen }: FeedbackReviewPaneProps) {
  let icon = "lucide:user-round";
  let iconClass = "theme-text-faint";
  let sentence: ReactNode;
  let action: { label: string; kind: FeedbackPendingAction; onClick: () => void; target: FeedbackQueueStatus } | null = null;
  const when = (at: string | null) => {
    const day = at ? describeDay(at) : null;
    return day ? (
      <>
        {" "}
        <time dateTime={at ?? undefined} title={day.full}>
          {day.relative}
        </time>
      </>
    ) : null;
  };

  switch (hold.kind) {
    case "open":
      sentence = "Nobody is reviewing this yet.";
      action = { label: "Claim", kind: "claim", onClick: onClaim, target: "reviewing" };
      break;
    case "mine":
      icon = "lucide:user-round-check";
      iconClass = "theme-icon-accent";
      sentence = <>You are reviewing this{hold.at ? <>, since{when(hold.at)}</> : null}.</>;
      action = { label: "Release", kind: "release", onClick: onRelease, target: "new" };
      break;
    case "other":
      sentence = <>Claimed by {formatReviewerIdentity(hold.by) ?? hold.by}{hold.at ? <>,{when(hold.at)}</> : null}.</>;
      break;
    case "unknown":
      sentence = "In review. No reviewer was recorded.";
      action = { label: "Release", kind: "release", onClick: onRelease, target: "new" };
      break;
    case "decided": {
      icon = hold.status === "resolved" ? "lucide:circle-check" : hold.status === "spam" ? "lucide:ban" : "lucide:circle-x";
      const who = hold.mine ? "you" : hold.by ? formatReviewerIdentity(hold.by) ?? hold.by : null;
      sentence = (
        <>
          {FEEDBACK_STATUS_LABELS[status]}
          {who ? ` by ${who}` : ""}
          {hold.at ? <>,{when(hold.at)}</> : null}. Reopen it to decide again.
        </>
      );
      action = { label: "Reopen", kind: "reopen", onClick: onReopen, target: "reviewing" };
      break;
    }
  }
  const allowed = action ? validTargets.includes(action.target) : false;

  return (
    <div className="theme-portal-rule flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b pb-2.5 last:border-b-0 last:pb-0">
      <Icon icon={icon} size={16} className={cn("shrink-0", iconClass)} />
      <p className={cn("min-w-0 flex-1 text-sm", hold.kind === "mine" ? "theme-text-primary font-medium" : "theme-text-secondary")}>
        {sentence}
      </p>
      {action && allowed ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          aria-busy={pending === action.kind || undefined}
          onClick={action.onClick}
        >
          {pending === action.kind ? PENDING_LABEL[action.kind] : action.label}
        </Button>
      ) : null}
    </div>
  );
}

function FeedbackImportancePillInline({ importance }: { importance: FeedbackImportance }) {
  return (
    <EditorStatusPill inline tone={IMPORTANCE_PILL_TONE[importance]}>
      {IMPORTANCE_WORD[importance]}
      <span className="sr-only"> importance</span>
    </EditorStatusPill>
  );
}

function FeedbackStatusPillInline({ status }: { status: FeedbackQueueStatus }) {
  return (
    <EditorStatusPill inline tone={STATUS_PILL_TONE[status]}>
      {FEEDBACK_STATUS_LABELS[status]}
    </EditorStatusPill>
  );
}

"use client";

import { useId, useState, type ReactNode, type RefObject } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorPanel, Notice, type NoticeMessage } from "@/features/dev/components";
import { describeDay } from "@/features/dev/tools/home/homeModel";
import type { ProposalHold } from "@/features/dev/tools/queue/queueModel";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { cn } from "@/lib/utils";

import { CitationOpenInReview } from "./CitationQueuePanel";
import { describeTally, type CitationTally } from "./citationPaneModel";
import {
  formatCitationCount,
  type CitationReviewApproveCommand,
  type CitationReviewChecklistItem,
} from "./citationReviewModels";

/** A key cap on fine pointers only; the key itself rides in `aria-keyshortcuts`. */
export function KeyCap({ children }: { children: string }) {
  return (
    <span aria-hidden className="[@media(pointer:coarse)]:hidden">
      <kbd className="theme-dev-kbd !text-current opacity-70">{children}</kbd>
    </span>
  );
}

/** A relative day in a `<time>` whose title is the full date. */
export function RelativeTime({ iso }: { iso: string | null | undefined }) {
  const day = iso ? describeDay(iso) : null;
  if (!iso || !day) return <>at an unknown time</>;
  return (
    <time dateTime={iso} title={day.full}>
      {day.relative}
    </time>
  );
}

export type CitationPendingAction = "approve" | "reject" | "bulk" | "undo" | "claim" | "release";

const PENDING_WORDS: Record<CitationPendingAction, string> = {
  approve: "Approving",
  reject: "Rejecting",
  bulk: "Approving the set",
  undo: "Undoing",
  claim: "Claiming",
  release: "Releasing",
};

const CHECK_ICON: Record<CitationReviewChecklistItem["tone"], { icon: IconName; className: string }> = {
  complete: { icon: "lucide:circle-check", className: "theme-success-text-strong" },
  pending: { icon: "lucide:clock-3", className: "theme-text-faint" },
  attention: { icon: "lucide:triangle-alert", className: "theme-danger-text-strong" },
};

/** The pre-flight checks as one quiet list: a glyph for where each stands, then its words. */
function WhereItStands({ checklist }: { checklist: CitationReviewChecklistItem[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h4 id={headingId} className="theme-accent-heading text-sm font-semibold">
        Where it stands
      </h4>
      <ul className="space-y-1.5 text-sm">
        {checklist.map((item) => {
          const glyph = CHECK_ICON[item.tone];
          return (
            <li key={item.id} className="flex gap-2.5">
              <Icon icon={glyph.icon} size={15} className={cn("mt-0.5 shrink-0", glyph.className)} />
              <span className="min-w-0">
                <span className="theme-text-primary font-medium">{item.label}.</span>{" "}
                <span className="theme-text-secondary">{item.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The article's own reference markers (the shared diagnostics panel), folded
 * shut: most reviews never need it, and it renders every prose field.
 */
function MarkerCheck({
  state,
  summary,
  onRetry,
  children,
}: {
  state: "loading" | "failed" | "ready";
  summary: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          disabled={state !== "ready"}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "theme-dev-link-row -mx-2.5 flex min-h-11 w-[calc(100%+1.25rem)] items-center gap-3 rounded-control px-2.5 py-2 text-left disabled:cursor-default",
            open && "theme-dev-link-lead",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="theme-accent-heading block">Markers in the article text</span>
            <span className="theme-text-muted block text-xs font-normal">
              {state === "loading" ? "Loading the article to check its markers" : state === "failed" ? "The article did not load, so its markers cannot be checked." : summary}
            </span>
          </span>
          {state === "ready" ? <ExpandIndicator isExpanded={open} /> : null}
        </button>
      </h4>
      {state === "failed" ? (
        <Button type="button" variant="link" size="auto" className="text-sm" onClick={onRetry}>
          Load the article again
        </Button>
      ) : null}
      <div id={regionId} hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}

export type CitationArticlePaneProps = {
  slug: string;
  title: string;
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** "N of M" through the rows the list shows; null when the list does not show it. */
  position: { index: number; total: number } | null;
  onMove: (direction: 1 | -1) => void;
  onBackToList: () => void;
  /** Said when the list's filter or search does not show this article. */
  hiddenByList: ReactNode;
  lastChange: string | null;
  tally: CitationTally | null;
  /** Whether the rows behind the tally are loading or failed, when there is no tally. */
  rowsState?: "loading" | "failed";
  checklist: CitationReviewChecklistItem[];
  markers: { state: "loading" | "failed" | "ready"; summary: string; onRetry: () => void; panel: ReactNode };
  /** The evidence sections, or the loading and failure states in their place. */
  children: ReactNode;
  // Dock
  busy: boolean;
  pending: CitationPendingAction | null;
  frozen: boolean;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
  keyHint: string | null;
  hold: ProposalHold | null;
  onClaim: () => void;
  onRelease: () => void;
  bulk: CitationReviewApproveCommand | null;
  openedReadyCount: number;
  onApproveAll: () => void;
  onOpenNextUnread: (() => void) | null;
  /** Undo for the article-wide approval, or for a decision on another article. */
  undoSlot: ReactNode;
  nextWaiting: { title: string; onOpen: () => void } | null;
};

/**
 * One article under review, docked beside the list: a header that names it
 * once (title, where it stands in a line, when it last changed, Open in
 * Review, pager), the pre-flight checks, the evidence by section, and a
 * decision dock that sticks to the bottom of the screen while the pane is on
 * it: the last result, the hold line, and the article-wide approval with the
 * one reason it waits.
 */
export function CitationArticlePane(props: CitationArticlePaneProps) {
  const {
    slug,
    title,
    headingId,
    headingRef,
    position,
    onMove,
    onBackToList,
    hiddenByList,
    lastChange,
    tally,
    rowsState = "loading",
    checklist,
    markers,
    children,
    busy,
  } = props;

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
        aria-label="Previous article"
        aria-keyshortcuts="k"
        title="Previous article (k)"
        disabled={position.index <= 0 || busy}
        onClick={() => onMove(-1)}
      >
        <Icon icon="lucide:chevron-up" size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-8", TOUCH_ICON)}
        aria-label="Next article"
        aria-keyshortcuts="j"
        title="Next article (j)"
        disabled={position.index >= position.total - 1 || busy}
        onClick={() => onMove(1)}
      >
        <Icon icon="lucide:chevron-down" size={16} />
      </Button>
    </div>
  ) : null;

  return (
    <EditorPanel className="overflow-visible">
      <header className="theme-portal-rule space-y-2.5 border-b px-4 py-3.5 sm:px-5">
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
            <span className="px-2">
              <CitationOpenInReview slug={slug} />
            </span>
            <span className="hidden lg:contents">{pager}</span>
          </div>
        </div>
        <p className="theme-text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="theme-text-secondary tabular-nums">{tally ? describeTally(tally) : rowsState === "failed" ? "Its rows did not load" : "Loading its rows"}</span>
          {lastChange ? (
            <>
              <span aria-hidden className="max-sm:hidden">·</span>
              <span className="max-sm:basis-full">
                Last change <RelativeTime iso={lastChange} />
              </span>
            </>
          ) : null}
        </p>
        {hiddenByList ? <div className="theme-text-muted text-sm">{hiddenByList}</div> : null}
      </header>

      <div className="space-y-7 px-4 py-5 sm:px-5 [overflow-wrap:anywhere] [&_:is(input,button,textarea,select,a)]:scroll-mb-48 [&_:is(input,button,textarea,select,a)]:scroll-mt-28">
        {tally ? <WhereItStands checklist={checklist} /> : null}
        {children}
        <MarkerCheck state={markers.state} summary={markers.summary} onRetry={markers.onRetry}>
          {markers.panel}
        </MarkerCheck>
      </div>

      <CitationDock {...props} />
    </EditorPanel>
  );
}

function CitationDock({
  busy,
  pending,
  frozen,
  notice,
  onDismissNotice,
  keyHint,
  hold,
  onClaim,
  onRelease,
  bulk,
  openedReadyCount,
  onApproveAll,
  onOpenNextUnread,
  undoSlot,
  nextWaiting,
}: CitationArticlePaneProps) {
  const readyCount = bulk?.claimKeys.length ?? 0;
  const locked = readyCount > 0 && openedReadyCount < readyCount;
  const pendingWords = pending && pending !== "claim" && pending !== "release" ? PENDING_WORDS[pending] : null;
  const reasonId = useId();

  return (
    <footer
      className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      aria-label="Decision"
    >
      {notice ? (
        <Notice placement="inline" tone={notice.tone} title={notice.title} dismiss={onDismissNotice} actions={notice.actions}>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{notice.message}</span>
            {nextWaiting && notice.tone !== "danger" && notice.tone !== "warning" ? (
              <Button type="button" variant="link" size="auto" className="text-sm" disabled={busy} onClick={nextWaiting.onOpen}>
                Next waiting: {nextWaiting.title}
              </Button>
            ) : null}
          </span>
        </Notice>
      ) : null}
      {undoSlot}
      {pendingWords ? (
        <p className="theme-text-muted flex items-center gap-2 text-sm" role="status" aria-live="polite">
          <Icon icon="lucide:loader-circle" size={14} className="motion-safe:animate-spin" />
          {pendingWords}. Wait for it to finish before picking another article.
        </p>
      ) : null}
      <p className="theme-text-muted text-sm empty:hidden" role="status" aria-live="polite">
        {keyHint}
      </p>
      {frozen && !notice ? (
        <p className="theme-text-muted flex items-center gap-2 text-xs">
          <Icon icon="lucide:circle-pause" size={13} className="theme-warning-text-strong shrink-0" />
          Writes are paused right now; a decision will not save until they resume.
        </p>
      ) : null}
      {hold ? <HoldLine hold={hold} busy={busy} pending={pending} onClaim={onClaim} onRelease={onRelease} /> : null}

      {bulk && readyCount > 0 ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 max-sm:flex-nowrap" role="group" aria-label="Decide">
            <Button
              type="button"
              size="sm"
              variant="accent"
              disabled={bulk.disabled || locked}
              aria-busy={pending === "bulk" || undefined}
              aria-describedby={reasonId}
              onClick={onApproveAll}
            >
              <Icon icon="lucide:badge-check" size={14} className="max-sm:hidden" />
              {`Approve ${formatCitationCount(readyCount, "ready row")}`}
            </Button>
            {locked && onOpenNextUnread ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label="Open the next unread row"
                aria-keyshortcuts="o"
                onClick={onOpenNextUnread}
              >
                <Icon icon="lucide:book-open" size={14} className="max-sm:hidden" />
                <span className="sm:hidden">Next unread</span>
                <span className="hidden sm:inline">Open the next unread row</span>
                <KeyCap>o</KeyCap>
              </Button>
            ) : null}
          </div>
          <p id={reasonId} className="theme-text-muted text-xs">
            {locked
              ? `Open each ready row before approving the set (${openedReadyCount} of ${readyCount} opened).`
              : "Asks first, listing the sections it touches."}
          </p>
        </div>
      ) : bulk ? (
        <p className="theme-text-muted flex items-center gap-2 text-xs">
          <Icon icon="lucide:circle-check" size={13} className="theme-icon-accent shrink-0" />
          Every row with a verified quote has been decided. Rows without one wait on new research.
        </p>
      ) : null}
    </footer>
  );
}

/** Who holds the article in the Inbox's claim table, with the one action that changes that. Advisory. */
function HoldLine({
  hold,
  busy,
  pending,
  onClaim,
  onRelease,
}: {
  hold: ProposalHold;
  busy: boolean;
  pending: CitationPendingAction | null;
  onClaim: () => void;
  onRelease: () => void;
}) {
  let icon: IconName = "lucide:user-round";
  let iconClass = "theme-text-faint";
  let sentence: ReactNode;
  let action: { label: string; kind: "claim" | "release"; onClick: () => void } | null = null;
  switch (hold.kind) {
    case "open":
      sentence = "Nobody has claimed this article yet.";
      action = { label: "Claim", kind: "claim", onClick: onClaim };
      break;
    case "mine":
      icon = "lucide:user-round-check";
      iconClass = "theme-icon-accent";
      sentence = <>You are reviewing this{hold.at ? <>, since <RelativeTime iso={hold.at} /></> : null}.</>;
      action = { label: "Release", kind: "release", onClick: onRelease };
      break;
    case "other":
      sentence = (
        <>
          Claimed by {formatReviewerIdentity(hold.by) ?? hold.by}
          {hold.at ? <>, <RelativeTime iso={hold.at} /></> : null}. Claims are advisory; you can still decide.
        </>
      );
      break;
    case "unknown":
      sentence = "Could not load who is reviewing this. Refresh to check.";
      break;
  }
  return (
    <div className="theme-portal-rule flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b pb-2.5">
      <Icon icon={icon} size={16} className={cn("shrink-0", iconClass)} />
      <p className={cn("min-w-0 flex-1 text-sm", hold.kind === "mine" ? "theme-text-primary font-medium" : "theme-text-secondary")}>
        {sentence}
      </p>
      {action ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          aria-busy={pending === action.kind || undefined}
          onClick={action.onClick}
        >
          {pending === action.kind ? PENDING_WORDS[action.kind] : action.label}
        </Button>
      ) : null}
    </div>
  );
}

/** The pane while its rows load. */
export function CitationPaneSkeleton() {
  return (
    <EditorPanel>
      <div aria-busy="true" className="space-y-4 px-5 py-5">
        <span className="sr-only">Loading evidence</span>
        <span aria-hidden className="theme-skeleton-pulse block h-6 w-2/5 rounded-chip" />
        <span aria-hidden className="theme-skeleton-pulse block h-3.5 w-3/5 rounded-chip" />
        <span aria-hidden className="theme-skeleton-pulse block h-20 w-full rounded-card" />
        <span aria-hidden className="theme-skeleton-pulse block h-40 w-full rounded-card" />
      </div>
    </EditorPanel>
  );
}

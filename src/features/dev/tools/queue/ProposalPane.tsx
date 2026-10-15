"use client";

import type { ReactNode, RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField, EditorPanel, EditorStatusPill, Notice, type NoticeMessage } from "@/features/dev/components";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { cn } from "@/lib/utils";

import {
  ProposalChanges,
  ProposalDiscussion,
  ProposalFacts,
  ProposalFeedback,
  ProposalNextStep,
  ProposalOtherEditors,
  ProposalTargets,
  ProposalTime,
} from "./ProposalReview";
import {
  STATUS_LABELS,
  STATUS_PILL_TONE,
  approveBlocker,
  describeDrift,
  isOpenProposal,
  reviewActionsFor,
  targetDrift,
  type ProposalDetail,
  type ProposalHold,
} from "./queueModel";

export type QueuePendingAction = "approve" | "reject" | "revert" | "comment" | "load" | "claim" | "release";

const PENDING_LABEL: Record<QueuePendingAction, string> = {
  approve: "Applying",
  reject: "Rejecting",
  revert: "Reverting",
  comment: "Posting the comment",
  load: "Loading into the editor",
  claim: "Claiming",
  release: "Releasing",
};

const LOAD_DESCRIPTION =
  "Load into editor opens these changes in Substances against the latest content, so a revision can be submitted. The revision replaces this proposal.";

function KeyCap({ children }: { children: string }) {
  return (
    <span aria-hidden className="[@media(pointer:coarse)]:hidden">
      <kbd className="theme-dev-kbd !text-current opacity-70">{children}</kbd>
    </span>
  );
}

export type ProposalPaneProps = {
  proposal: ProposalDetail;
  canApprove: boolean;
  canLoad: boolean;
  headingId: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  position: { index: number; total: number } | null;
  onMove: (direction: 1 | -1) => void;
  onBackToList: () => void;
  onCopyLink: () => void;
  copied: boolean;
  hiddenByList?: ReactNode;
  newerRevision: { id: string; summary: string } | null;
  onOpenProposal: (id: string) => void;
  commentText: string;
  onCommentTextChange: (value: string) => void;
  onComment: () => void;
  commentNotice: NoticeMessage | null;
  onDismissCommentNotice: () => void;
  commentRef?: RefObject<HTMLTextAreaElement | null>;
  rejectNote: string;
  onRejectNoteChange: (value: string) => void;
  rejectRef?: RefObject<HTMLTextAreaElement | null>;
  pending: QueuePendingAction | null;
  busy: boolean;
  frozen: boolean;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
  nextWaiting: { summary: string; onOpen: () => void } | null;
  hold: ProposalHold | null;
  onClaim: () => void;
  onRelease: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRevert: () => void;
  onLoadIntoEditor: () => void;
};

export function ProposalPane(props: ProposalPaneProps) {
  const {
    proposal,
    canApprove,
    canLoad,
    headingId,
    headingRef,
    position,
    onMove,
    onBackToList,
    onCopyLink,
    copied,
    hiddenByList,
    newerRevision,
    onOpenProposal,
    commentText,
    onCommentTextChange,
    onComment,
    commentNotice,
    onDismissCommentNotice,
    commentRef,
    rejectNote,
    onRejectNoteChange,
    rejectRef,
    pending,
    busy,
  } = props;
  const actions = reviewActionsFor(proposal.status);
  const decides = canApprove && (actions.approve || actions.reject);
  const open = isOpenProposal(proposal.status);

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
        aria-label="Previous proposal"
        aria-keyshortcuts="k"
        title="Previous proposal (k)"
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
        aria-label="Next proposal"
        aria-keyshortcuts="j"
        title="Next proposal (j)"
        disabled={position.index >= position.total - 1 || busy}
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
            {proposal.summary || "Untitled proposal"}
          </h3>
          <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={onCopyLink} aria-live="polite">
              <Icon icon={copied ? "lucide:check" : "lucide:link"} size={14} />
              {copied ? "Copied" : "Copy link"}
            </Button>
            <span className="hidden lg:contents">{pager}</span>
          </div>
        </div>

        <div className="theme-text-muted flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
          <span>
            {proposal.isAuthor ? "Your proposal" : <>By <span className="theme-text-secondary font-medium">{proposal.proposerName}</span></>}
          </span>
          <span aria-hidden>·</span>
          <span>
            {open ? "Waiting since " : "Submitted "}
            <ProposalTime iso={proposal.createdAt} />
          </span>
          <EditorStatusPill inline tone={STATUS_PILL_TONE[proposal.status]}>
            {STATUS_LABELS[proposal.status]}
          </EditorStatusPill>
        </div>
        {hiddenByList ? <div className="theme-text-muted text-sm">{hiddenByList}</div> : null}
      </header>

      <div className="space-y-7 px-4 py-5 sm:px-5 [overflow-wrap:anywhere] [&_:is(input,button,textarea,select,a)]:scroll-mb-48 [&_:is(input,button,textarea,select,a)]:scroll-mt-28">
        <div className="space-y-3">
          <ProposalNextStep proposal={proposal} canApprove={canApprove} />
          {proposal.status === "superseded" && newerRevision ? (
            <p className="pl-[1.625rem] text-sm">
              <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => onOpenProposal(newerRevision.id)}>
                Open the newer revision: {newerRevision.summary}
              </Button>
            </p>
          ) : null}
        </div>
        <ProposalFeedback proposal={proposal} />
        <ProposalFacts proposal={proposal} showStatus={false} showProposer={false} />
        <ProposalTargets proposal={proposal} showDrift={false} />
        <ProposalChanges proposal={proposal} />
        <ProposalOtherEditors proposal={proposal} />
        {canLoad && decides ? (
          <section className="space-y-2">
            <h4 className="theme-accent-heading text-sm font-semibold">Revise it yourself</h4>
            <p className="theme-text-secondary max-w-prose text-sm leading-6">{LOAD_DESCRIPTION}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              aria-busy={pending === "load" || undefined}
              onClick={props.onLoadIntoEditor}
            >
              <Icon icon="lucide:file-pen-line" size={14} />
              {pending === "load" ? PENDING_LABEL.load : "Load into editor"}
            </Button>
          </section>
        ) : null}
        <ProposalDiscussion
          proposal={proposal}
          canApprove={canApprove}
          commentText={commentText}
          onCommentTextChange={onCommentTextChange}
          onComment={onComment}
          busy={busy}
          posting={pending === "comment"}
          notice={commentNotice}
          onDismissNotice={onDismissCommentNotice}
          fieldRef={commentRef}
        />
        {canApprove && actions.reject ? (
          <EditorField
            htmlFor={`queue-reject-note-${proposal._id}`}
            label="Rejection note"
            description="Required to reject. The proposer sees it."
          >
            <Textarea
              ref={rejectRef}
              id={`queue-reject-note-${proposal._id}`}
              textareaSize="sm"
              value={rejectNote}
              disabled={busy}
              aria-keyshortcuts="n"
              onChange={(event) => onRejectNoteChange(event.target.value)}
              placeholder="Explain why these changes should not be published."
            />
          </EditorField>
        ) : null}
      </div>

      <DecisionDock {...props} decides={decides} />
    </EditorPanel>
  );
}

function DecisionDock(props: ProposalPaneProps & { decides: boolean }) {
  const {
    proposal,
    canApprove,
    canLoad,
    rejectNote,
    rejectRef,
    pending,
    busy,
    frozen,
    notice,
    onDismissNotice,
    nextWaiting,
    hold,
    decides,
    onApprove,
    onReject,
    onRevert,
    onLoadIntoEditor,
  } = props;
  const actions = reviewActionsFor(proposal.status);
  const revert = canApprove && actions.revert;
  const blocker = actions.approve ? approveBlocker(proposal) : null;
  const drift = actions.approve && !blocker ? describeDrift(targetDrift(proposal)) : null;
  const noteMissing = actions.reject && rejectNote.trim().length === 0;
  const dockLoad = canLoad && !decides;
  const hasDecision = decides || revert || dockLoad;
  const pendingWords = pending && pending !== "comment" ? PENDING_LABEL[pending] : null;
  if (!hasDecision && !notice && !pendingWords && !(frozen && decides)) return null;

  return (
    <footer
      className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      aria-label="Decision"
    >
      {notice ? (
        <Notice placement="inline" tone={notice.tone} title={notice.title} dismiss={onDismissNotice}>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{notice.message}</span>
            {nextWaiting ? (
              <Button type="button" variant="link" size="auto" className="text-sm" disabled={busy} onClick={nextWaiting.onOpen}>
                Next waiting: {nextWaiting.summary}
              </Button>
            ) : null}
          </span>
        </Notice>
      ) : null}
      {pendingWords ? (
        <p className="theme-text-muted flex items-center gap-2 text-sm" role="status" aria-live="polite">
          <Icon icon="lucide:loader-circle" size={14} className="motion-safe:animate-spin" />
          {pendingWords}. Wait for it to finish before picking another proposal.
        </p>
      ) : null}
      {frozen && !notice && hasDecision ? (
        <p className="theme-text-muted flex items-center gap-2 text-xs">
          <Icon icon="lucide:circle-pause" size={13} className="theme-warning-text-strong shrink-0" />
          Writes are paused right now; a decision will not save until they resume.
        </p>
      ) : null}
      {hold && actions.approve ? <HoldLine {...props} hold={hold} /> : null}

      {hasDecision ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Decide">
          {canApprove && actions.approve ? (
            <Button
              type="button"
              size="sm"
              variant="accent"
              disabled={busy || blocker !== null}
              aria-keyshortcuts="a"
              aria-busy={pending === "approve" || undefined}
              aria-describedby={blocker || drift ? `${proposal._id}-approve-why` : undefined}
              onClick={onApprove}
            >
              {pending === "approve" ? PENDING_LABEL.approve : "Approve and apply"}
              {blocker ? null : <KeyCap>a</KeyCap>}
            </Button>
          ) : null}
          {canApprove && actions.reject ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || noteMissing}
              aria-keyshortcuts="r"
              aria-busy={pending === "reject" || undefined}
              aria-describedby={noteMissing ? `${proposal._id}-reject-why` : undefined}
              onClick={onReject}
            >
              {pending === "reject" ? PENDING_LABEL.reject : "Reject"}
              <KeyCap>r</KeyCap>
            </Button>
          ) : null}
          {revert ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="theme-danger-text-strong"
              disabled={busy}
              aria-busy={pending === "revert" || undefined}
              onClick={onRevert}
            >
              <Icon icon="lucide:undo-2" size={14} />
              {pending === "revert" ? PENDING_LABEL.revert : "Revert"}
            </Button>
          ) : null}
          {dockLoad ? (
            <Button
              type="button"
              size="sm"
              variant="accent"
              disabled={busy}
              aria-busy={pending === "load" || undefined}
              aria-describedby={`${proposal._id}-load-why`}
              onClick={onLoadIntoEditor}
            >
              <Icon icon="lucide:file-pen-line" size={14} />
              {pending === "load" ? PENDING_LABEL.load : "Load into editor"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {blocker ? (
        <p id={`${proposal._id}-approve-why`} className="theme-text-muted text-xs">
          {blocker}
        </p>
      ) : drift ? (
        <p id={`${proposal._id}-approve-why`} className="theme-warning-text-strong flex gap-2 text-xs">
          <Icon icon="lucide:triangle-alert" size={13} className="mt-0.5 shrink-0" />
          {drift}
        </p>
      ) : null}
      {canApprove && noteMissing ? (
        <p id={`${proposal._id}-reject-why`} className="theme-text-muted text-xs">
          Reject needs a note the proposer will read.
          {proposal.isAuthor ? " Rejecting your own proposal withdraws it." : null}{" "}
          <Button
            type="button"
            variant="link"
            size="auto"
            className="text-xs"
            onClick={() => {
              rejectRef?.current?.focus();
            }}
          >
            Write the note
          </Button>
        </p>
      ) : null}
      {dockLoad ? (
        <p id={`${proposal._id}-load-why`} className="theme-text-muted text-xs">
          {LOAD_DESCRIPTION}
        </p>
      ) : null}
    </footer>
  );
}

function HoldLine({ hold, busy, pending, onClaim, onRelease }: ProposalPaneProps & { hold: ProposalHold }) {
  let icon = "lucide:user-round";
  let iconClass = "theme-text-faint";
  let sentence: ReactNode;
  let action: { label: string; kind: "claim" | "release"; onClick: () => void } | null = null;
  switch (hold.kind) {
    case "open":
      sentence = "Nobody is reviewing this yet.";
      action = { label: "Claim", kind: "claim", onClick: onClaim };
      break;
    case "mine":
      icon = "lucide:user-round-check";
      iconClass = "theme-icon-accent";
      sentence = <>You are reviewing this{hold.at ? <>, since <ProposalTime iso={hold.at} /></> : null}.</>;
      action = { label: "Release", kind: "release", onClick: onRelease };
      break;
    case "other":
      sentence = (
        <>
          Claimed by {formatReviewerIdentity(hold.by) ?? hold.by}
          {hold.at ? <>, <ProposalTime iso={hold.at} /></> : null}. Claims are advisory; you can still decide.
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
          {pending === action.kind ? PENDING_LABEL[action.kind] : action.label}
        </Button>
      ) : null}
    </div>
  );
}

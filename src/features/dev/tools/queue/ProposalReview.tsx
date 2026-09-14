"use client";

import { ChangelogDiff } from "@/components/changelog/ChangelogDiff";
import { ProseDiff } from "@/components/changelog/ProseDiff";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EditorActionGroup,
  EditorField,
  EditorNotice,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";
import {
  STATUS_LABELS,
  STATUS_PILL_TONE,
  formatProposalDate,
  reviewActionsFor,
  targetDrift,
  type ProposalDetail,
  type ProposalStatus,
} from "./queueModel";

const TARGET_KIND_LABELS: Record<ProposalDetail["targets"][number]["kind"], string> = {
  article: "Article",
  indexLayout: "Index layout",
  about: "About",
  copyBlock: "Copy block",
};

function StatusPill({ status }: { status: ProposalStatus }) {
  return <EditorStatusPill tone={STATUS_PILL_TONE[status]}>{STATUS_LABELS[status]}</EditorStatusPill>;
}

type ProposalReviewProps = {
  proposal: ProposalDetail;
  canApprove: boolean;
  isAuthor: boolean;
  /** The viewer may rebase this proposal (proposer or admin, and it is still open). */
  canLoad: boolean;
  libraryReady: boolean;
  pending: "approve" | "reject" | "revert" | "comment" | "load" | null;
  commentText: string;
  rejectNote: string;
  onCommentTextChange: (value: string) => void;
  onRejectNoteChange: (value: string) => void;
  onComment: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRevert: () => void;
  onLoadIntoEditor: () => void;
  loadLabel?: string;
  loadDescription?: string;
  allowRevert?: boolean;
  readOnly?: boolean;
};

export function ProposalReview({
  proposal,
  canApprove,
  isAuthor,
  canLoad,
  libraryReady,
  pending,
  commentText,
  rejectNote,
  onCommentTextChange,
  onRejectNoteChange,
  onComment,
  onApprove,
  onReject,
  onRevert,
  onLoadIntoEditor,
  loadLabel = "Load into editor",
  loadDescription = "Load these changes into the Substances editor, check them against the latest content, then submit a revision. The new submission replaces this one.",
  allowRevert = true,
  readOnly = false,
}: ProposalReviewProps) {
  const targets = targetDrift(proposal);
  const actions = reviewActionsFor(proposal.status);
  const busy = pending !== null || readOnly;
  const open = proposal.status === "submitted" || proposal.status === "changes_requested";
  const nextStep = {
    submitted: canApprove
      ? isAuthor
        ? "Not published. Another admin must review and approve your submission."
        : "Not published. Review every change below, then approve the whole proposal or reject it with a note."
      : "Not published. An admin will review your submission. You can discuss it here or revise it while you wait.",
    changes_requested: canApprove && !isAuthor
      ? "Not published. The author needs to update this proposal against the latest live content and submit a revision before it can be approved."
      : "Not published. Read the feedback, update your changes against the latest live content, and submit again for review.",
    applied: canApprove
      ? "Published at the time shown below. Revert restores the previous content only if no newer edits have changed these items."
      : "Your changes were published at the time shown below. To make further changes, start a new submission from the relevant editor.",
    rejected: "Not published. This submission is closed. Use the feedback to prepare a new submission in the relevant editor; this one cannot be reopened.",
    superseded: "This submission was replaced by a newer revision. Select that revision in the list to follow its review.",
    reverted: "This publication was undone. Further changes need a new submission from the relevant editor.",
  }[proposal.status];
  const otherEditors = proposal.targets.filter((target) => target.kind === "about" || target.kind === "copyBlock");

  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <p className="theme-text-secondary text-sm leading-6">{nextStep}</p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="theme-text-faint">Status</dt>
        <dd>
          <StatusPill status={proposal.status} />
        </dd>
        <dt className="theme-text-faint">Proposed by</dt>
        <dd className="theme-text-primary">{proposal.proposerName}</dd>
        <dt className="theme-text-faint">Submitted</dt>
        <dd className="theme-text-primary">{formatProposalDate(proposal.createdAt)}</dd>
        {proposal.reviewerName ? (
          <>
            <dt className="theme-text-faint">Reviewed</dt>
            <dd className="theme-text-primary">
              {proposal.reviewerName} · {formatProposalDate(proposal.reviewedAt)}
            </dd>
          </>
        ) : null}
        {proposal.appliedAt ? (
          <>
            <dt className="theme-text-faint">Published</dt>
            <dd className="theme-text-primary">{formatProposalDate(proposal.appliedAt)}</dd>
          </>
        ) : null}
        {proposal.revertedAt ? (
          <>
            <dt className="theme-text-faint">Reverted</dt>
            <dd className="theme-text-primary">{formatProposalDate(proposal.revertedAt)}</dd>
          </>
        ) : null}
      </dl>

      {proposal.reviewNotes ? (
        <section className="space-y-2">
          <h4 className="theme-accent-heading text-sm font-semibold">Review feedback</h4>
          <p className="theme-text-secondary whitespace-pre-line text-sm leading-6">{proposal.reviewNotes}</p>
        </section>
      ) : null}
      {proposal.status === "changes_requested" && proposal.conflictReason ? (
        <EditorNotice notice={{ tone: "warning", title: "Why a revision was requested", message: proposal.conflictReason, live: true }} />
      ) : null}

      {canLoad ? (
          <EditorToolbar label="Revise submission" variant="split">
            <EditorActionGroup label="Revise submission">
              <Button type="button" variant="accent" size="sm" disabled={busy || !libraryReady} onClick={onLoadIntoEditor}>
                {pending === "load" ? "Loading..." : loadLabel}
              </Button>
              <span className="theme-text-faint text-sm">
                {libraryReady
                  ? loadDescription
                  : "Waiting for the substance library to load."}
              </span>
            </EditorActionGroup>
          </EditorToolbar>
      ) : null}
      {otherEditors.length > 0 && (open || proposal.status === "rejected" || proposal.status === "reverted") ? (
        <section className="space-y-3">
          <h4 className="theme-accent-heading text-sm font-semibold">Prepare a new submission</h4>
          <p className="theme-text-secondary text-sm leading-6">
            About and Copy changes cannot be loaded from this view. Open the relevant editor, use the changes and feedback below to update its current content, and submit a new proposal. It will not automatically replace this submission.
          </p>
          <EditorActionGroup label="Open the relevant editor">
            {otherEditors.map((target) => (
              <Button key={`${target.kind}:${target.key}`} asChild variant="outline" size="sm">
                <a href={target.kind === "about"
                  ? viewToPath({ type: "dev", tab: "writing", slug: "about" })
                  : viewToPath({ type: "dev", tab: "copy-studio", slug: target.key })}>
                  {target.kind === "about" ? "Open About editor" : `Open Copy editor: ${target.key}`}
                </a>
              </Button>
            ))}
          </EditorActionGroup>
        </section>
      ) : null}

      <section className="space-y-2">
        <h4 className="theme-accent-heading text-sm font-semibold">Content affected</h4>
        <ul className="space-y-1.5">
          {open ? <li className="theme-text-muted text-sm">Current live content compared with the version recorded at submission:</li> : null}
          {targets.map((target) => (
            <li key={`${target.kind}:${target.key}`} className="flex flex-wrap items-center gap-2 text-sm" data-testid="proposal-target">
              <span className="theme-text-faint">{TARGET_KIND_LABELS[target.kind]}</span>
              <span className="theme-text-primary">{target.key}</span>
              {open ? target.drifted ? (
                <EditorStatusPill tone="caution" icon="lucide:triangle-alert">
                  Currently differs from submission
                </EditorStatusPill>
              ) : (
                <EditorStatusPill tone="success" icon="lucide:check">
                  Currently matches submission
                </EditorStatusPill>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        {proposal.comparisonMode === "unavailable" ? (
          <EditorNotice notice={{
            tone: "warning",
            title: "Historical comparison unavailable",
            message: proposal.comparisonNote ?? "This older submission has no verifiable comparison. Prepare a new submission from the current editor before approval.",
          }} />
        ) : (
          <p className="theme-text-muted text-sm">
            {proposal.comparisonMode === "applied"
              ? "Published changes, compared with the snapshot taken before publication."
              : proposal.comparisonMode === "submitted"
                ? "Submitted changes, captured by the server when this proposal was created."
                : proposal.comparisonMode === "verified_live" ? "Changes compared with the verified submission baseline." : "Recorded change comparison."}
          </p>
        )}
        <h4 className="theme-accent-heading text-sm font-semibold">What changed</h4>
        {proposal.diff.trim() ? /^[-+]\s*(?:"(?:[^"\\]|\\.)+"\s*:|[{}[\]])/m.test(proposal.diff) ? (
          <ChangelogDiff
            markdown={proposal.diff}
            id={`proposal-diff-${proposal._id}`}
            keyPrefix={proposal._id}
            className="rounded-xl border border-dose-border"
          />
        ) : (
          <ProseDiff
            markdown={proposal.diff}
            id={`proposal-diff-${proposal._id}`}
            className="theme-public-card-subtle rounded-xl border px-4 py-3"
          />
        ) : (
          <p className="theme-text-faint text-sm">
            No text comparison is available. Do not approve until the full change can be reviewed.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="theme-accent-heading text-sm font-semibold">Discussion</h4>
        {proposal.comments.length === 0 ? (
          <p className="theme-text-faint text-sm">No comments yet.</p>
        ) : (
          <ol className="space-y-2">
            {proposal.comments.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="border-b border-divider pb-3 text-sm">
                <p className="theme-text-faint text-xs">
                  {entry.authorName} · {formatProposalDate(entry.at)}
                </p>
                <p className="theme-text-secondary mt-1 whitespace-pre-line leading-6">{entry.text}</p>
              </li>
            ))}
          </ol>
        )}
        <EditorField htmlFor="queue-comment" label="Add a comment">
          <Textarea
            id="queue-comment"
            textareaSize="sm"
            value={commentText}
            disabled={busy}
            onChange={(event) => onCommentTextChange(event.target.value)}
            placeholder={canApprove ? "Ask a question or explain what you checked." : "Ask about feedback or explain your changes."}
          />
        </EditorField>
        <Button type="button" variant="outline" size="sm" disabled={busy || commentText.trim().length === 0} onClick={onComment}>
          {pending === "comment" ? "Posting..." : "Post comment"}
        </Button>
      </section>

      {canApprove && (actions.approve || actions.reject || actions.revert) ? (
        <section className="space-y-3">
          <h4 className="theme-accent-heading text-sm font-semibold">Decision</h4>
          {actions.approve && isAuthor ? <p className="theme-text-muted text-sm">Another admin must approve your submission. You cannot approve your own changes.</p> : null}
          {actions.reject ? (
            <EditorField htmlFor="queue-reject-note" label="Rejection note" description="Required to reject. The proposer sees it.">
              <Textarea
                id="queue-reject-note"
                textareaSize="sm"
                value={rejectNote}
                disabled={busy}
                onChange={(event) => onRejectNoteChange(event.target.value)}
                placeholder="Explain why these changes should not be published."
              />
            </EditorField>
          ) : null}
            <EditorToolbar label="Proposal review actions" variant="split">
              <EditorActionGroup label="Review decision">
                {actions.approve ? (
                  <Button type="button" variant="success" disabled={busy || isAuthor || !proposal.diff.trim()} onClick={onApprove}>
                    {pending === "approve" ? "Applying..." : "Approve and apply"}
                  </Button>
                ) : null}
                {actions.reject ? (
                  <Button type="button" variant="destructive" disabled={busy || rejectNote.trim().length === 0} onClick={onReject}>
                    {pending === "reject" ? "Rejecting..." : "Reject"}
                  </Button>
                ) : null}
                {actions.revert && allowRevert ? (
                  <Button type="button" variant="destructive" disabled={busy} onClick={onRevert}>
                    {pending === "revert" ? "Reverting..." : "Revert"}
                  </Button>
                ) : null}
              </EditorActionGroup>
            </EditorToolbar>
        </section>
      ) : null}

    </div>
  );
}

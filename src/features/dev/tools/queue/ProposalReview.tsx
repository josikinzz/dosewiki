"use client";

/**
 * One proposal read for review, in parts: where it stands, the facts, the
 * feedback it came back with, what it changes (with drift against the live
 * content), the diff, the other editors that revise it, and the discussion.
 *
 * Change Review's `ProposalPane` lays the parts out in its triage pane with a
 * decision dock. `ProposalReview` composes the same parts with the decision
 * controls inline for the article page's `ArticleProposalReview`.
 */

import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { ChangelogDiff } from "@/components/changelog/ChangelogDiff";
import { ProseDiff } from "@/components/changelog/ProseDiff";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EditorActionGroup,
  EditorField,
  Notice,
  EditorStatusPill,
  EditorToolbar,
  type NoticeMessage,
} from "@/features/dev/components";
import { describeDay } from "@/features/dev/tools/home/homeModel";
import { feedbackTaskHref } from "@/features/dev/tools/feedback/feedbackTaskLink";
import { viewToPath } from "@/utils/routing";
import { ArticleChangeDiff } from "@/features/article/editing/ArticleChangeDiff";
import { ARTICLE_SECTION_LABELS, isArticleEditorSection } from "@/features/article/editing/articleSections";
import {
  diffWithoutArticles,
  describeDrift,
  STATUS_LABELS,
  STATUS_PILL_TONE,
  TARGET_KIND_LABELS,
  formatProposalDate,
  isOpenProposal,
  nextStepFor,
  reviewActionsFor,
  targetDrift,
  type ProposalDetail,
  type ProposalStatus,
} from "./queueModel";

type SectionHeadingLevel = "h3" | "h4";

function StatusPill({ status, inline = false }: { status: ProposalStatus; inline?: boolean }) {
  return (
    <EditorStatusPill inline={inline} tone={STATUS_PILL_TONE[status]}>
      {STATUS_LABELS[status]}
    </EditorStatusPill>
  );
}

function SectionHeading({ as: Heading = "h4", id, children }: { as?: SectionHeadingLevel; id?: string; children: ReactNode }) {
  return (
    <Heading id={id} className="theme-accent-heading text-sm font-semibold">
      {children}
    </Heading>
  );
}

/** A moment as relative words, with the full date and time as its title. */
export function ProposalTime({ iso, fallback = "unknown date" }: { iso: string | undefined; fallback?: string }) {
  const day = iso ? describeDay(iso) : null;
  if (!iso || !day) return <>{fallback}</>;
  return (
    <time dateTime={iso} title={formatProposalDate(iso)}>
      {day.relative}
    </time>
  );
}

/** Where the proposal stands and what happens next, for this reader. */
export function ProposalNextStep({ proposal, canApprove }: { proposal: ProposalDetail; canApprove: boolean }) {
  const open = isOpenProposal(proposal.status);
  const icon = proposal.status === "applied"
    ? "lucide:circle-check"
    : proposal.status === "changes_requested"
      ? "lucide:undo-2"
      : open
        ? "lucide:hourglass"
        : "lucide:archive";
  return (
    <p className="theme-text-secondary flex gap-2.5 text-sm leading-6">
      <Icon icon={icon} size={16} className="theme-text-faint mt-1 shrink-0" />
      <span>{nextStepFor(proposal.status, { canApprove, isAuthor: proposal.isAuthor })}</span>
    </p>
  );
}

/**
 * The facts of a proposal as a `dl` of meta-label terms over body values:
 * who proposed it and when, who reviewed it, when it was published or
 * reverted, and the reader feedback it answers (advisory only).
 */
export function ProposalFacts({
  proposal,
  showStatus = true,
  showProposer = true,
}: {
  proposal: ProposalDetail;
  /** Off where a header already carries the status pill. */
  showStatus?: boolean;
  /** Off where a header already names the proposer and the age. */
  showProposer?: boolean;
}) {
  const facts: { label: string; value: ReactNode }[] = [];
  if (showStatus) facts.push({ label: "Status", value: <StatusPill status={proposal.status} /> });
  if (showProposer) {
    facts.push({ label: "Proposed by", value: proposal.proposerName });
    facts.push({ label: "Submitted", value: <ProposalTime iso={proposal.createdAt} /> });
  }
  if (proposal.reviewerName) {
    facts.push({
      label: "Reviewed",
      value: (
        <>
          {proposal.reviewerName}, <ProposalTime iso={proposal.reviewedAt} />
        </>
      ),
    });
  }
  if (proposal.appliedAt) facts.push({ label: "Published", value: <ProposalTime iso={proposal.appliedAt} /> });
  if (proposal.revertedAt) facts.push({ label: "Reverted", value: <ProposalTime iso={proposal.revertedAt} /> });
  if (proposal.feedbackRef) {
    const section = isArticleEditorSection(proposal.feedbackRef.section)
      ? ` (${ARTICLE_SECTION_LABELS[proposal.feedbackRef.section]})`
      : "";
    facts.push({
      // Advisory context only: the feedback never gates this review.
      label: "Answers",
      value: (
        <a
          className="text-dose-accent-strong theme-accent-underline underline-offset-4 hover:underline"
          href={feedbackTaskHref({ source: "article", id: proposal.feedbackRef.id })}
        >
          Reader feedback #{proposal.feedbackRef.id.slice(-6)}
          {section}
        </a>
      ),
    });
  }
  if (facts.length === 0) return null;
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-x-6 gap-y-3 text-sm">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0 space-y-0.5">
          <dt className="type-meta-label theme-text-muted">{fact.label}</dt>
          <dd className="theme-text-primary">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What the reviewer said, and why a returned proposal came back. */
export function ProposalFeedback({ proposal, headingLevel = "h4" }: { proposal: ProposalDetail; headingLevel?: SectionHeadingLevel }) {
  const returned = proposal.status === "changes_requested" && proposal.conflictReason;
  if (!proposal.reviewNotes && !returned) return null;
  return (
    <div className="space-y-3">
      {returned ? <Notice tone="warning" title="Why a revision was requested" message={proposal.conflictReason!} /> : null}
      {proposal.reviewNotes ? (
        <section className="space-y-2">
          <SectionHeading as={headingLevel}>Review feedback</SectionHeading>
          <blockquote className="rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-4 py-3">
            <p className="theme-text-primary max-w-prose whitespace-pre-line text-sm leading-6">{proposal.reviewNotes}</p>
            {proposal.reviewerName ? (
              <footer className="theme-text-muted mt-1.5 text-xs">
                {proposal.reviewerName}, <ProposalTime iso={proposal.reviewedAt} />
              </footer>
            ) : null}
          </blockquote>
        </section>
      ) : null}
    </div>
  );
}

/** Each item the proposal changes; on an open proposal, whether the live content still matches it. */
export function ProposalTargets({
  proposal,
  headingLevel = "h4",
  showDrift = true,
}: {
  proposal: ProposalDetail;
  headingLevel?: SectionHeadingLevel;
  /** Off where a decision dock already says what approving a moved proposal does. */
  showDrift?: boolean;
}) {
  const targets = targetDrift(proposal);
  const open = isOpenProposal(proposal.status);
  const drift = showDrift && proposal.status === "submitted" ? describeDrift(targets) : null;
  return (
    <section className="space-y-2">
      <SectionHeading as={headingLevel}>Content affected</SectionHeading>
      {open ? (
        <p className="theme-text-muted text-sm">Current live content compared with the version recorded at submission:</p>
      ) : null}
      <ul className="theme-dev-link-list">
        {targets.map((target) => (
          <li
            key={`${target.kind}:${target.key}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-sm"
            data-testid="proposal-target"
          >
            <span className="min-w-0 flex-1">
              <span className="type-meta-label theme-text-muted mr-2">{TARGET_KIND_LABELS[target.kind]}</span>
              <span className="theme-text-primary font-medium">{target.key}</span>
            </span>
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
      {drift ? <p className="theme-warning-text-strong text-sm">{drift}</p> : null}
    </section>
  );
}

/** The change itself: article fields read as the author saw them, then the text diff of everything else. */
export function ProposalChanges({ proposal, headingLevel = "h4" }: { proposal: ProposalDetail; headingLevel?: SectionHeadingLevel }) {
  const articlePatches = proposal.comparisonMode === "unavailable" ? [] : proposal.articlePatches ?? [];
  // Copy blocks, About and index layouts have no field reading yet and keep
  // the text diff; article sections already shown above are left out of it.
  const otherDiff = diffWithoutArticles(proposal.diff, articlePatches.map((patch) => patch.slug));
  return (
    <section className="space-y-2">
      <SectionHeading as={headingLevel}>What changed</SectionHeading>
      {proposal.comparisonMode === "unavailable" ? (
        <Notice tone="warning" title="Historical comparison unavailable" message={proposal.comparisonNote ?? "This older submission has no verifiable comparison. Prepare a new submission from the current editor before approval."} />
      ) : (
        <p className="theme-text-muted text-sm">
          {proposal.comparisonMode === "applied"
            ? "Published changes, compared with the snapshot taken before publication."
            : proposal.comparisonMode === "submitted"
              ? "Submitted changes, captured by the server when this proposal was created."
              : proposal.comparisonMode === "verified_live" ? "Changes compared with the live article the proposal was written against." : "Recorded change comparison."}
        </p>
      )}
      {/* Article changes read exactly as the author saw them in the page. */}
      {articlePatches.map((patch) => (
        <div key={patch.slug} className="space-y-2" data-testid="proposal-article-changes">
          {proposal.targets.length > 1 ? (
            <p className="theme-text-muted text-sm">
              <span className="type-meta-label mr-2">Article</span>
              {patch.slug}
            </p>
          ) : null}
          <ArticleChangeDiff changes={patch.changes} />
        </div>
      ))}
      {otherDiff.trim() ? /^[-+]\s*(?:"(?:[^"\\]|\\.)+"\s*:|[{}[\]])/m.test(otherDiff) ? (
        <ChangelogDiff
          markdown={otherDiff}
          id={`proposal-diff-${proposal._id}`}
          keyPrefix={proposal._id}
          className="rounded-xl border border-dose-border"
        />
      ) : (
        <ProseDiff
          markdown={otherDiff}
          id={`proposal-diff-${proposal._id}`}
          className="theme-public-card-subtle rounded-xl border px-4 py-3"
        />
      ) : articlePatches.length > 0 ? null : (
        <p className="theme-text-faint text-sm">
          No text comparison is available. Do not approve until the full change can be reviewed.
        </p>
      )}
    </section>
  );
}

/** The About, Copy and Writing targets a proposer revises in their own editors, since they cannot be loaded here. */
export function proposalOtherEditors(proposal: ProposalDetail) {
  const open = isOpenProposal(proposal.status);
  if (!(open || proposal.status === "rejected" || proposal.status === "reverted")) return [];
  return proposal.targets.filter((target) => target.kind === "about" || target.kind === "copyBlock" || target.kind === "writing");
}

export function ProposalOtherEditors({ proposal, headingLevel = "h4" }: { proposal: ProposalDetail; headingLevel?: SectionHeadingLevel }) {
  const otherEditors = proposalOtherEditors(proposal);
  if (otherEditors.length === 0) return null;
  return (
    <section className="space-y-3">
      <SectionHeading as={headingLevel}>Prepare a new submission</SectionHeading>
      <p className="theme-text-secondary max-w-prose text-sm leading-6">
        About, Copy and Writing changes cannot be loaded from this view. Open the relevant editor, use the changes and feedback below to update its current content, and submit a new proposal. It will not automatically replace this submission.
      </p>
      <EditorActionGroup label="Open the relevant editor">
        {otherEditors.map((target) => (
          <Button key={`${target.kind}:${target.key}`} asChild variant="outline" size="sm">
            <a href={target.kind === "about"
              ? viewToPath({ type: "dev", tab: "writing", slug: "about" })
              : target.kind === "writing"
                ? viewToPath({ type: "dev", tab: "writing", slug: target.key })
                : viewToPath({ type: "dev", tab: "copy-studio", slug: target.key })}>
              {target.kind === "about" ? "Open About editor" : target.kind === "writing" ? `Open Writing editor: ${target.key}` : `Open Copy editor: ${target.key}`}
            </a>
          </Button>
        ))}
      </EditorActionGroup>
    </section>
  );
}

export type ProposalDiscussionProps = {
  proposal: ProposalDetail;
  canApprove: boolean;
  commentText: string;
  onCommentTextChange: (value: string) => void;
  onComment: () => void;
  busy: boolean;
  posting: boolean;
  headingLevel?: SectionHeadingLevel;
  /** The result of the last comment, shown under the button that posted it. */
  notice?: NoticeMessage | null;
  onDismissNotice?: () => void;
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
};

/** The conversation on a proposal and the field that adds to it. Cmd/Ctrl+Enter posts. */
export function ProposalDiscussion({
  proposal,
  canApprove,
  commentText,
  onCommentTextChange,
  onComment,
  busy,
  posting,
  headingLevel = "h4",
  notice,
  onDismissNotice,
  fieldRef,
}: ProposalDiscussionProps) {
  const canPost = !busy && commentText.trim().length > 0;
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canPost) {
      event.preventDefault();
      onComment();
    }
  };
  return (
    <section className="space-y-3">
      <SectionHeading as={headingLevel}>
        Discussion
        {proposal.comments.length > 0 ? (
          <span className="theme-text-muted ml-2 font-normal tabular-nums">{proposal.comments.length}</span>
        ) : null}
      </SectionHeading>
      {proposal.comments.length === 0 ? (
        <p className="theme-text-faint text-sm">No comments yet.</p>
      ) : (
        <ol className="theme-dev-link-list">
          {proposal.comments.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="py-3 text-sm">
              <p className="theme-text-muted text-xs">
                <span className="theme-text-secondary font-medium">{entry.authorName}</span>
                {", "}
                <ProposalTime iso={entry.at} />
              </p>
              <p className="theme-text-primary mt-1 max-w-prose whitespace-pre-line leading-6">{entry.text}</p>
            </li>
          ))}
        </ol>
      )}
      <EditorField htmlFor={`queue-comment-${proposal._id}`} label="Add a comment">
        <Textarea
          ref={fieldRef}
          id={`queue-comment-${proposal._id}`}
          textareaSize="sm"
          value={commentText}
          disabled={busy}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          onKeyDown={onKeyDown}
          onChange={(event) => onCommentTextChange(event.target.value)}
          placeholder={canApprove ? "Ask a question or explain what you checked." : "Ask about feedback or explain your changes."}
        />
      </EditorField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={!canPost} aria-busy={posting || undefined} onClick={onComment}>
          {posting ? "Posting" : "Post comment"}
        </Button>
        {notice ? (
          <Notice placement="inline" tone={notice.tone} dismiss={onDismissNotice}>
            {notice.message}
          </Notice>
        ) : null}
      </div>
    </section>
  );
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

/**
 * The whole review in one column with its decisions inline, for the article
 * page's contextual editor. Change Review uses `ProposalPane` instead.
 */
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
  const actions = reviewActionsFor(proposal.status);
  const busy = pending !== null || readOnly;

  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <ProposalNextStep proposal={proposal} canApprove={canApprove} />
      <ProposalFacts proposal={proposal} />
      <ProposalFeedback proposal={proposal} />

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
      <ProposalOtherEditors proposal={proposal} />
      <ProposalTargets proposal={proposal} />
      <ProposalChanges proposal={proposal} />
      <ProposalDiscussion
        proposal={proposal}
        canApprove={canApprove}
        commentText={commentText}
        onCommentTextChange={onCommentTextChange}
        onComment={onComment}
        busy={busy}
        posting={pending === "comment"}
      />

      {canApprove && (actions.approve || actions.reject || actions.revert) ? (
        <section className="space-y-3">
          <h4 className="theme-accent-heading text-sm font-semibold">Decision</h4>
          {actions.approve && isAuthor ? <p className="theme-text-muted text-sm">Another admin must approve your submission. You cannot approve your own changes.</p> : null}
          {actions.reject ? (
            <EditorField htmlFor={`queue-reject-note-${proposal._id}`} label="Rejection note" description="Required to reject. The proposer sees it.">
              <Textarea
                id={`queue-reject-note-${proposal._id}`}
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

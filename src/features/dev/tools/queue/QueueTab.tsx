"use client";

/**
 * Shared master-detail submission view: admins review the global queue;
 * editors follow their own submissions. Server routes enforce that scope.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ChangelogDiff } from "@/components/changelog/ChangelogDiff";
import { ProseDiff } from "@/components/changelog/ProseDiff";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import {
  EditorActionGroup,
  EditorField,
  EditorListItem,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  useConfirm,
  useScrollToDetail,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import type { DevProposalSeed } from "@/features/dev/context/devModeTypes";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import { viewToPath } from "@/utils/routing";
import {
  STATUS_LABELS,
  STATUS_PILL_TONE,
  canLoadIntoEditor,
  formatProposalDate,
  groupProposals,
  proposalSeedOf,
  reviewActionsFor,
  targetDrift,
  type ProposalDetail,
  type ProposalStatus,
  type ProposalSummary,
  type TargetDrift,
} from "./queueModel";
import {
  approveProposal,
  fetchProposal,
  fetchProposals,
  postComment,
  rejectProposal,
  revertProposal,
} from "./queueRequests";

type QueueTabProps = {
  /** Admin: renders approve, reject and revert. Threaded from the shell like ContributorsTab's `canApprove`. */
  canApprove: boolean;
  /** The signed-in email; a proposer may load their own open proposal back into the editor. */
  actorEmail?: string | null;
  /** The substance corpus has drained: a rebase can seed over production rows. */
  libraryReady: boolean;
  /** Seeds the working set from the proposal and opens the editor; the shell composes it from the dev context. */
  onLoadIntoEditor: (seed: DevProposalSeed) => Promise<void>;
};

type DetailState =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; proposal: ProposalDetail }
  | { status: "error"; id: string; message: string };

const TARGET_KIND_LABELS: Record<ProposalDetail["targets"][number]["kind"], string> = {
  article: "Article",
  indexLayout: "Index layout",
  about: "About",
  copyBlock: "Copy block",
};

const targetCount = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

const affectedRows = (targets: readonly TargetDrift[], showChanges = true) =>
  targets.map((target) => `${TARGET_KIND_LABELS[target.kind]} ${target.key}${showChanges && target.drifted ? " (changed since submission)" : ""}`);

export function QueueTab({ canApprove, actorEmail, libraryReady, onLoadIntoEditor }: QueueTabProps) {
  const [proposals, setProposals] = useState<ProposalSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: "idle" });
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [pending, setPending] = useState<"approve" | "reject" | "revert" | "comment" | "load" | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { comment: string; rejection: string }>>({});
  const [listLoading, setListLoading] = useState(true);
  const actionInFlight = useRef(false);
  /** Older requests must never replace the currently selected detail or list. */
  const detailVersion = useRef(0);
  const listVersion = useRef(0);

  const loadList = useCallback(async () => {
    const version = ++listVersion.current;
    setListLoading(true);
    setListError(null);
    try {
      const rows = await fetchProposals();
      if (version === listVersion.current) setProposals(rows);
    } catch (error) {
      if (version === listVersion.current) {
        setListError(error instanceof Error ? error.message : "Unable to load submissions.");
      }
    } finally {
      if (version === listVersion.current) setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const version = ++detailVersion.current;
    setDetail({ status: "loading", id });
    try {
      const proposal = await fetchProposal(id);
      if (version === detailVersion.current) {
        setDetail({ status: "ready", id, proposal });
      }
    } catch (error) {
      if (version === detailVersion.current) {
        setDetail({ status: "error", id, message: error instanceof Error ? error.message : "Unable to load that proposal." });
      }
    }
  }, []);

  useEffect(() => {
    setProposals(null);
    setDetail({ status: "idle" });
    setDrafts({});
    setNotice(null);
    void loadList();
    return () => {
      ++listVersion.current;
      ++detailVersion.current;
    };
  }, [loadList, actorEmail, canApprove]);

  const selectedId = detail.status === "idle" ? null : detail.id;
  const commentText = selectedId ? drafts[selectedId]?.comment ?? "" : "";
  const rejectNote = selectedId ? drafts[selectedId]?.rejection ?? "" : "";
  const updateDraft = (id: string, field: "comment" | "rejection", value: string) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { comment: "", rejection: "" }), [field]: value },
    }));
  };
  // Below the lg split the list stacks above the review pane.
  const detailRef = useRef<HTMLDivElement | null>(null);
  useScrollToDetail(detailRef, selectedId);

  const select = (id: string) => {
    if (id === selectedId || actionInFlight.current) {
      return;
    }
    setNotice(null);
    void loadDetail(id);
  };

  /** Runs one review action against the open proposal, then refetches both panes. */
  const run = async (
    kind: NonNullable<typeof pending>,
    action: (id: string) => Promise<EditorNoticeMessage>,
  ) => {
    if (!selectedId || actionInFlight.current) {
      return;
    }
    actionInFlight.current = true;
    setPending(kind);
    setNotice(null);
    try {
      const outcome = await action(selectedId);
      // Every action can move the row in or out of the submitted bucket the rail counts.
      invalidateDevRailBadge("proposals");
      await Promise.all([loadList(), loadDetail(selectedId)]);
      setNotice(outcome);
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The action did not go through." });
    } finally {
      actionInFlight.current = false;
      setPending(null);
    }
  };

  const approve = () =>
    run("approve", async (id) => {
      const outcome = await approveProposal(id);
      return outcome.status === "applied"
        ? { tone: "success", message: "Approved and published." }
        : {
            tone: "warning",
            title: "Not applied: changes requested",
            message: outcome.conflictReason ?? "The live content changed after submission. Update the proposal against the latest version and submit it again.",
          };
    });

  const reject = () =>
    run("reject", async (id) => {
      await rejectProposal(id, rejectNote.trim());
      updateDraft(id, "rejection", "");
      return { tone: "success", message: "Proposal rejected." };
    });

  const revert = () =>
    run("revert", async (id) => {
      await revertProposal(id);
      return { tone: "success", message: "Reverted. The content from before this proposal was published has been restored." };
    });

  /** Publication and decisions require confirmation naming their exact scope. */
  const { confirm, dialog: confirmDialog } = useConfirm();

  const confirmApprove = () => {
    if (detail.status !== "ready") {
      return;
    }
    const targets = targetDrift(detail.proposal);
    const drifted = targets.filter((target) => target.drifted).length;
    const count = targets.length;
    const driftedShare = `${drifted} ${drifted === 1 ? "has" : "have"}`;
    confirm({
      title: "Apply to production?",
      description:
        drifted > 0
          ? `${targetCount(count)} would change on the public site. ${driftedShare} changed since submission. If the live content still differs, nothing will be published and the proposal will be returned for revision.`
          : `${targetCount(count)} will change on the public site. The server checks every item again before publishing; either all changes are published or none are. Revert is only available while this content remains unchanged.`,
      confirmLabel: "Apply to production",
      affected: affectedRows(targets),
      onConfirm: approve,
    });
  };

  const confirmReject = () => {
    if (detail.status !== "ready") {
      return;
    }
    confirm({
      title: "Reject this proposal?",
      description: `The proposal closes and cannot be reopened; the proposer can only submit a new one. They will see your note: "${rejectNote.trim()}"`,
      confirmLabel: "Reject proposal",
      destructive: true,
      onConfirm: reject,
    });
  };

  const confirmRevert = () => {
    if (detail.status !== "ready") {
      return;
    }
    const targets = targetDrift(detail.proposal);
    const count = targets.length;
    confirm({
      title: "Revert production?",
      description: `${targetCount(count)} will return to the content from before this proposal was published. If any of that content has changed since publication, the server blocks the entire revert. Newer edits will not be overwritten.`,
      confirmLabel: "Revert production",
      destructive: true,
      affected: affectedRows(targets, false),
      onConfirm: revert,
    });
  };

  const comment = () =>
    run("comment", async (id) => {
      await postComment(id, commentText.trim());
      updateDraft(id, "comment", "");
      return { tone: "success", message: "Comment posted." };
    });

  /** Re-read before handing the saved proposal to the substances editor. */
  const loadIntoEditor = async () => {
    if (!selectedId || actionInFlight.current) {
      return;
    }
    actionInFlight.current = true;
    setPending("load");
    setNotice(null);
    try {
      const proposal = await fetchProposal(selectedId);
      if (!canLoadIntoEditor(proposal, { actorEmail, canApprove })) {
        throw new Error(`A ${STATUS_LABELS[proposal.status].toLowerCase()} proposal can no longer be loaded.`);
      }
      await onLoadIntoEditor(proposalSeedOf(proposal));
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The proposal did not load." });
    } finally {
      actionInFlight.current = false;
      setPending(null);
    }
  };

  const groups = groupProposals(proposals ?? []).filter((group) => group.rows.length > 0);
  const firstHistoryGroup = groups.find((group) => group.id === "applied" || group.id === "closed")?.id;
  const pendingCount = proposals?.filter((row) => row.status === "submitted" || row.status === "changes_requested").length ?? 0;

  return (
    <div className="space-y-8">
      <EditorSection
        icon="lucide:git-pull-request"
        title={canApprove ? "Change Review" : "My submissions"}
        description={canApprove
          ? "Review editor submissions, discuss changes, and decide what to publish. Each proposal is published in full or not at all."
          : "Follow your submissions, read feedback, and revise changes before publication. Only your submissions appear here; an admin makes the publication decision."}
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => {
            void loadList();
            if (selectedId) void loadDetail(selectedId);
          }} disabled={listLoading || pending !== null}>
            <Icon icon="lucide:refresh-cw" size={14} />
            {listLoading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      >
        {listError ? (
          <StateCard
            tone="danger"
            icon="lucide:circle-alert"
            title="Submissions could not be refreshed"
            description={listError}
            compact
            actions={
              <Button type="button" variant="accent" size="sm" onClick={() => void loadList()} disabled={listLoading || pending !== null}>
                Try again
              </Button>
            }
          />
        ) : null}
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <EditorSection
          icon="lucide:list"
          title="Submissions"
          description={proposals ? `${pendingCount} awaiting review or revision · ${proposals.length - pendingCount} in history` : listError ? "Not loaded" : "Loading"}
          delay={0.05}
        >
          {proposals === null && !listError ? (
            <EditorStatusPill tone="info" loading live>
              Loading proposals...
            </EditorStatusPill>
          ) : null}
          {proposals && proposals.length === 0 ? (
            <EmptyStateSurface padding="md" radius="lg" className="theme-text-muted space-y-3 text-sm">
              <p className="theme-text-primary font-medium">{canApprove ? "No submissions to review." : "You have not submitted any changes yet."}</p>
              <p>Submit a staged change from an editor to start a review. Nothing is published until an admin approves it.</p>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={viewToPath({ type: "dev", tab: "articles" })}>Open the Substances editor</a>
              </Button>
            </EmptyStateSurface>
          ) : null}
          {proposals && proposals.length > 0 && pendingCount === 0 ? (
            <p className="theme-text-muted text-sm">No submissions are awaiting review or revision.</p>
          ) : null}
          {groups.map((group) => (
            <section key={group.id} aria-label={group.label} data-testid={`queue-group-${group.id}`} className="space-y-2">
              {group.id === firstHistoryGroup ? (
                <h3 className="theme-text-primary border-t border-divider pt-5 text-base font-semibold">History</h3>
              ) : null}
              <h4 className="theme-text-muted flex items-center justify-between text-sm font-medium">
                <span>{group.label}</span>
                <span data-testid={`queue-group-${group.id}-count`}>{group.rows.length}</span>
              </h4>
              {group.rows.map((row) => (
                <EditorListItem
                  key={row._id}
                  active={row._id === selectedId}
                  disabled={pending !== null}
                  onSelect={() => select(row._id)}
                  title={row.summary}
                  subtitle={`${canApprove ? `${row.proposedBy} · ` : ""}${formatProposalDate(row.createdAt)} · ${targetCount(row.targets.length)}${row.commentCount ? ` · ${row.commentCount} ${row.commentCount === 1 ? "comment" : "comments"}` : ""}`}
                  badge={<StatusPill status={row.status} />}
                />
              ))}
            </section>
          ))}
        </EditorSection>

        <div ref={detailRef} className="scroll-mt-6">
        <EditorSection
          icon="lucide:file-search"
          title={canApprove ? "Review" : "Submission details"}
          description={detail.status === "ready" ? detail.proposal.summary : detail.status === "idle" ? "No submission selected" : undefined}
          delay={0.1}
        >
          {notice ? <EditorNotice notice={{ ...notice, live: true }} /> : null}
          {pending ? <p role="status" className="theme-text-muted text-sm">Please wait for this action to finish before selecting another submission.</p> : null}
          {detail.status === "idle" ? (
            <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted text-sm">
              {canApprove ? "Select a submission to inspect its changes and make a decision." : "Select a submission to see its status, feedback, and revision options."}
            </EmptyStateSurface>
          ) : detail.status === "loading" ? (
            <EditorStatusPill tone="info" loading live>
              Loading proposal...
            </EditorStatusPill>
          ) : detail.status === "error" ? (
            <EditorNotice notice={{
              tone: "danger",
              title: "The submission did not load",
              message: detail.message,
              actions: <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => void loadDetail(detail.id)}>Try again</Button>,
            }} />
          ) : (
            <ProposalReview
              proposal={detail.proposal}
              canApprove={canApprove}
              isAuthor={detail.proposal.proposedBy === actorEmail}
              canLoad={canLoadIntoEditor(detail.proposal, { actorEmail, canApprove })}
              libraryReady={libraryReady}
              pending={pending}
              commentText={commentText}
              rejectNote={rejectNote}
              onCommentTextChange={(value) => updateDraft(detail.id, "comment", value)}
              onRejectNoteChange={(value) => updateDraft(detail.id, "rejection", value)}
              onComment={comment}
              onApprove={confirmApprove}
              onReject={confirmReject}
              onRevert={confirmRevert}
              onLoadIntoEditor={() => void loadIntoEditor()}
            />
          )}
        </EditorSection>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}

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
};

function ProposalReview({
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
}: ProposalReviewProps) {
  const targets = targetDrift(proposal);
  const actions = reviewActionsFor(proposal.status);
  const busy = pending !== null;
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
        <dd className="theme-text-primary">{proposal.proposedBy}</dd>
        <dt className="theme-text-faint">Submitted</dt>
        <dd className="theme-text-primary">{formatProposalDate(proposal.createdAt)}</dd>
        {proposal.reviewedBy ? (
          <>
            <dt className="theme-text-faint">Reviewed</dt>
            <dd className="theme-text-primary">
              {proposal.reviewedBy} · {formatProposalDate(proposal.reviewedAt)}
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
                {pending === "load" ? "Loading..." : "Load into editor"}
              </Button>
              <span className="theme-text-faint text-sm">
                {libraryReady
                  ? "Load these changes into the Substances editor, check them against the latest content, then submit a revision. The new submission replaces this one."
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
                  {entry.by} · {formatProposalDate(entry.at)}
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
                {actions.revert ? (
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

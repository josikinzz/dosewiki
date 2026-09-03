"use client";

/**
 * Queue: `/dev/queue`. Every change proposal editors have submitted, grouped
 * by status, with one proposal open for review: its diff, the targets it pins
 * (flagged when production has drifted from them), the discussion, and, for
 * admins, the approve, reject and revert actions that post to the review
 * routes. Editors read and comment; the admin buttons never render for them.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import {
  DiffSurface,
  EditorActionGroup,
  EditorField,
  EditorListItem,
  EditorNotice,
  EditorPanel,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import {
  STATUS_LABELS,
  STATUS_PILL_TONE,
  formatProposalDate,
  groupProposals,
  reviewActionsFor,
  targetDrift,
  type ProposalDetail,
  type ProposalStatus,
  type ProposalSummary,
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

export function QueueTab({ canApprove }: QueueTabProps) {
  const [proposals, setProposals] = useState<ProposalSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: "idle" });
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [pending, setPending] = useState<"approve" | "reject" | "revert" | "comment" | null>(null);
  const [commentText, setCommentText] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  /** The latest detail request; an earlier answer arriving late is dropped. */
  const detailVersion = useRef(0);

  const loadList = useCallback(async () => {
    setListError(null);
    try {
      setProposals(await fetchProposals());
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Unable to load the queue.");
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
    void loadList();
  }, [loadList]);

  const selectedId = detail.status === "idle" ? null : detail.id;

  const select = (id: string) => {
    if (id === selectedId) {
      return;
    }
    setNotice(null);
    setCommentText("");
    setRejectNote("");
    void loadDetail(id);
  };

  /** Runs one review action against the open proposal, then refetches both panes. */
  const run = async (
    kind: NonNullable<typeof pending>,
    action: (id: string) => Promise<EditorNoticeMessage>,
  ) => {
    if (!selectedId || pending) {
      return;
    }
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
      setPending(null);
    }
  };

  const approve = () =>
    run("approve", async (id) => {
      const outcome = await approveProposal(id);
      return outcome.status === "applied"
        ? { tone: "success", message: "Approved and applied to production." }
        : {
            tone: "warning",
            title: "Not applied: changes requested",
            message: outcome.conflictReason ?? "Production moved under this proposal; the proposer needs to rebase it.",
          };
    });

  const reject = () =>
    run("reject", async (id) => {
      await rejectProposal(id, rejectNote.trim());
      setRejectNote("");
      return { tone: "success", message: "Proposal rejected." };
    });

  const revert = () =>
    run("revert", async (id) => {
      await revertProposal(id);
      return { tone: "success", message: "Reverted: production is back to the snapshot taken before apply." };
    });

  const comment = () =>
    run("comment", async (id) => {
      await postComment(id, commentText.trim());
      setCommentText("");
      return { tone: "success", message: "Comment posted." };
    });

  const groups = groupProposals(proposals ?? []);

  return (
    <div className="space-y-8">
      <EditorSection
        icon="lucide:git-pull-request"
        title="Queue"
        description="Staged saves waiting on an admin. Approve applies the proposal to production in one step; production that moved since the proposal was pinned is flagged on each target."
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadList()} disabled={proposals === null && !listError}>
            <Icon icon="lucide:refresh-cw" size={14} />
            Refresh
          </Button>
        }
      >
        {listError ? (
          <StateCard
            tone="danger"
            icon="lucide:circle-alert"
            title="The queue did not load"
            description={listError}
            compact
            actions={
              <Button type="button" variant="accent" size="sm" onClick={() => void loadList()}>
                Try again
              </Button>
            }
          />
        ) : null}
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <EditorSection
          icon="lucide:list"
          title="Proposals"
          description={proposals ? `${proposals.length} loaded` : listError ? "Not loaded" : "Loading"}
          delay={0.05}
        >
          {proposals === null && !listError ? (
            <EditorStatusPill tone="info" loading live>
              Loading proposals...
            </EditorStatusPill>
          ) : null}
          {proposals && proposals.length === 0 ? (
            <EmptyStateSurface padding="md" radius="lg" className="theme-text-muted text-sm">
              Nothing has been proposed yet.
            </EmptyStateSurface>
          ) : null}
          {proposals && proposals.length > 0 ? groups.map((group) => (
            <section key={group.id} aria-label={group.label} data-testid={`queue-group-${group.id}`} className="space-y-2">
              <h3 className="theme-text-faint flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em]">
                <span>{group.label}</span>
                <span data-testid={`queue-group-${group.id}-count`}>{group.rows.length}</span>
              </h3>
              {group.rows.length === 0 ? (
                <p className="theme-text-faint px-3 text-xs">None</p>
              ) : (
                group.rows.map((row) => (
                  <EditorListItem
                    key={row._id}
                    active={row._id === selectedId}
                    onSelect={() => select(row._id)}
                    title={row.summary}
                    subtitle={`${row.proposedBy} · ${formatProposalDate(row.createdAt)}`}
                    badge={<StatusPill status={row.status} />}
                  />
                ))
              )}
            </section>
          )) : null}
        </EditorSection>

        <EditorSection
          icon="lucide:file-search"
          title="Review"
          description={detail.status === "ready" ? detail.proposal.summary : "No proposal selected"}
          delay={0.1}
        >
          {detail.status === "idle" ? (
            <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted text-sm">
              Select a proposal to review.
            </EmptyStateSurface>
          ) : detail.status === "loading" ? (
            <EditorStatusPill tone="info" loading live>
              Loading proposal...
            </EditorStatusPill>
          ) : detail.status === "error" ? (
            <EditorNotice notice={{ tone: "danger", title: "The proposal did not load", message: detail.message }} />
          ) : (
            <ProposalReview
              proposal={detail.proposal}
              canApprove={canApprove}
              pending={pending}
              notice={notice}
              commentText={commentText}
              rejectNote={rejectNote}
              onCommentTextChange={setCommentText}
              onRejectNoteChange={setRejectNote}
              onComment={comment}
              onApprove={approve}
              onReject={reject}
              onRevert={revert}
            />
          )}
        </EditorSection>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ProposalStatus }) {
  return <EditorStatusPill tone={STATUS_PILL_TONE[status]}>{STATUS_LABELS[status]}</EditorStatusPill>;
}

type ProposalReviewProps = {
  proposal: ProposalDetail;
  canApprove: boolean;
  pending: "approve" | "reject" | "revert" | "comment" | null;
  notice: EditorNoticeMessage | null;
  commentText: string;
  rejectNote: string;
  onCommentTextChange: (value: string) => void;
  onRejectNoteChange: (value: string) => void;
  onComment: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRevert: () => void;
};

function ProposalReview({
  proposal,
  canApprove,
  pending,
  notice,
  commentText,
  rejectNote,
  onCommentTextChange,
  onRejectNoteChange,
  onComment,
  onApprove,
  onReject,
  onRevert,
}: ProposalReviewProps) {
  const targets = targetDrift(proposal);
  const actions = reviewActionsFor(proposal.status);
  const busy = pending !== null;

  return (
    <div className="space-y-6">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="theme-text-faint">Status</dt>
        <dd>
          <StatusPill status={proposal.status} />
        </dd>
        <dt className="theme-text-faint">Proposed by</dt>
        <dd className="theme-text-primary">{proposal.proposedBy}</dd>
        <dt className="theme-text-faint">Created</dt>
        <dd className="theme-text-primary">{formatProposalDate(proposal.createdAt)}</dd>
        {proposal.reviewedBy ? (
          <>
            <dt className="theme-text-faint">Reviewed</dt>
            <dd className="theme-text-primary">
              {proposal.reviewedBy} · {formatProposalDate(proposal.reviewedAt)}
              {proposal.reviewNotes ? <span className="theme-text-secondary block whitespace-pre-line">{proposal.reviewNotes}</span> : null}
            </dd>
          </>
        ) : null}
        {proposal.appliedAt ? (
          <>
            <dt className="theme-text-faint">Applied</dt>
            <dd className="theme-text-primary">{formatProposalDate(proposal.appliedAt)}</dd>
          </>
        ) : null}
      </dl>

      {proposal.status === "changes_requested" && proposal.conflictReason ? (
        <EditorNotice notice={{ tone: "warning", title: "Changes requested", message: proposal.conflictReason, live: true }} />
      ) : null}

      <section className="space-y-2">
        <h4 className="theme-accent-heading text-sm font-semibold">Targets</h4>
        <ul className="space-y-1.5">
          {targets.map((target) => (
            <li key={`${target.kind}:${target.key}`} className="flex flex-wrap items-center gap-2 text-sm" data-testid="proposal-target">
              <span className="theme-text-faint">{TARGET_KIND_LABELS[target.kind]}</span>
              <span className="theme-text-primary font-mono text-xs">{target.key}</span>
              {target.drifted ? (
                <EditorStatusPill tone="caution" icon="lucide:triangle-alert">
                  Drifted
                </EditorStatusPill>
              ) : (
                <EditorStatusPill tone="success" icon="lucide:check">
                  Matches production
                </EditorStatusPill>
              )}
            </li>
          ))}
        </ul>
      </section>

      <DiffSurface title="Diff" diffText={proposal.diff} maxHeight={480} emptyText="No diff was stored with this proposal." />

      <section className="space-y-3">
        <h4 className="theme-accent-heading text-sm font-semibold">Discussion</h4>
        {proposal.comments.length === 0 ? (
          <p className="theme-text-faint text-sm">No comments yet.</p>
        ) : (
          <ol className="space-y-2">
            {proposal.comments.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="rounded-xl bg-subtle px-3 py-2 text-sm">
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
            placeholder="A question for the proposer, or what you checked."
          />
        </EditorField>
        <Button type="button" variant="outline" size="sm" disabled={busy || commentText.trim().length === 0} onClick={onComment}>
          {pending === "comment" ? "Posting..." : "Post comment"}
        </Button>
      </section>

      {canApprove ? (
        <div className="space-y-3">
          {actions.reject ? (
            <EditorField htmlFor="queue-reject-note" label="Rejection note" description="Required to reject. The proposer sees it.">
              <Textarea
                id="queue-reject-note"
                textareaSize="sm"
                value={rejectNote}
                disabled={busy}
                onChange={(event) => onRejectNoteChange(event.target.value)}
                placeholder="Why this should not land as proposed."
              />
            </EditorField>
          ) : null}
          <EditorPanel variant="toolbar" className="p-3">
            <EditorToolbar label="Proposal review actions" variant="split">
              <EditorActionGroup label="Review decision">
                {actions.approve ? (
                  <Button type="button" variant="success" disabled={busy} onClick={onApprove}>
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
                {!actions.approve && !actions.reject && !actions.revert ? (
                  <span className="theme-text-faint text-sm">No action applies to a {STATUS_LABELS[proposal.status].toLowerCase()} proposal.</span>
                ) : null}
              </EditorActionGroup>
            </EditorToolbar>
          </EditorPanel>
        </div>
      ) : null}

      {notice ? <EditorNotice notice={notice} /> : null}
    </div>
  );
}

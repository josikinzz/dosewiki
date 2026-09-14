"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorStatusPill, useConfirm } from "@/features/dev/components";
import { ProposalReview } from "@/features/dev/tools/queue/ProposalReview";
import { canLoadIntoEditor, STATUS_LABELS, STATUS_PILL_TONE, type ProposalDetail, type ProposalSummary } from "@/features/dev/tools/queue/queueModel";
import { approveProposal, fetchProposal, postComment, rejectProposal, revertProposal } from "@/features/dev/tools/queue/queueRequests";
import type { SubstanceArticle } from "@/schema";

export function ArticleProposalReview({ proposals, slug, canApprove, blocked, onLoad, onPublished, onBusyChange, onNotesDirty, resetNotesRef }: {
  proposals: ProposalSummary[]; slug: string; canApprove: boolean; blocked: boolean;
  onLoad: (article: Partial<SubstanceArticle>, revisionOf?: string) => Promise<void>;
  onPublished: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onNotesDirty: (dirty: boolean) => void;
  resetNotesRef: React.MutableRefObject<() => void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [pending, setPending] = useState<"approve" | "reject" | "revert" | "comment" | "load" | null>(null);
  const confirmation = useConfirm();
  useEffect(() => { onBusyChange(pending !== null); return () => onBusyChange(false); }, [pending, onBusyChange]);
  useEffect(() => { onNotesDirty(!!comment.trim() || !!note.trim()); return () => onNotesDirty(false); }, [comment, note, onNotesDirty]);
  resetNotesRef.current = () => { setComment(""); setNote(""); };
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setProposal(null); setError(null); setNotice(null); setLoading(true);
    void fetchProposal(selected).then((value) => {
      if (!cancelled) setProposal(value);
    }).catch((failure) => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : "Unable to load that proposal. Refresh to try again.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, refreshEpoch]);
  const run = async (action: NonNullable<typeof pending>, operation: () => Promise<void>) => {
    if (pending || blocked) return;
    setPending(action); setError(null); setNotice(null);
    try { await operation(); if (selected) setProposal(await fetchProposal(selected)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The proposal operation was not confirmed. Refresh its status before retrying."); }
    finally { setPending(null); }
  };
  const article = proposal?.targets.length === 1 && proposal.targets[0].kind === "article" && proposal.targets[0].key === slug && proposal.payload.articles?.length === 1
    ? proposal.payload.articles[0] : proposal?.payload.articles?.find((item) => item.slug === slug);
  const singleArticle = !!article && proposal?.targets.length === 1 && proposal.targets[0].kind === "article";
  const reviewDecision = (action: "approve" | "reject" | "revert") => {
    if (!proposal || !canApprove || blocked || (action === "approve" && proposal.isAuthor)) return;
    confirmation.confirm({
      title: action === "approve" ? "Publish this proposal?" : action === "reject" ? "Reject this proposal?" : "Revert this proposal?",
      description: action === "reject" ? `The proposal closes permanently. The proposer will see this note: ${note.trim()}` : "This affects the live content for every target listed below. The existing proposal workflow rechecks its recorded baseline before applying any change.",
      affected: proposal.targets.map((target) => `${target.kind}: ${target.key}`),
      confirmLabel: action === "approve" ? "Approve and publish" : action === "reject" ? "Reject proposal" : "Revert proposal",
      destructive: action !== "approve",
      onConfirm: () => run(action, async () => {
        if (action === "approve") {
          const result = await approveProposal(proposal._id);
          setNotice(result.status === "applied" ? "Approved and published." : result.conflictReason ?? "Changes requested because the live content changed.");
          if (result.status === "applied") await onPublished();
        } else if (action === "reject") { await rejectProposal(proposal._id, note.trim()); setNote(""); setNotice("Proposal rejected. Its review note is saved."); }
        else { await revertProposal(proposal._id); await onPublished(); setNotice("Proposal reverted."); }
      }),
    });
  };
  return <section className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
    <div className="flex min-w-0 items-center gap-2">
      <h3 className="theme-text-primary min-w-0 font-semibold">Submitted proposals</h3>
      {selected && <Button type="button" variant="iconGhost" size="sm" className={`w-8 shrink-0 p-0 ${TOUCH_ICON}`} aria-label="Refresh proposal status" title="Refresh proposal status" disabled={!!pending || loading} onClick={() => setRefreshEpoch((value) => value + 1)}>
        <Icon icon="lucide:refresh-cw" size={16} aria-hidden />
      </Button>}
    </div>
    <p className="theme-text-muted text-sm">Review uses the existing proposal workflow. Own submissions cannot be self-approved; rejected submissions stay closed.</p>
    {proposals.length === 0 && <p className="theme-text-muted text-sm">No recent proposals for this article.</p>}
    <div className="grid min-w-0 gap-1">{proposals.map((item) => <Button
      key={item._id} variant={selected === item._id ? "secondary" : "ghost"} size="sm"
      className="h-auto min-h-8 w-full min-w-0 flex-wrap justify-start whitespace-normal px-2 py-1.5 text-left"
      aria-pressed={selected === item._id}
      disabled={!!pending || !!comment.trim() || !!note.trim()}
      onClick={() => { setSelected(item._id); setComment(""); setNote(""); }}
    >
      <span className="min-w-0 flex-1 basis-48">{item.summary || item.proposerName}</span>
      <EditorStatusPill tone={STATUS_PILL_TONE[item.status]}>{STATUS_LABELS[item.status]}</EditorStatusPill>
    </Button>)}</div>
    {loading && <p role="status" className="theme-text-muted text-sm">Loading proposal…</p>}
    {blocked && <p className="theme-text-muted text-sm">Save or discard local article edits before reviewing a proposal decision or loading a revision.</p>}
    {error && <p role="alert" className="theme-text-primary text-sm">{error}</p>}
    {notice && <p role="status" className="theme-text-primary text-sm">{notice}</p>}
    {proposal && <h4 className="theme-text-primary font-semibold">{proposal.summary || proposal.proposerName}</h4>}
    {proposal && <ProposalReview
      proposal={proposal} canApprove={canApprove && !blocked} isAuthor={proposal.isAuthor}
      canLoad={singleArticle && canLoadIntoEditor(proposal, { canApprove })} libraryReady={!blocked}
      pending={pending} commentText={comment} rejectNote={note} onCommentTextChange={setComment} onRejectNoteChange={setNote}
      onComment={() => { void run("comment", async () => { await postComment(proposal._id, comment.trim()); setComment(""); }); }}
      onApprove={() => reviewDecision("approve")} onReject={() => reviewDecision("reject")} onRevert={() => reviewDecision("revert")}
      onLoadIntoEditor={() => { if (article) void run("load", () => onLoad(article, proposal._id)); }}
      loadLabel="Revise in this article" loadDescription="Load this proposal over the latest article, review its changes, then submit a revision. No content is published by loading it."
      allowRevert={false}
      readOnly={blocked}
    />}
    {proposal && singleArticle && (proposal.isAuthor || canApprove) && (proposal.status === "rejected" || proposal.status === "reverted") && <Button variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-left" disabled={blocked || !!pending} onClick={() => { if (article) void run("load", () => onLoad(article)); }}>Prepare a new submission from this feedback</Button>}
    {confirmation.dialog}
  </section>;
}

"use client";

/**
 * Change Review (`/dev/queue`): admins review every editor proposal and sign
 * off review recommendations; editors follow their own proposals. Server
 * routes enforce that scope, the admin floor and the revision checks; this
 * tab asks before every decision and says what each will do.
 *
 * Layout: the triage workspace. The proposals list (grouped by what each
 * waits on) sits left and sticky, the open proposal docks right with a
 * decision dock. Admins get a second, kept-mounted view for review
 * recommendations (`#recommendations`, or a `?recommendation=` task link).
 */

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import {
  EditorNavTabs,
  EditorPanel,
  LoadErrorState,
  Notice,
  useConfirm,
  useDevShortcuts,
  useScrollToDetail,
  useTriageShortcuts,
  useWriteFreeze,
  type NoticeMessage,
} from "@/features/dev/components";
import type { DevProposalSeed } from "@/features/dev/context/devModeTypes";
import { DevRailBadgeFreshness } from "@/features/dev/pages/DevRailBadgeFreshness";
import { invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import { MISSING_TASK_TITLE } from "@/features/dev/tools/missingTask";
import type { AppRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { viewToPath } from "@/utils/routing";

import { ProposalListColumn, type QueueEmpty } from "./ProposalListColumn";
import { ProposalPane, type QueuePendingAction } from "./ProposalPane";
import { ReviewRecommendationsLane } from "./ReviewRecommendationsLane";
import {
  STATUS_LABELS,
  TARGET_KIND_LABELS,
  approveBlocker,
  canLoadIntoEditor,
  describeQueueCount,
  groupProposals,
  proposalHoldOf,
  proposalMatches,
  proposalSeedOf,
  reviewActionsFor,
  targetDrift,
  type ProposalClaim,
  type ProposalDetail,
  type ProposalSummary,
  type TargetDrift,
} from "./queueModel";
import {
  QUEUE_FREEZE_COPY,
  approveProposal,
  fetchProposal,
  fetchProposalClaims,
  fetchProposals,
  isMissingRecord,
  isWriteFreezeError,
  postComment,
  rejectProposal,
  revertProposal,
  writeProposalClaim,
} from "./queueRequests";
import {
  isMyPendingProposal,
  proposalTaskHref,
  readQueueTaskParams,
  type QueueView,
} from "./queueTaskLink";

type QueueTabProps = {
  viewerRole: AppRole | null;
  /** Admin: renders approve, reject and revert. Threaded from the shell like ContributorsTab's `canApprove`. */
  canApprove: boolean;
  /** Seeds the working set from the proposal and opens the editor; the shell composes it from the dev context. */
  onLoadIntoEditor: (seed: DevProposalSeed) => Promise<void>;
  /** The proposal a deep link opens on. */
  initialProposalId?: string;
  /** The signed-in address, so the hold line can tell your claim from another admin's. */
  actorEmail?: string | null;
};

type DetailState =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; proposal: ProposalDetail }
  | { status: "error"; id: string; message: string; missing: boolean };

/** A result kept with the proposal it came from, so it never shows on another. */
type ScopedNotice = NoticeMessage & { id: string };

type QueueSection = "proposals" | "recommendations";

const targetCount = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

const affectedRows = (targets: readonly TargetDrift[], showChanges = true) =>
  targets.map((target) => `${TARGET_KIND_LABELS[target.kind]} ${target.key}${showChanges && target.drifted ? " (changed since submission)" : ""}`);

const SHORTCUTS = [{ keys: "/", label: "Search proposals" }];

export function QueueTab({ viewerRole, canApprove, onLoadIntoEditor, initialProposalId, actorEmail = null }: QueueTabProps) {
  const [proposals, setProposals] = useState<ProposalSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: "idle" });
  const [notice, setNotice] = useState<ScopedNotice | null>(null);
  const [commentNotice, setCommentNotice] = useState<ScopedNotice | null>(null);
  const [pending, setPending] = useState<QueuePendingAction | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { comment: string; rejection: string }>>({});
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState("");
  /** Claims from the Inbox's claim table; null until read, and after a failed read. */
  const [claims, setClaims] = useState<Map<string, ProposalClaim> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [copied, setCopied] = useState(false);
  const [readyCount, setReadyCount] = useState<number | null>(null);
  // The address carries the saved view and a linked recommendation; read once, before first render.
  const [fromUrl] = useState(() =>
    typeof window === "undefined" ? { view: null, recommendation: null } : readQueueTaskParams(window.location.search),
  );
  const [view, setView] = useState<QueueView | null>(fromUrl.view);
  const [section, setSection] = useState<QueueSection>(
    canApprove && fromUrl.recommendation ? "recommendations" : "proposals",
  );
  const { frozen } = useWriteFreeze();
  const actionInFlight = useRef(false);
  /** Older requests must never replace the currently selected detail or list. */
  const detailVersion = useRef(0);
  const listVersion = useRef(0);
  const baseId = useId();
  const listHeadingId = `${baseId}-list`;
  const paneHeadingId = `${baseId}-pane`;
  const searchId = `${baseId}-search`;
  const listRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const rejectRef = useRef<HTMLTextAreaElement | null>(null);
  const commentRef = useRef<HTMLTextAreaElement | null>(null);

  // `#recommendations` opens that view; the address keeps the view as it changes.
  useEffect(() => {
    if (canApprove && window.location.hash === "#recommendations") setSection("recommendations");
  }, [canApprove]);

  const changeSection = (next: QueueSection) => {
    setSection(next);
    const { pathname, search: query } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${query}${next === "recommendations" ? "#recommendations" : ""}`);
  };

  const loadClaims = useCallback(async () => {
    if (!canApprove) return;
    try {
      setClaims(await fetchProposalClaims());
    } catch {
      setClaims(null);
    }
  }, [canApprove]);

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
    setDetail((current) => (current.status === "ready" && current.id === id ? current : { status: "loading", id }));
    try {
      const proposal = await fetchProposal(id);
      if (version === detailVersion.current) {
        setDetail({ status: "ready", id, proposal });
      }
    } catch (error) {
      if (version === detailVersion.current) {
        setDetail({
          status: "error",
          id,
          message: error instanceof Error ? error.message : "Unable to load that proposal.",
          missing: isMissingRecord(error),
        });
      }
    }
  }, []);

  // A deep link (`/dev/queue/<id>`, as the Inbox opens it) selects its
  // proposal once; a later role change starts clean like any other reload.
  const initialIdRef = useRef(initialProposalId);

  useEffect(() => {
    setProposals(null);
    setDetail({ status: "idle" });
    setDrafts({});
    setNotice(null);
    setCommentNotice(null);
    void loadList();
    void loadClaims();
    // Consumed once its read settles, not when it starts: React's development
    // mode runs this effect twice, and the second run must open it again.
    const initialId = initialIdRef.current;
    if (initialId) {
      void loadDetail(initialId).then(() => {
        if (initialIdRef.current === initialId) initialIdRef.current = undefined;
      });
    }
    return () => {
      ++listVersion.current;
      ++detailVersion.current;
    };
  }, [loadList, loadDetail, loadClaims, canApprove]);

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
  const detailRef = useRef<HTMLElement | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useScrollToDetail(detailRef, picked);

  // My pending proposals lists exactly the rows its count counts, from the same list read.
  const myPending = useMemo(() => (proposals ?? []).filter(isMyPendingProposal), [proposals]);
  const matching = useMemo(
    () => (view === "mine" ? myPending : proposals ?? []).filter((row) => proposalMatches(row, search)),
    [view, myPending, proposals, search],
  );
  const groups = groupProposals(matching).filter((group) => group.rows.length > 0);
  const ordered = groups.flatMap((group) => group.rows);
  const selectedIndex = selectedId ? ordered.findIndex((row) => row._id === selectedId) : -1;
  const busy = pending !== null;

  const select = (id: string) => {
    if (id === selectedId || actionInFlight.current) {
      return;
    }
    setCopied(false);
    setPicked(id);
    // The address is the task link, so a reload or a copied link opens this proposal.
    window.history.replaceState(window.history.state, "", proposalTaskHref(id, view));
    void loadDetail(id);
  };

  const move = (direction: 1 | -1) => {
    if (ordered.length === 0 || actionInFlight.current) return;
    const next = selectedIndex < 0 ? (direction === 1 ? 0 : ordered.length - 1) : selectedIndex + direction;
    const target = ordered[Math.max(0, Math.min(ordered.length - 1, next))];
    if (target) select(target._id);
  };

  const changeView = (next: QueueView | null) => {
    setView(next);
    window.history.replaceState(window.history.state, "", proposalTaskHref(selectedId, next));
  };

  const showEverything = () => {
    changeView(null);
    setSearch("");
  };

  const backToList = () => {
    listRef.current?.scrollIntoView({ block: "start" });
    listRef.current?.querySelector<HTMLElement>("button[aria-pressed='true'], button[aria-pressed]")?.focus({ preventScroll: true });
  };

  const refresh = () => {
    void loadList();
    void loadClaims();
    if (selectedId) void loadDetail(selectedId);
  };

  const failureMessage = (error: unknown, fallback: string) =>
    isWriteFreezeError(error) || frozen ? QUEUE_FREEZE_COPY : error instanceof Error ? error.message : fallback;

  /** Runs one review action against the open proposal, then refetches both panes. */
  const run = async (
    kind: "approve" | "reject" | "revert",
    action: (id: string) => Promise<NoticeMessage>,
  ) => {
    if (!selectedId || actionInFlight.current) {
      return;
    }
    const id = selectedId;
    actionInFlight.current = true;
    setPending(kind);
    setNotice(null);
    try {
      const outcome = await action(id);
      // Every action can move the row in or out of the submitted bucket the rail counts.
      invalidateDevRailBadge("proposals");
      await Promise.all([loadList(), loadDetail(id), loadClaims()]);
      setNotice({ ...outcome, id });
    } catch (error) {
      // The result lands in the dock, where the decision was made.
      const message = failureMessage(error, "The action did not go through.");
      setNotice({ tone: "danger", message, id });
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
    if (detail.status !== "ready" || actionInFlight.current) {
      return;
    }
    const proposal = detail.proposal;
    // The same refusals the button shows; a key press never gets past them.
    if (!reviewActionsFor(proposal.status).approve || approveBlocker(proposal)) return;
    const targets = targetDrift(proposal);
    const drifted = targets.filter((target) => target.drifted).length;
    const count = targets.length;
    const driftedShare = `${drifted} ${drifted === 1 ? "has" : "have"}`;
    const lead = `“${proposal.summary || "Untitled proposal"}” by ${proposal.proposerName}. `;
    confirm({
      title: "Apply to production?",
      description:
        lead + (drifted > 0
          ? `${targetCount(count)} would change on the public site. ${driftedShare} changed since submission. If the live content still differs, nothing will be published and the proposal will be returned for revision.`
          : `${targetCount(count)} will change on the public site. The server checks every item again before publishing; either all changes are published or none are. Revert is only available while this content remains unchanged.`),
      confirmLabel: "Apply to production",
      affected: affectedRows(targets),
      affectedLabel: `Publishes ${targetCount(count)}`,
      onConfirm: approve,
    });
  };

  const confirmReject = () => {
    if (detail.status !== "ready" || actionInFlight.current) {
      return;
    }
    const proposal = detail.proposal;
    if (!reviewActionsFor(proposal.status).reject) return;
    if (!rejectNote.trim()) {
      // A rejection always explains itself: send the reviewer to the note.
      rejectRef.current?.focus();
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
    if (detail.status !== "ready" || actionInFlight.current) {
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

  const comment = async () => {
    if (!selectedId || actionInFlight.current || !commentText.trim()) {
      return;
    }
    const id = selectedId;
    actionInFlight.current = true;
    setPending("comment");
    setCommentNotice(null);
    try {
      await postComment(id, commentText.trim());
      updateDraft(id, "comment", "");
      await Promise.all([loadList(), loadDetail(id)]);
      setCommentNotice({ tone: "success", message: "Comment posted.", id });
    } catch (error) {
      setCommentNotice({ tone: "danger", message: failureMessage(error, "The comment did not post."), id });
    } finally {
      actionInFlight.current = false;
      setPending(null);
    }
  };

  /** Claims and releases are advisory, so they are announced rather than shown as a result. */
  const hold = async (action: "claim" | "release") => {
    if (!selectedId || actionInFlight.current) return;
    const id = selectedId;
    actionInFlight.current = true;
    setPending(action);
    setNotice(null);
    try {
      const claim = await writeProposalClaim(id, action);
      setClaims((current) => {
        const next = new Map(current ?? []);
        if (claim) next.set(id, claim);
        else next.delete(id);
        return next;
      });
      setAnnouncement(action === "claim" ? "Claimed. Other admins see that you are reviewing it." : "Released. Anyone can pick it up.");
    } catch (error) {
      setNotice({ tone: "danger", message: failureMessage(error, "The claim did not change."), id });
      void loadClaims();
    } finally {
      actionInFlight.current = false;
      setPending(null);
    }
  };

  /** Re-read before handing the saved proposal to the substances editor. */
  const loadIntoEditor = async () => {
    if (!selectedId || actionInFlight.current) {
      return;
    }
    const id = selectedId;
    actionInFlight.current = true;
    setPending("load");
    setNotice(null);
    try {
      const proposal = await fetchProposal(id, { includePayload: true });
      if (!canLoadIntoEditor(proposal, { canApprove })) {
        throw new Error(`A ${STATUS_LABELS[proposal.status].toLowerCase()} proposal can no longer be loaded.`);
      }
      await onLoadIntoEditor(proposalSeedOf(proposal));
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The proposal did not load.", id });
    } finally {
      actionInFlight.current = false;
      setPending(null);
    }
  };

  const copyLink = async () => {
    if (!selectedId) return;
    try {
      await navigator.clipboard.writeText(new URL(proposalTaskHref(selectedId), window.location.origin).toString());
      setCopied(true);
    } catch {
      setAnnouncement("Could not copy the link. Copy it from the address bar.");
    }
  };

  const ready = detail.status === "ready" ? detail.proposal : null;
  const readyActions = ready ? reviewActionsFor(ready.status) : null;
  const proposalsVisible = section === "proposals";

  const { helpDialog } = useTriageShortcuts({
    onMove: move,
    ...(canApprove
      ? {
          onAccept: () => {
            if (readyActions?.approve) confirmApprove();
          },
          onReject: () => {
            if (readyActions?.reject) confirmReject();
          },
        }
      : {}),
    onNote: () => {
      const field = canApprove && readyActions?.reject ? rejectRef.current : commentRef.current;
      field?.focus();
    },
    labels: {
      move: "Next and previous proposal",
      accept: "Approve and apply (asks first)",
      reject: "Reject (asks first; needs the note)",
      note: canApprove ? "Write the rejection note, or a comment" : "Write a comment",
    },
    enabled: proposalsVisible,
  });
  useDevShortcuts(SHORTCUTS, proposalsVisible);
  useEffect(() => {
    if (!proposalsVisible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='combobox']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proposalsVisible]);

  const holdOf = (row: Pick<ProposalSummary, "_id" | "status">) =>
    canApprove && row.status === "submitted" ? proposalHoldOf(claims?.get(row._id), actorEmail, claims !== null) : null;

  let empty: QueueEmpty | null = null;
  if (proposals && groups.length === 0) {
    if (search.trim()) {
      const elsewhere = view === "mine" ? (proposals ?? []).filter((row) => proposalMatches(row, search)).length : 0;
      empty = { kind: "search", query: search, elsewhere };
    } else if (view === "mine") empty = { kind: "mine" };
    else empty = { kind: "none" };
  }
  const pendingCount = proposals?.filter((row) => row.status === "submitted" || row.status === "changes_requested").length ?? 0;
  const allClear = proposals !== null && proposals.length > 0 && pendingCount === 0 && view !== "mine" && !search.trim();

  const countLine = proposals
    ? search.trim() || view === "mine"
      ? `${matching.length} of ${proposals.length} shown`
      : describeQueueCount(proposals)
    : listError
      ? "Not loaded"
      : "Loading";

  const nextWaiting = (() => {
    // Only after a decision went through: a refusal keeps the reviewer on this one.
    if (!notice || notice.tone === "danger" || !selectedId) return null;
    const next = ordered.find((row) => row._id !== selectedId && row.status === "submitted");
    return next ? { summary: next.summary || "Untitled proposal", onOpen: () => select(next._id) } : null;
  })();

  const newerRevision = ready?.status === "superseded"
    ? (proposals ?? []).find((row) => row.revisionOf === ready._id) ?? null
    : null;

  const tabOptions = [
    {
      value: "proposals",
      label: proposals ? <>Proposals<span className="sr-only">{`, ${pendingCount} open`}</span></> : "Proposals",
      controls: `${baseId}-proposals`,
      ...(proposals ? { badge: <span aria-hidden>{pendingCount}</span> } : {}),
    },
    {
      value: "recommendations",
      label: readyCount !== null ? <>Recommendations<span className="sr-only">{`, ${readyCount} ready`}</span></> : "Recommendations",
      controls: `${baseId}-recommendations`,
      ...(readyCount !== null ? { badge: <span aria-hidden>{readyCount}</span> } : {}),
    },
  ];

  const paneVisible = detail.status !== "idle";
  // The idle hint only helps when there is something to pick.
  const idleHint = !paneVisible && ordered.length > 0;

  return (
    <div className="space-y-6">
      <DevToolSection
        tool="queue"
        viewerRole={viewerRole}
        description={canApprove
          ? "Editor proposals wait here until an admin publishes or rejects them; each is published in full or not at all."
          : "Your proposals and what happened to them. An admin decides what is published; you can discuss and revise here."}
      >
        {canApprove ? (
          <EditorNavTabs
            label="Change Review views"
            value={section}
            onChange={(value) => changeSection(value as QueueSection)}
            options={tabOptions}
          />
        ) : null}
      </DevToolSection>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {canApprove ? (
        <div id={`${baseId}-recommendations`} role="tabpanel" aria-label="Recommendations" hidden={section !== "recommendations"}>
          {/* Editors recommend sign-offs from /review; approving them is admin work. */}
          <ReviewRecommendationsLane linkedSlug={fromUrl.recommendation} onReadyCountChange={setReadyCount} />
        </div>
      ) : null}

      <div
        id={`${baseId}-proposals`}
        role={canApprove ? "tabpanel" : undefined}
        aria-label={canApprove ? "Proposals" : undefined}
        hidden={section !== "proposals"}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
          <ProposalListColumn
            listRef={listRef}
            headingId={listHeadingId}
            canApprove={canApprove}
            countLine={countLine}
            refreshing={listLoading && proposals !== null}
            onRefresh={refresh}
            busy={busy}
            view={view}
            myPendingCount={proposals ? myPending.length : null}
            onViewChange={changeView}
            searchId={searchId}
            searchRef={searchRef}
            search={search}
            onSearchChange={setSearch}
            loaded={proposals !== null}
            groups={groups}
            selectedId={selectedId}
            onSelect={select}
            holdOf={holdOf}
            empty={empty}
            onShowEverything={showEverything}
            onClearSearch={() => setSearch("")}
            onward={
              <Button asChild variant="outline" size="sm">
                <a href={viewToPath({ type: "dev", tab: "articles" })}>Open the Substances editor</a>
              </Button>
            }
            error={
              listError ? (
                <LoadErrorState
                  what="proposals"
                  message={proposals ? `${listError} The list below is from the last successful read.` : listError}
                  onRetry={() => void loadList()}
                  busy={listLoading}
                />
              ) : null
            }
            freshness={
              <>
                {allClear ? (
                  <p className="theme-text-secondary flex items-center gap-2 text-sm">
                    <Icon icon="lucide:circle-check" size={16} className="theme-icon-accent shrink-0" />
                    All clear. No proposal is waiting on review or revision.
                  </p>
                ) : null}
                <DevRailBadgeFreshness badge="proposals" noun="submissions" />
              </>
            }
          />

          <section
            ref={detailRef}
            aria-label={ready ? `Review: ${ready.summary}` : canApprove ? "Review" : "Submission details"}
            className={cn("min-w-0 scroll-mt-24", !paneVisible && (idleHint ? "hidden lg:block" : "hidden"))}
          >
            {detail.status === "idle" ? (
              <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted text-sm">
                {canApprove ? "Pick a proposal to read its changes and decide on it here" : "Pick a proposal to see where it stands, the feedback and how to revise it"}
                <span className="[@media(pointer:coarse)]:hidden">
                  , or press <kbd className="theme-dev-kbd">j</kbd> to start at the top
                </span>
                .
              </EmptyStateSurface>
            ) : detail.status === "loading" ? (
              <PaneSkeleton />
            ) : detail.status === "error" && detail.missing ? (
              <Notice tone="warning" title={MISSING_TASK_TITLE} message="The link names a proposal that was removed, or one your role cannot open. Nothing else was selected in its place." />
            ) : detail.status === "error" ? (
              <LoadErrorState what="this proposal" message={detail.message} onRetry={() => void loadDetail(detail.id)} busy={busy} />
            ) : (
              <ProposalPane
                key={detail.id}
                proposal={detail.proposal}
                canApprove={canApprove}
                canLoad={canLoadIntoEditor(detail.proposal, { canApprove })}
                headingId={paneHeadingId}
                position={selectedIndex >= 0 ? { index: selectedIndex, total: ordered.length } : null}
                onMove={move}
                onBackToList={backToList}
                onCopyLink={() => void copyLink()}
                copied={copied}
                hiddenByList={
                  proposals && selectedIndex < 0 ? (
                    <>
                      Your view or search hides this proposal from the list.{" "}
                      <Button type="button" variant="link" size="auto" className="text-sm" onClick={showEverything}>
                        Show everything
                      </Button>
                    </>
                  ) : null
                }
                newerRevision={newerRevision ? { id: newerRevision._id, summary: newerRevision.summary } : null}
                onOpenProposal={select}
                commentText={commentText}
                onCommentTextChange={(value) => updateDraft(detail.id, "comment", value)}
                onComment={() => void comment()}
                commentNotice={commentNotice?.id === detail.id ? commentNotice : null}
                onDismissCommentNotice={() => setCommentNotice(null)}
                commentRef={commentRef}
                rejectNote={rejectNote}
                onRejectNoteChange={(value) => updateDraft(detail.id, "rejection", value)}
                rejectRef={rejectRef}
                pending={pending}
                busy={busy}
                frozen={frozen}
                notice={notice?.id === detail.id ? notice : null}
                onDismissNotice={() => setNotice(null)}
                nextWaiting={nextWaiting}
                hold={holdOf(detail.proposal)}
                onClaim={() => void hold("claim")}
                onRelease={() => void hold("release")}
                onApprove={confirmApprove}
                onReject={confirmReject}
                onRevert={confirmRevert}
                onLoadIntoEditor={() => void loadIntoEditor()}
              />
            )}
          </section>
        </div>
      </div>
      {confirmDialog}
      {helpDialog}
    </div>
  );
}

function PaneSkeleton() {
  return (
    <EditorPanel>
      <div aria-busy="true" className="space-y-4 px-5 py-5">
        <span className="sr-only">Loading proposal</span>
        <span aria-hidden className="theme-skeleton-pulse block h-6 w-3/5 rounded-chip" />
        <span aria-hidden className="theme-skeleton-pulse block h-3.5 w-2/5 rounded-chip" />
        <span aria-hidden className="theme-skeleton-pulse block h-24 w-full rounded-card" />
        <span aria-hidden className="theme-skeleton-pulse block h-40 w-full rounded-card" />
      </div>
    </EditorPanel>
  );
}

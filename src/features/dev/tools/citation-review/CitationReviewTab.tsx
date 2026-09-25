import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StateCard } from "@/components/common/StateCard";
import { Icon } from "@/components/common/Icon";
import { SmartLink } from "@/components/common/SmartLink";
import {
  EditorNotice,
  LoadErrorState,
  useConfirm,
  useScrollToDetail,
  useTriageShortcuts,
} from "@/features/dev/components";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import { DevRailBadgeFreshness } from "@/features/dev/pages/DevRailBadgeFreshness";
import { useDevMode } from "../../context/DevModeContext";
import { EditorCitationDiagnosticsPanel } from "../../forms/EditorCitationDiagnosticsPanel";
import {
  CITATION_QUEUE_FILTER_LABEL,
  CITATION_QUEUE_LOAD_CAUSE_LABEL,
  buildCitationReviewChecklist,
  buildCitationReviewCommands,
  formatCitationCount,
  formatCitationSectionLabel,
  groupCitationEvidenceBySection,
  type CitationReviewQueueLoadFailure,
} from "./citationReviewModels";
import {
  CitationOpenInReview,
  CitationQueueHeader,
  CitationQueuePanel,
  citationQueueMatches,
} from "./CitationQueuePanel";
import { CitationEvidenceSection } from "./CitationEvidencePanels";
import {
  CitationBulkApprovePanel,
  CitationChecklistPanel,
  CitationSelectedSummary,
  type CitationEvidenceDecisionHandlers,
  type CitationRejectRequest,
  type CitationUndoOffer,
} from "./CitationReviewPanels";
import { useCitationReviewData } from "./useCitationReviewData";
import { resolveEditorArticleSlug } from "../../context/devModeUtils";

type CitationReviewTabProps = {
  initialSlug?: string;
};

/** One sentence the reviewer can act on or report: what failed, and the id to quote. */
function formatQueueLoadFailure(failure: CitationReviewQueueLoadFailure): string {
  const parts = [failure.error];
  if (failure.cause) {
    parts.push(`${CITATION_QUEUE_LOAD_CAUSE_LABEL[failure.cause]}.`);
  }
  if (failure.requestId) {
    parts.push(`Request ${failure.requestId}.`);
  }
  parts.push("The Review portal still works while the queue is down.");
  return parts.join(" ");
}

export function CitationReviewTab({ initialSlug }: CitationReviewTabProps) {
  const { articles, articleHydration } = useDevMode();
  const { allSubstanceRecords } = useLibrary();
  const {
    queue,
    queueFilter,
    setQueueFilter,
    queueError,
    initialLoading,
    refreshing,
    selectedSlug,
    setSelectedSlug,
    selectedSummary,
    rows,
    detailError,
    isDetailLoading,
    actionError,
    pendingClaimKeys,
    isBulkUpdating,
    undoableDecision,
    undoLastDecision,
    dismissUndo,
    refreshQueue,
    updateStatuses,
  } = useCitationReviewData(initialSlug);
  const { confirm, dialog } = useConfirm();

  const articleBySlug = useMemo(() => {
    const lookup = new Map<string, (typeof articles)[number]>();
    for (const article of articles) {
      const articleSlug = resolveEditorArticleSlug(article);
      if (articleSlug) {
        lookup.set(articleSlug, article);
      }
    }
    return lookup;
  }, [articles]);

  const articleTitleBySlug = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const record of allSubstanceRecords) {
      lookup.set(record.slug, record.name);
    }
    for (const article of articles) {
      const articleSlug = resolveEditorArticleSlug(article);
      if (!articleSlug) {
        continue;
      }
      lookup.set(articleSlug, article.title || article.identification.common_name || articleSlug);
    }
    return lookup;
  }, [allSubstanceRecords, articles]);

  // Library rows carry no article body, so the checklist and the diagnostics
  // panel below have to wait for the whole article rather than read an empty
  // one and report every section as missing.
  const { isArticleHydrated, requestArticle } = articleHydration;
  useEffect(() => {
    requestArticle(selectedSlug);
  }, [requestArticle, selectedSlug]);

  const selectedArticle =
    selectedSlug && isArticleHydrated(selectedSlug)
      ? articleBySlug.get(selectedSlug) ?? null
      : null;
  const checklist = useMemo(
    () => buildCitationReviewChecklist(selectedArticle, rows),
    [rows, selectedArticle],
  );
  const sectionGroups = useMemo(() => groupCitationEvidenceBySection(rows), [rows]);
  const commands = useMemo(
    () => buildCitationReviewCommands({ rows, pendingClaimKeys, isBulkUpdating }),
    [isBulkUpdating, pendingClaimKeys, rows],
  );
  const articleTitle = selectedSlug ? articleTitleBySlug.get(selectedSlug) ?? selectedSlug : null;

  // Below the lg split the queue stacks above the detail column, so selecting
  // an article would otherwise give no visible feedback. Keyed on the tapped
  // row, not `selectedSlug`, so the first-row fallback after a queue load or
  // filter change does not move the page.
  const detailColumnRef = useRef<HTMLDivElement | null>(null);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  useScrollToDetail(detailColumnRef, pickedSlug);
  const handleSelectSlug = useCallback(
    (slug: string) => {
      setSelectedSlug(slug);
      setPickedSlug(slug);
    },
    [setSelectedSlug],
  );

  // Rows opened in this session, per article. The section and article-wide
  // approvals unlock only once every ready row they would approve is opened.
  const [opened, setOpened] = useState<{ slug: string | null; claimKeys: ReadonlySet<string> }>({
    slug: null,
    claimKeys: new Set(),
  });
  const openedClaimKeys = useMemo<ReadonlySet<string>>(
    () => (opened.slug === selectedSlug ? opened.claimKeys : new Set()),
    [opened, selectedSlug],
  );
  const openedReadyCount = commands.bulkApprove.claimKeys.filter((claimKey) =>
    openedClaimKeys.has(claimKey),
  ).length;

  // Where a multi-row approval came from, so its undo renders in that place:
  // a section id, or "article" for the article-wide approval.
  const [bulkOrigin, setBulkOrigin] = useState<string | null>(null);

  const confirmApproval = useCallback(
    (claimKeys: string[], scope: string, origin: string) => {
      const wanted = new Set(claimKeys);
      const countBySection = new Map<string, number>();
      for (const row of rows) {
        if (wanted.has(row.claimKey)) {
          countBySection.set(row.section, (countBySection.get(row.section) ?? 0) + 1);
        }
      }
      const affected = [...countBySection.entries()].map(
        ([section, count]) => `${formatCitationSectionLabel(section)}: ${formatCitationCount(count, "row")}`,
      );

      confirm({
        title: `Approve ${formatCitationCount(claimKeys.length, "ready row")} ${scope}?`,
        description:
          "Each approved row becomes part of the public article's evidence. Rows without a verified quote and rejected rows are left alone. You can undo until your next decision.",
        confirmLabel: `Approve ${formatCitationCount(claimKeys.length, "row")}`,
        affected,
        onConfirm: () => {
          setBulkOrigin(origin);
          return updateStatuses(claimKeys, "approved");
        },
      });
    },
    [confirm, rows, updateStatuses],
  );

  // The evidence row the triage keys act on: the one opened last, while it stays open.
  const [activeClaim, setActiveClaim] = useState<{ slug: string | null; claimKey: string } | null>(null);
  const activeClaimKey = activeClaim && activeClaim.slug === selectedSlug ? activeClaim.claimKey : null;
  const [rejectRequest, setRejectRequest] = useState<CitationRejectRequest | null>(null);
  const [keyHint, setKeyHint] = useState<string | null>(null);

  const handlers = useMemo<CitationEvidenceDecisionHandlers>(
    () => ({
      onApprove: (claimKeys) => {
        void updateStatuses(claimKeys, "approved");
      },
      onReject: (claimKey, statusReason) => {
        void updateStatuses([claimKey], "rejected", statusReason);
      },
      onRowExpanded: (claimKey) => {
        setActiveClaim({ slug: selectedSlug, claimKey });
        setKeyHint(null);
        setOpened((current) => {
          const base = current.slug === selectedSlug ? current.claimKeys : new Set<string>();
          if (base.has(claimKey)) {
            return current;
          }
          return { slug: selectedSlug, claimKeys: new Set([...base, claimKey]) };
        });
      },
      onRowCollapsed: (claimKey) => {
        setActiveClaim((current) => (current?.claimKey === claimKey ? null : current));
      },
    }),
    [selectedSlug, updateStatuses],
  );

  const undoOffer = useMemo<CitationUndoOffer | null>(
    () =>
      undoableDecision
        ? {
            decision: undoableDecision,
            disabled: isBulkUpdating || pendingClaimKeys.length > 0,
            onUndo: () => {
              void undoLastDecision();
            },
            onKeep: dismissUndo,
          }
        : null,
    [dismissUndo, isBulkUpdating, pendingClaimKeys.length, undoLastDecision, undoableDecision],
  );
  // The undo renders beside what it changed: inside the row for a single-row
  // decision, in the section or the article-wide panel for a set. A decision
  // that drained its article out of the queue falls back to a notice here.
  const undoOnScreen = undoOffer && undoOffer.decision.slug === selectedSlug ? undoOffer : null;
  const isSingleRowUndo = undoOnScreen !== null && undoOnScreen.decision.prior.length === 1;
  const rowUndo = isSingleRowUndo ? undoOnScreen : null;
  const setUndo = undoOnScreen && !isSingleRowUndo ? undoOnScreen : null;

  const [queueQuery, setQueueQuery] = useState("");
  const visibleQueue = useMemo(
    () => queue.filter((entry) => citationQueueMatches(entry, queueQuery, articleTitleBySlug)),
    [articleTitleBySlug, queue, queueQuery],
  );

  const OPEN_A_ROW_HINT = "Open an evidence row first: a approves it, r rejects it with a reason.";
  const { helpDialog } = useTriageShortcuts({
    enabled: !initialLoading && queue.length > 0,
    onMove: (direction) => {
      const index = visibleQueue.findIndex((entry) => entry.slug === selectedSlug);
      const next = index < 0 ? visibleQueue[0] : visibleQueue[index + direction];
      if (next) {
        setKeyHint(null);
        setSelectedSlug(next.slug);
      }
    },
    onAccept: () => {
      if (!activeClaimKey) {
        setKeyHint(OPEN_A_ROW_HINT);
        return;
      }
      const command = commands.rows[activeClaimKey];
      if (command && !command.approveDisabled) {
        setKeyHint(null);
        handlers.onApprove([activeClaimKey]);
      }
    },
    onReject: () => {
      if (!activeClaimKey) {
        setKeyHint(OPEN_A_ROW_HINT);
        return;
      }
      if (commands.rows[activeClaimKey]?.rejectDisabled === false) {
        setKeyHint(null);
        setRejectRequest((current) => ({ claimKey: activeClaimKey, nonce: (current?.nonce ?? 0) + 1 }));
      }
    },
    onUndo: () => {
      if (undoOffer && !undoOffer.disabled) undoOffer.onUndo();
    },
    labels: { accept: "Approve the open evidence row", reject: "Reject the open evidence row" },
  });

  if (initialLoading) {
    return (
      <div className="mt-6">
        <StateCard loading compact title="Loading review queue" />
      </div>
    );
  }

  if (queueError && queue.length === 0) {
    return (
      <div className="mt-6">
        <LoadErrorState
          message={formatQueueLoadFailure(queueError)}
          onRetry={() => {
            void refreshQueue();
          }}
          secondary={(
            <Button asChild variant="quiet" size="quiet">
              <SmartLink href="/review">
                Open Review portal
                <Icon icon="lucide:arrow-up-right" size={14} />
              </SmartLink>
            </Button>
          )}
        />
      </div>
    );
  }

  const queueHeader = (
    <>
      <CitationQueueHeader
        queue={queue}
        queueFilter={queueFilter}
        onQueueFilterChange={setQueueFilter}
        refreshing={refreshing}
        onRefreshQueue={() => {
          void refreshQueue();
        }}
      />
      <DevRailBadgeFreshness badge="citations" noun="articles" />
    </>
  );

  if (queue.length === 0) {
    return (
      <div className="mt-6 space-y-8">
        {queueHeader}
        <StateCard
          badge="Citation Review"
          title="No evidence rows match this filter"
          description={`No articles have evidence rows matching the ${CITATION_QUEUE_FILTER_LABEL[queueFilter].toLowerCase()} filter. Switch the queue filter to revisit other rows.`}
          icon={queueFilter === "open" ? "lucide:badge-check" : "lucide:filter"}
          tone={queueFilter === "open" ? "success" : "neutral"}
        />
      </div>
    );
  }

  const offscreenUndo = undoOffer && !undoOnScreen ? undoOffer : null;
  const offscreenUndoCount = offscreenUndo?.decision.prior.length ?? 0;

  return (
    <div className="mt-6 space-y-8">
      {queueHeader}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
        <CitationQueuePanel
          queue={visibleQueue}
          selectedSlug={selectedSlug}
          articleTitleBySlug={articleTitleBySlug}
          onSelectSlug={handleSelectSlug}
          query={queueQuery}
          onQueryChange={setQueueQuery}
        />

        <div ref={detailColumnRef} className="scroll-mt-6 space-y-8">
          {selectedSummary ? (
            <div className="space-y-2">
              <CitationSelectedSummary selectedSummary={selectedSummary} articleTitle={articleTitle} />
              <div className="flex justify-end">
                <CitationOpenInReview slug={selectedSummary.slug} />
              </div>
            </div>
          ) : null}

          {keyHint ? (
            <EditorNotice notice={{ tone: "info", title: "Nothing to act on yet", message: keyHint, live: true }} />
          ) : null}

          <CitationChecklistPanel checklist={checklist} />

          {selectedArticle ? <EditorCitationDiagnosticsPanel article={selectedArticle} /> : null}

          {queueError ? (
            <EditorNotice
              notice={{
                tone: "danger",
                title: "Queue refresh failed",
                message: formatQueueLoadFailure(queueError),
                live: true,
              }}
            />
          ) : null}

          {actionError ? (
            <EditorNotice
              notice={{
                tone: "danger",
                title: "Citation action failed",
                message: actionError,
                live: true,
              }}
            />
          ) : null}

          {offscreenUndo ? (
            <EditorNotice
              notice={{
                tone: "success",
                title: `${offscreenUndo.decision.status === "approved" ? "Approved" : "Rejected"} ${formatCitationCount(offscreenUndoCount, "row")} in ${articleTitleBySlug.get(offscreenUndo.decision.slug) ?? offscreenUndo.decision.slug}`,
                message: "Saved to the live article. Undo puts each row back the way it was and reopens that article.",
                live: true,
                actions: (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offscreenUndo.disabled}
                      onClick={offscreenUndo.onUndo}
                    >
                      <Icon icon="lucide:undo-2" size={16} />
                      Undo
                    </Button>
                    <Button variant="quiet" size="quiet" onClick={offscreenUndo.onKeep}>
                      Keep
                    </Button>
                  </>
                ),
              }}
            />
          ) : null}

          {detailError ? (
            <StateCard
              badge="Citation Review"
              badgeVariant="destructive"
              title="Evidence detail unavailable"
              description={detailError}
              icon="lucide:file-warning"
              tone="danger"
              align="left"
            />
          ) : null}

          {isDetailLoading ? (
            <StateCard loading compact title="Loading evidence detail" />
          ) : null}

          {!isDetailLoading
            ? sectionGroups.map((group) => (
                <CitationEvidenceSection
                  key={group.section}
                  group={group}
                  commands={commands}
                  handlers={handlers}
                  openedClaimKeys={openedClaimKeys}
                  rowUndo={rowUndo}
                  rejectRequest={rejectRequest}
                  sectionUndo={setUndo && bulkOrigin === group.section ? setUndo : null}
                  onApproveSection={(section, claimKeys) => {
                    confirmApproval(claimKeys, `in ${formatCitationSectionLabel(section)}`, section);
                  }}
                />
              ))
            : null}

          {!isDetailLoading && !detailError && selectedSlug && sectionGroups.length === 0 ? (
            <p className="text-sm theme-text-muted">No evidence rows for this article yet.</p>
          ) : null}

          {!isDetailLoading && sectionGroups.length > 0 ? (
            <CitationBulkApprovePanel
              command={commands.bulkApprove}
              openedCount={openedReadyCount}
              undo={setUndo && bulkOrigin !== null && sectionGroups.every((group) => group.section !== bulkOrigin) ? setUndo : null}
              onApproveAll={(claimKeys) => {
                confirmApproval(claimKeys, `for ${articleTitle ?? "this article"}`, "article");
              }}
            />
          ) : null}
        </div>
      </div>

      {dialog}
      {helpDialog}
    </div>
  );
}

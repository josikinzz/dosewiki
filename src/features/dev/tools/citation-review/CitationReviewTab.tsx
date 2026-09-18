import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StateCard } from "@/components/common/StateCard";
import { Icon } from "@/components/common/Icon";
import {
  EditorNotice,
  LoadErrorState,
  useConfirm,
  useScrollToDetail,
} from "@/features/dev/components";
import { useLibrary } from "@/data/SubstanceIndexProvider";
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
import { CitationQueueHeader, CitationQueuePanel } from "./CitationQueuePanel";
import { CitationEvidenceSection } from "./CitationEvidencePanels";
import {
  CitationBulkApprovePanel,
  CitationChecklistPanel,
  CitationSelectedSummary,
  type CitationEvidenceDecisionHandlers,
} from "./CitationReviewPanels";
import { useCitationReviewData } from "./useCitationReviewData";
import { slugify } from "@/utils/slug";

type CitationReviewTabProps = {
  initialSlug?: string;
};

function resolveArticleSlug(article: {
  title?: string;
  identification?: { common_name?: string };
  slug?: string;
}) {
  const explicitSlug = typeof article.slug === "string" ? article.slug.trim() : "";
  return explicitSlug || slugify(article.identification?.common_name || article.title || "");
}

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
    isQueueLoading,
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
      const articleSlug = resolveArticleSlug(article);
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
      const articleSlug = resolveArticleSlug(article);
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

  // The article-wide approval unlocks only after a row of this article has
  // been opened in this session, so a quote has been on screen.
  const [readSlug, setReadSlug] = useState<string | null>(null);
  const hasReadRow = readSlug !== null && readSlug === selectedSlug;

  const confirmApproval = useCallback(
    (claimKeys: string[], scope: string) => {
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
          "Each approved row becomes part of the public article's evidence. Rows without a verified quote and rejected rows are left alone. You can undo for a few seconds after it lands.",
        confirmLabel: `Approve ${formatCitationCount(claimKeys.length, "row")}`,
        affected,
        onConfirm: () => updateStatuses(claimKeys, "approved"),
      });
    },
    [confirm, rows, updateStatuses],
  );

  const handlers = useMemo<CitationEvidenceDecisionHandlers>(
    () => ({
      onApprove: (claimKeys) => {
        void updateStatuses(claimKeys, "approved");
      },
      onReject: (claimKey, statusReason) => {
        void updateStatuses([claimKey], "rejected", statusReason);
      },
      onRowExpanded: () => {
        setReadSlug(selectedSlug);
      },
    }),
    [selectedSlug, updateStatuses],
  );

  if (isQueueLoading) {
    return (
      <div className="mt-6">
        <StateCard loading compact title="Loading review queue" />
      </div>
    );
  }

  if (queueError) {
    return (
      <div className="mt-6">
        <LoadErrorState
          message={formatQueueLoadFailure(queueError)}
          onRetry={() => {
            void refreshQueue();
          }}
          secondary={(
            <Button asChild variant="quiet" size="quiet">
              <a href="/review">
                Open Review portal
                <Icon icon="lucide:arrow-up-right" size={14} />
              </a>
            </Button>
          )}
        />
      </div>
    );
  }

  const queueHeader = (
    <CitationQueueHeader
      queue={queue}
      queueFilter={queueFilter}
      onQueueFilterChange={setQueueFilter}
      onRefreshQueue={() => {
        void refreshQueue();
      }}
    />
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

  const undoCount = undoableDecision?.prior.length ?? 0;

  return (
    <div className="mt-6 space-y-8">
      {queueHeader}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
        <CitationQueuePanel
          queue={queue}
          selectedSlug={selectedSlug}
          articleTitleBySlug={articleTitleBySlug}
          onSelectSlug={handleSelectSlug}
        />

        <div ref={detailColumnRef} className="scroll-mt-6 space-y-8">
          {selectedSummary ? (
            <CitationSelectedSummary selectedSummary={selectedSummary} articleTitle={articleTitle} />
          ) : null}

          <CitationChecklistPanel checklist={checklist} />

          {selectedArticle ? <EditorCitationDiagnosticsPanel article={selectedArticle} /> : null}

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

          {undoableDecision ? (
            <EditorNotice
              notice={{
                tone: "success",
                title: `${undoableDecision.status === "approved" ? "Approved" : "Rejected"} ${formatCitationCount(undoCount, "row")}`,
                message: "Saved to the live article. Undo puts each row back the way it was.",
                live: true,
                actions: (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBulkUpdating || pendingClaimKeys.length > 0}
                      onClick={() => {
                        void undoLastDecision();
                      }}
                    >
                      <Icon icon="lucide:undo-2" size={16} />
                      Undo
                    </Button>
                    <Button variant="quiet" size="quiet" onClick={dismissUndo}>
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
                  onApproveSection={(section, claimKeys) => {
                    confirmApproval(claimKeys, `in ${formatCitationSectionLabel(section)}`);
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
              hasReadRow={hasReadRow}
              onApproveAll={(claimKeys) => {
                confirmApproval(claimKeys, `for ${articleTitle ?? "this article"}`);
              }}
            />
          ) : null}
        </div>
      </div>

      {dialog}
    </div>
  );
}

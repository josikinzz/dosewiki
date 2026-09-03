import { useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { StateCard } from "@/components/common/StateCard";
import { Icon } from "@/components/common/Icon";
import { EditorNotice } from "@/features/dev/components";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import { useDevMode } from "../../context/DevModeContext";
import { EditorCitationDiagnosticsPanel } from "../../forms/EditorCitationDiagnosticsPanel";
import {
  CITATION_QUEUE_FILTER_LABEL,
  buildCitationReviewChecklist,
  buildCitationReviewCommands,
  groupCitationEvidenceBySection,
} from "./citationReviewModels";
import { CitationQueueHeader, CitationQueuePanel } from "./CitationQueuePanel";
import {
  CitationChecklistPanel,
  CitationEvidenceSection,
  CitationSelectedSummary,
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
    refreshQueue,
    updateStatuses,
  } = useCitationReviewData(initialSlug);

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

  const detailColumnRef = useRef<HTMLDivElement | null>(null);
  const handleSelectSlug = useCallback(
    (slug: string) => {
      setSelectedSlug(slug);
      // Below the lg split the queue stacks above the detail column, so
      // selecting an article would otherwise give no visible feedback.
      if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
        requestAnimationFrame(() => {
          detailColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    },
    [setSelectedSlug],
  );

  if (isQueueLoading) {
    return (
      <div className="mt-6">
        <StateCard
          badge="Citation Review"
          title="Loading review queue"
          description="Fetching protected citation evidence and reviewer state."
          icon="lucide:list-checks"
          loading
        />
      </div>
    );
  }

  if (queueError) {
    return (
      <div className="mt-6">
        <StateCard
          badge="Citation Review"
          badgeVariant="destructive"
          title="Review queue unavailable"
          description={queueError}
          icon="lucide:shield-alert"
          tone="danger"
          align="left"
          actions={(
            <Button
              variant="outline"
              size="pill"
              className="rounded-full"
              onClick={() => {
                void refreshQueue();
              }}
            >
              <Icon icon="lucide:refresh-cw" size={16} />
              Retry
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
            <CitationSelectedSummary
              selectedSummary={selectedSummary}
              articleTitle={articleTitle}
              command={commands.bulkApprove}
              onUpdateStatuses={(claimKeys, status) => {
                void updateStatuses(claimKeys, status);
              }}
            />
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
            <StateCard
              badge="Citation Review"
              title="Loading evidence detail"
              description="Fetching protected evidence rows for the selected article."
              icon="lucide:file-search"
              loading
            />
          ) : null}

          {!isDetailLoading
            ? sectionGroups.map((group) => (
                <CitationEvidenceSection
                  key={group.section}
                  group={group}
                  commands={commands}
                  onUpdateStatuses={(claimKeys, status) => {
                    void updateStatuses(claimKeys, status);
                  }}
                />
              ))
            : null}

          {!isDetailLoading && !detailError && selectedSlug && sectionGroups.length === 0 ? (
            <p className="text-sm theme-text-muted">No evidence rows for this article yet.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

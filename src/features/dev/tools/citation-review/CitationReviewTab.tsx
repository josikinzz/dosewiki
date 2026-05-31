import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/common/SectionCard";
import { StateCard } from "@/components/common/StateCard";
import { Icon } from "@/components/common/Icon";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import { useDevMode } from "../../context/DevModeContext";
import { EditorCitationDiagnosticsPanel } from "../../forms/EditorCitationDiagnosticsPanel";
import {
  buildCitationReviewChecklist,
  buildCitationReviewCommands,
  groupCitationEvidenceBySection,
} from "./citationReviewModels";
import {
  CitationChecklistPanel,
  CitationEvidenceSection,
  CitationQueueHeader,
  CitationQueuePanel,
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
  const { articles } = useDevMode();
  const { allSubstanceRecords } = useLibrary();
  const {
    queue,
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

  const selectedArticle = selectedSlug ? articleBySlug.get(selectedSlug) ?? null : null;
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

  if (queue.length === 0) {
    return (
      <div className="mt-6">
        <StateCard
          badge="Citation Review"
          title="No citation review rows"
          description="Protected citation evidence exists, but there are no review rows queued right now."
          icon="lucide:badge-check"
          tone="success"
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <CitationQueueHeader
        queue={queue}
        onRefreshQueue={() => {
          void refreshQueue();
        }}
      />

      <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <CitationQueuePanel
          queue={queue}
          selectedSlug={selectedSlug}
          articleTitleBySlug={articleTitleBySlug}
          onSelectSlug={setSelectedSlug}
        />

        <div className="space-y-6">
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
            <SectionCard delay={0.25}>
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                {actionError}
              </div>
            </SectionCard>
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
        </div>
      </div>
    </div>
  );
}

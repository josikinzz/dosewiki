import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/common/SectionCard";
import { StateCard } from "@/components/common/StateCard";
import { Icon } from "@/components/common/Icon";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import { useDevMode } from "../../context/DevModeContext";
import { EditorCitationDiagnosticsPanel } from "../../forms/EditorCitationDiagnosticsPanel";
import {
  buildCitationReviewChecklist,
  canApproveCitationEvidence,
  CITATION_SEVERITY_META,
  CITATION_STATUS_META,
  formatCitationSectionLabel,
  groupCitationEvidenceBySection,
} from "./citationReviewModels";
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

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "No review activity yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
  const articleTitle = selectedSlug ? articleTitleBySlug.get(selectedSlug) ?? selectedSlug : null;
  const readyClaimKeys = rows.filter((row) => row.status === "supported" && canApproveCitationEvidence(row)).map((row) => row.claimKey);

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
      <SectionCard delay={0.05}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-fuchsia-200">
              <Icon icon="lucide:list-checks" size={20} className="text-fuchsia-300" />
              Citation review queue
            </h2>
            <p className="mt-1 text-sm text-white/55">
              Evidence snippets, gap states, and reviewer decisions stay inside protected `/dev` routes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{queue.length} articles</Badge>
            <Badge variant="secondary">
              {queue.reduce((total, entry) => total + entry.supportedCount, 0)} ready approvals
            </Badge>
            <Badge variant="secondary">
              {queue.reduce(
                (total, entry) =>
                  total +
                  entry.blockingNeedsSourceCount +
                  entry.blockingNeedsReviewCount +
                  entry.blockingRejectedCount,
                0,
              )}{" "}
              blocking gaps
            </Badge>
            <Button
              variant="outline"
              size="pill"
              className="rounded-full"
              onClick={() => {
                void refreshQueue();
              }}
            >
              <Icon icon="lucide:refresh-cw" size={16} />
              Refresh queue
            </Button>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <SectionCard delay={0.1} className="h-fit">
          <div className="space-y-3">
            {queue.map((entry) => {
              const unresolvedBlocking =
                entry.blockingNeedsSourceCount +
                entry.blockingNeedsReviewCount +
                entry.blockingRejectedCount;
              return (
                <button
                  key={entry.slug}
                  type="button"
                  onClick={() => setSelectedSlug(entry.slug)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    selectedSlug === entry.slug
                      ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white/85">
                        {articleTitleBySlug.get(entry.slug) ?? entry.slug}
                      </p>
                      <p className="mt-1 text-xs text-white/45">{entry.slug}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {unresolvedBlocking > 0 ? (
                        <Badge variant="destructive">{unresolvedBlocking} blocking</Badge>
                      ) : null}
                      {entry.supportedCount > 0 ? (
                        <Badge variant="secondary">{entry.supportedCount} ready</Badge>
                      ) : null}
                      {entry.approvedCount > 0 ? (
                        <Badge variant="success">{entry.approvedCount} approved</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-white/55 sm:grid-cols-2">
                    <span>{entry.totalRows} total rows</span>
                    <span>{entry.sectionIds.length} sections</span>
                    <span>{entry.needsSourceCount} need source</span>
                    <span>{entry.needsReviewCount} need review</span>
                  </div>
                  <p className="mt-3 text-xs text-white/40">Updated {formatUpdatedAt(entry.updatedAt)}</p>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <div className="space-y-6">
          {selectedSummary ? (
            <SectionCard delay={0.15}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-white/90">{articleTitle}</h3>
                    <Badge variant="secondary">{selectedSummary.slug}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-white/55">
                    Review-only evidence rows, snippets, and reviewer decisions for this article.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="success"
                    size="pill"
                    className="rounded-full"
                    disabled={readyClaimKeys.length === 0 || isBulkUpdating}
                    onClick={() => {
                      void updateStatuses(readyClaimKeys, "approved");
                    }}
                  >
                    <Icon icon="lucide:badge-check" size={16} />
                    Approve ready rows
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">Blocking gaps</p>
                  <p className="mt-2 text-2xl font-semibold text-white/90">
                    {selectedSummary.blockingNeedsSourceCount +
                      selectedSummary.blockingNeedsReviewCount +
                      selectedSummary.blockingRejectedCount}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">Ready approvals</p>
                  <p className="mt-2 text-2xl font-semibold text-cyan-200">{selectedSummary.supportedCount}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">Approved</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-200">{selectedSummary.approvedCount}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">Diagnostics</p>
                  <p className="mt-2 text-2xl font-semibold text-white/90">
                    {selectedSummary.diagnosticErrorCount + selectedSummary.diagnosticWarningCount}
                  </p>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard delay={0.2}>
            <div className="flex items-center gap-2">
              <Icon icon="lucide:clipboard-check" size={18} className="text-fuchsia-300" />
              <h3 className="text-lg font-semibold text-white/90">Review checklist</h3>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3 ${
                    item.tone === "complete"
                      ? "border-emerald-400/25 bg-emerald-500/8"
                      : item.tone === "attention"
                        ? "border-rose-400/25 bg-rose-500/10"
                        : "border-amber-400/20 bg-amber-500/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      icon={
                        item.tone === "complete"
                          ? "lucide:badge-check"
                          : item.tone === "attention"
                            ? "lucide:triangle-alert"
                            : "lucide:clock-3"
                      }
                      size={16}
                    />
                    <p className="text-sm font-medium text-white/85">{item.label}</p>
                  </div>
                  <p className="mt-2 text-sm text-white/60">{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

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

          {!isDetailLoading &&
            sectionGroups.map((group) => {
              const readySectionClaimKeys = group.rows
                .filter((row) => row.status === "supported" && canApproveCitationEvidence(row))
                .map((row) => row.claimKey);
              return (
                <SectionCard key={group.section} delay={0.25}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white/90">
                        {formatCitationSectionLabel(group.section)}
                      </h3>
                      <p className="mt-1 text-sm text-white/55">
                        {group.rows.length} evidence row(s) for this section.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="pill"
                      className="rounded-full"
                      disabled={readySectionClaimKeys.length === 0 || isBulkUpdating}
                      onClick={() => {
                        void updateStatuses(readySectionClaimKeys, "approved");
                      }}
                    >
                      <Icon icon="lucide:badge-check" size={16} />
                      Approve section-ready rows
                    </Button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {group.rows.map((row) => {
                      const isPending = pendingClaimKeys.includes(row.claimKey);
                      return (
                        <div
                          key={`${row.section}-${row.claimKey}`}
                          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white/90">
                                {row.claimText?.trim() || row.fieldPath || row.claimKey}
                              </p>
                              <p className="mt-1 text-xs text-white/45">{row.claimKey}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge className={CITATION_SEVERITY_META[row.severity].className}>
                                {CITATION_SEVERITY_META[row.severity].label}
                              </Badge>
                              <Badge className={CITATION_STATUS_META[row.status].className}>
                                {CITATION_STATUS_META[row.status].label}
                              </Badge>
                            </div>
                          </div>

                          {row.fieldPath ? (
                            <p className="mt-3 text-xs text-white/50">Field path: {row.fieldPath}</p>
                          ) : null}

                          {row.referenceIds.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {row.referenceIds.map((referenceId) => (
                                <Badge key={`${row.claimKey}-${referenceId}`} variant="secondary">
                                  {referenceId}
                                </Badge>
                              ))}
                            </div>
                          ) : null}

                          {row.supportingSnippet ? (
                            <div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3">
                              <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Snippet</p>
                              <p className="mt-2 text-sm leading-6 text-white/80">{row.supportingSnippet}</p>
                            </div>
                          ) : null}

                          {row.supportRationale ? (
                            <p className="mt-3 text-sm text-white/65">{row.supportRationale}</p>
                          ) : null}

                          {(row.supports?.length ?? 0) > 0 ? (
                            <div className="mt-4 space-y-3">
                              {(row.supports ?? []).map((support, index) => (
                                <div
                                  key={`${row.claimKey}-${support.referenceId}-${index}`}
                                  className="rounded-xl border border-white/10 bg-slate-950/40 p-3"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium text-white/85">{support.sourceName}</p>
                                    <Badge variant="secondary">{support.referenceId}</Badge>
                                    {support.sourceType ? (
                                      <Badge variant="secondary">{support.sourceType}</Badge>
                                    ) : null}
                                    {support.quality ? (
                                      <Badge variant="secondary">{support.quality}</Badge>
                                    ) : null}
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-white/75">
                                    {support.supportingQuote}
                                  </p>
                                  <p className="mt-2 text-sm text-white/55">{support.rationale}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {(row.diagnostics?.length ?? 0) > 0 ? (
                            <div className="mt-4 space-y-2">
                              {(row.diagnostics ?? []).map((diagnostic, index) => (
                                <div
                                  key={`${row.claimKey}-diagnostic-${index}`}
                                  className={`rounded-xl border px-3 py-2 text-sm ${
                                    diagnostic.severity === "error"
                                      ? "border-rose-400/20 bg-rose-500/10 text-rose-100"
                                      : "border-amber-400/20 bg-amber-500/10 text-amber-100"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Icon
                                      icon={
                                        diagnostic.severity === "error"
                                          ? "lucide:triangle-alert"
                                          : "lucide:badge-alert"
                                      }
                                      size={15}
                                    />
                                    <span className="font-medium">{diagnostic.code}</span>
                                  </div>
                                  <p className="mt-1">{diagnostic.message}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              variant="success"
                              size="pill"
                              className="rounded-full"
                              disabled={!canApproveCitationEvidence(row) || isPending}
                              onClick={() => {
                                void updateStatuses([row.claimKey], "approved");
                              }}
                            >
                              <Icon
                                icon={isPending ? "lucide:loader-2" : "lucide:badge-check"}
                                size={16}
                                className={isPending ? "animate-spin" : undefined}
                              />
                              Approve
                            </Button>
                            <Button
                              variant="destructivePill"
                              size="pill"
                              className="rounded-full"
                              disabled={isPending}
                              onClick={() => {
                                void updateStatuses([row.claimKey], "rejected");
                              }}
                            >
                              <Icon
                                icon={isPending ? "lucide:loader-2" : "lucide:x-circle"}
                                size={16}
                                className={isPending ? "animate-spin" : undefined}
                              />
                              Reject
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              );
            })}
        </div>
      </div>
    </div>
  );
}

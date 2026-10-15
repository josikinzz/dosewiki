export type QueueSummaryStatus = "open" | "approved" | "rejected" | "all";

export type CitationQueueSummary = {
  slug: string;
  articleId: number | null;
  totalRows: number;
  supportedCount: number;
  needsSourceCount: number;
  needsReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  blockingCount: number;
  blockingNeedsSourceCount: number;
  blockingNeedsReviewCount: number;
  blockingSupportedCount: number;
  blockingRejectedCount: number;
  diagnosticErrorCount: number;
  diagnosticWarningCount: number;
  sectionIds: string[];
  updatedAt: string | null;
};

export function finalizeQueueSummaries(
  summaries: Iterable<CitationQueueSummary>,
  status: QueueSummaryStatus,
): CitationQueueSummary[] {
  return [...summaries]
    .filter((summary) => matchesQueueSummaryStatus(status, summary))
    .map((summary) => ({
      ...summary,
      sectionIds: [...summary.sectionIds].sort((left, right) => left.localeCompare(right)),
    }))
    .sort(compareQueueSummaries);
}

export function matchesQueueSummaryStatus(
  status: QueueSummaryStatus,
  summary: CitationQueueSummary,
): boolean {
  switch (status) {
    case "open":
      return summary.approvedCount < summary.totalRows;
    case "approved":
      return summary.approvedCount === summary.totalRows;
    case "rejected":
      return summary.rejectedCount > 0;
    case "all":
      return true;
  }
}

export function compareQueueSummaries(left: CitationQueueSummary, right: CitationQueueSummary): number {
  return (
    (right.blockingNeedsSourceCount + right.blockingNeedsReviewCount + right.blockingRejectedCount) -
      (left.blockingNeedsSourceCount + left.blockingNeedsReviewCount + left.blockingRejectedCount) ||
    right.supportedCount - left.supportedCount ||
    right.totalRows - left.totalRows ||
    left.slug.localeCompare(right.slug)
  );
}

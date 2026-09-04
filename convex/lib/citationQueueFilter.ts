// Mirrors `CitationReviewQueueFilter` in the citation-review tool models.
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

/** The slice of an evidence row the queue summary reads. */
export type CitationQueueSummaryRow = {
  slug: string;
  articleId?: number | null;
  section: string;
  status: "supported" | "needs_source" | "needs_review" | "approved" | "rejected";
  severity: "blocking" | "non_blocking";
  updatedAt: string;
  diagnostics?: Array<{ severity: "error" | "warning" }>;
};

export function emptyQueueSummary(slug: string, articleId: number | null): CitationQueueSummary {
  return {
    slug,
    articleId,
    totalRows: 0,
    supportedCount: 0,
    needsSourceCount: 0,
    needsReviewCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    blockingCount: 0,
    blockingNeedsSourceCount: 0,
    blockingNeedsReviewCount: 0,
    blockingSupportedCount: 0,
    blockingRejectedCount: 0,
    diagnosticErrorCount: 0,
    diagnosticWarningCount: 0,
    sectionIds: [],
    updatedAt: null,
  };
}

/** Folds one evidence row into its article's summary, creating it on first sight. */
export function accumulateQueueSummary(
  summaries: Map<string, CitationQueueSummary>,
  row: CitationQueueSummaryRow,
): void {
  const summary = summaries.get(row.slug) ?? emptyQueueSummary(row.slug, row.articleId ?? null);
  summaries.set(row.slug, summary);

  summary.totalRows += 1;

  if (!summary.sectionIds.includes(row.section)) {
    summary.sectionIds.push(row.section);
  }

  if (!summary.updatedAt || row.updatedAt > summary.updatedAt) {
    summary.updatedAt = row.updatedAt;
  }

  const blocking = row.severity === "blocking";
  if (blocking) {
    summary.blockingCount += 1;
  }

  switch (row.status) {
    case "supported":
      summary.supportedCount += 1;
      if (blocking) summary.blockingSupportedCount += 1;
      break;
    case "needs_source":
      summary.needsSourceCount += 1;
      if (blocking) summary.blockingNeedsSourceCount += 1;
      break;
    case "needs_review":
      summary.needsReviewCount += 1;
      if (blocking) summary.blockingNeedsReviewCount += 1;
      break;
    case "approved":
      summary.approvedCount += 1;
      break;
    case "rejected":
      summary.rejectedCount += 1;
      if (blocking) summary.blockingRejectedCount += 1;
      break;
  }

  for (const diagnostic of row.diagnostics ?? []) {
    if (diagnostic.severity === "error") {
      summary.diagnosticErrorCount += 1;
    } else {
      summary.diagnosticWarningCount += 1;
    }
  }
}

/**
 * Adds a partial summary (one page's worth of rows for a slug) onto the running
 * total for that slug. A Convex query may run only one paginated read, so the
 * table is summarized page by page and the pages are merged by the caller.
 */
export function mergeQueueSummary(
  summaries: Map<string, CitationQueueSummary>,
  partial: CitationQueueSummary,
): void {
  const existing = summaries.get(partial.slug);
  if (!existing) {
    summaries.set(partial.slug, { ...partial, sectionIds: [...partial.sectionIds] });
    return;
  }

  existing.articleId = existing.articleId ?? partial.articleId;
  existing.totalRows += partial.totalRows;
  existing.supportedCount += partial.supportedCount;
  existing.needsSourceCount += partial.needsSourceCount;
  existing.needsReviewCount += partial.needsReviewCount;
  existing.approvedCount += partial.approvedCount;
  existing.rejectedCount += partial.rejectedCount;
  existing.blockingCount += partial.blockingCount;
  existing.blockingNeedsSourceCount += partial.blockingNeedsSourceCount;
  existing.blockingNeedsReviewCount += partial.blockingNeedsReviewCount;
  existing.blockingSupportedCount += partial.blockingSupportedCount;
  existing.blockingRejectedCount += partial.blockingRejectedCount;
  existing.diagnosticErrorCount += partial.diagnosticErrorCount;
  existing.diagnosticWarningCount += partial.diagnosticWarningCount;
  for (const sectionId of partial.sectionIds) {
    if (!existing.sectionIds.includes(sectionId)) {
      existing.sectionIds.push(sectionId);
    }
  }
  if (partial.updatedAt && (!existing.updatedAt || partial.updatedAt > existing.updatedAt)) {
    existing.updatedAt = partial.updatedAt;
  }
}

/** Applies the queue filter and the queue ordering to merged summaries. */
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

// `open` keeps an article queued while at least one row is not approved, so
// fully approved articles drain out. `approved` returns exactly those drained
// articles, `rejected` narrows to articles with at least one rejected row, and
// `all` lifts the filter.
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

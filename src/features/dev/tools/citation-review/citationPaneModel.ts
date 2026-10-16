import {
  CITATION_QUEUE_FILTER_LABEL,
  formatCitationCount,
  type CitationEvidenceRow,
  type CitationReviewDecisionRecord,
  type CitationReviewQueueFilter,
  type CitationReviewQueueSummary,
} from "./citationReviewModels";

export type CitationTally = {
  total: number;
  ready: number;
  blockingGaps: number;
  otherGaps: number;
  accepted: number;
  rejected: number;
  diagnostics: number;
};

const GAP_STATUSES = new Set(["needs_source", "needs_review", "rejected"]);

export function tallyRows(rows: readonly CitationEvidenceRow[]): CitationTally {
  let ready = 0;
  let blockingGaps = 0;
  let otherGaps = 0;
  let accepted = 0;
  let rejected = 0;
  let diagnostics = 0;
  for (const row of rows) {
    if (row.status === "supported") ready += 1;
    if (row.status === "approved") accepted += 1;
    if (row.status === "rejected") rejected += 1;
    if (GAP_STATUSES.has(row.status)) {
      if (row.severity === "blocking") blockingGaps += 1;
      else otherGaps += 1;
    }
    diagnostics += row.diagnostics?.length ?? 0;
  }
  return { total: rows.length, ready, blockingGaps, otherGaps, accepted, rejected, diagnostics };
}

export function summaryBlockingGaps(entry: CitationReviewQueueSummary): number {
  return entry.blockingNeedsSourceCount + entry.blockingNeedsReviewCount + entry.blockingRejectedCount;
}

export function describeQueueTotals(
  queue: readonly CitationReviewQueueSummary[],
  filter: CitationReviewQueueFilter,
): string {
  const articles = formatCitationCount(queue.length, "article");
  if (queue.length === 0) return `Nothing is listed under ${CITATION_QUEUE_FILTER_LABEL[filter]}.`;
  const ready = queue.reduce((total, entry) => total + entry.supportedCount, 0);
  const blocking = queue.reduce((total, entry) => total + summaryBlockingGaps(entry), 0);
  const scope = `${articles} ${FILTER_SCOPE[filter]}`;
  const parts = [
    ready > 0 ? `${formatCitationCount(ready, "row")} ready to approve` : "no row ready to approve",
    blocking > 0 ? formatCitationCount(blocking, "blocking gap") : "no blocking gaps",
  ];
  return `${scope}: ${parts.join(", ")}.`;
}

const FILTER_SCOPE: Record<CitationReviewQueueFilter, string> = {
  open: "with undecided evidence",
  approved: "with every row accepted",
  rejected: "holding a rejected row",
  all: "with evidence",
};

const FILTER_EMPTY: Record<CitationReviewQueueFilter, string> = {
  open: "No article is waiting on a citation decision.",
  approved: "No article has every evidence row accepted yet.",
  rejected: "No article holds a rejected evidence row.",
  all: "No article has citation evidence yet.",
};

export function describeEmptyFilter(filter: CitationReviewQueueFilter): string {
  return FILTER_EMPTY[filter];
}

export function describeListCount(shown: number, total: number, searching: boolean): string {
  if (searching) return `${shown} of ${total} shown`;
  return formatCitationCount(total, "article");
}

export function describeTally(tally: CitationTally): string {
  const parts: string[] = [];
  if (tally.ready > 0) parts.push(`${tally.ready} ready to approve`);
  if (tally.blockingGaps > 0) parts.push(formatCitationCount(tally.blockingGaps, "blocking gap"));
  if (tally.otherGaps > 0) parts.push(`${tally.otherGaps} other ${tally.otherGaps === 1 ? "gap" : "gaps"}`);
  if (tally.accepted > 0) parts.push(`${tally.accepted} accepted`);
  if (tally.rejected > 0) parts.push(`${tally.rejected} rejected`);
  const head = formatCitationCount(tally.total, "row");
  return parts.length > 0 ? `${head}: ${parts.join(", ")}` : head;
}

function rowFingerprint(row: CitationEvidenceRow): string {
  return `${row.status}\u0000${row.statusReason ?? ""}\u0000${row.updatedAt}`;
}

export function rowsChangedSince(
  shown: readonly CitationEvidenceRow[],
  fresh: readonly CitationEvidenceRow[],
  claimKeys: readonly string[],
): string[] {
  const before = new Map(shown.map((row) => [row.claimKey, rowFingerprint(row)]));
  const after = new Map(fresh.map((row) => [row.claimKey, rowFingerprint(row)]));
  return claimKeys.filter((key) => !after.has(key) || before.get(key) !== after.get(key));
}

export function rowsMovedSinceDecision(
  decision: CitationReviewDecisionRecord,
  fresh: readonly CitationEvidenceRow[],
): string[] {
  const now = new Map(fresh.map((row) => [row.claimKey, row.status]));
  return decision.prior
    .map((row) => row.claimKey)
    .filter((key) => now.get(key) !== decision.status);
}

export const CITATION_FREEZE_COPY = "Writes are paused, so that was not saved. Try again once they resume.";

export function describeConflict(count: number, undo = false): string {
  const rows = count === 1 ? "one of these rows" : `${count} of these rows`;
  return undo
    ? `Someone changed ${rows} after your decision, so nothing was undone. The latest is on screen now.`
    : `Someone changed ${rows} after you opened it, so nothing was saved. The latest is on screen now; read it and decide again.`;
}

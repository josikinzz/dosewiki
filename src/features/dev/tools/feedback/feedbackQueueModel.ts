import type {
  FeedbackImportance,
  FeedbackQueueFilter,
  FeedbackQueueItem,
  FeedbackQueueStatus,
} from "./FeedbackReviewQueue";

export type QueueSort = "oldest" | "newest" | "importance";

export type StatusCounts = Record<FeedbackQueueStatus, number>;

export function looksLikeContactDetails(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.includes("@") || /\d[\d\s().-]{5,}\d/.test(trimmed);
}

export type FeedbackPageQuery = {
  status: FeedbackQueueFilter;
  search: string;
  sort: QueueSort;
  cursor: string | null;
};

export type FeedbackPage<Item> = {
  rows: Item[];
  counts: StatusCounts;
  nextCursor: string | null;
};

export const FEEDBACK_PAGE_SIZE = 100;

export const QUEUE_STATUSES: FeedbackQueueStatus[] = ["new", "reviewing", "resolved", "rejected", "spam"];

const IMPORTANCE_RANK: Record<FeedbackImportance, number> = { critical: 0, high: 1, normal: 2, low: 3 };

export const UNRESOLVED_STATUSES: readonly FeedbackQueueStatus[] = ["new", "reviewing"];

export function defaultSort(filter: FeedbackQueueFilter): QueueSort {
  return filter === "new" || filter === "reviewing" || filter === "unresolved" ? "oldest" : "newest";
}

export function matchesFilter(status: FeedbackQueueStatus, filter: FeedbackQueueFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unresolved") return UNRESOLVED_STATUSES.includes(status);
  return status === filter;
}

export function totalFor(counts: StatusCounts, filter: FeedbackQueueFilter): number {
  return QUEUE_STATUSES.filter((status) => matchesFilter(status, filter)).reduce((sum, status) => sum + counts[status], 0);
}

export function emptyCounts(): StatusCounts {
  return { new: 0, reviewing: 0, resolved: 0, rejected: 0, spam: 0 };
}

export function countByStatus(rows: readonly FeedbackQueueItem[]): StatusCounts {
  const counts = emptyCounts();
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}

export function sortRows<Item extends FeedbackQueueItem>(
  rows: readonly Item[],
  sort: QueueSort,
  importance?: (item: Item) => FeedbackImportance | null | undefined,
): Item[] {
  const byAge = (a: Item, b: Item) => a.created_at.localeCompare(b.created_at);
  const sorted = [...rows];
  if (sort === "newest") {
    return sorted.sort((a, b) => byAge(b, a));
  }
  if (sort === "oldest" || !importance) {
    return sorted.sort(byAge);
  }
  const rank = (row: Item) => {
    const level = importance(row);
    return level ? IMPORTANCE_RANK[level] : Object.keys(IMPORTANCE_RANK).length;
  };
  return sorted.sort((a, b) => rank(a) - rank(b) || byAge(a, b));
}

export function pageLocally<Item extends FeedbackQueueItem>(
  all: readonly Item[],
  query: FeedbackPageQuery,
  importance?: (item: Item) => FeedbackImportance | null | undefined,
  pageSize = FEEDBACK_PAGE_SIZE,
): FeedbackPage<Item> {
  const needle = query.search.trim().toLowerCase();
  const matching = needle
    ? all.filter((row) =>
        Object.values(row)
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : [...all];
  const listed = sortRows(
    matching.filter((row) => matchesFilter(row.status, query.status)),
    query.sort,
    importance,
  );
  const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
  const end = offset + pageSize;
  return {
    rows: listed.slice(offset, end),
    counts: countByStatus(matching),
    nextCursor: end < listed.length ? String(end) : null,
  };
}

export function feedbackReplyHref(email: string, subject: string, note: string): string {
  const quoted = note
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (quoted) {
    params.push(`body=${encodeURIComponent(`\n\nYou wrote:\n${quoted}\n`)}`);
  }
  return `mailto:${encodeURIComponent(email.trim())}?${params.join("&")}`;
}

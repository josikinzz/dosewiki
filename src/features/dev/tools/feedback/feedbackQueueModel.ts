import type {
  FeedbackImportance,
  FeedbackQueueFilter,
  FeedbackQueueItem,
  FeedbackQueueStatus,
} from "./FeedbackReviewQueue";

/**
 * `oldest` puts the report that has waited longest first, the order for
 * clearing unresolved work. `importance` ranks critical first and, within a
 * level, oldest first; rows without a level sort last.
 */
export type QueueSort = "oldest" | "newest" | "importance";

export type StatusCounts = Record<FeedbackQueueStatus, number>;

/**
 * Whether text looks like a reader's contact details: anything with an @ or
 * a run of seven or more digits. Such text never goes in an address: not in
 * a task link, and not in the queue's own search request, so the queue
 * cannot be searched by it at all.
 */
export function looksLikeContactDetails(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.includes("@") || /\d[\d\s().-]{5,}\d/.test(trimmed);
}

/** What one queue request asks for. `cursor` continues the same query; null starts it. */
export type FeedbackPageQuery = {
  status: FeedbackQueueFilter;
  search: string;
  sort: QueueSort;
  cursor: string | null;
};

/**
 * One page of rows plus the per-status counts of every row the search
 * matches: the total is known apart from how many rows are loaded.
 */
export type FeedbackPage<Item> = {
  rows: Item[];
  counts: StatusCounts;
  nextCursor: string | null;
};

export const FEEDBACK_PAGE_SIZE = 100;

export const QUEUE_STATUSES: FeedbackQueueStatus[] = ["new", "reviewing", "resolved", "rejected", "spam"];

const IMPORTANCE_RANK: Record<FeedbackImportance, number> = { critical: 0, high: 1, normal: 2, low: 3 };

/** The statuses the `unresolved` filter lists: every item still waiting on a decision. */
export const UNRESOLVED_STATUSES: readonly FeedbackQueueStatus[] = ["new", "reviewing"];

/** Unresolved rows open oldest first so nothing waits forever; resolved history opens newest first. */
export function defaultSort(filter: FeedbackQueueFilter): QueueSort {
  return filter === "new" || filter === "reviewing" || filter === "unresolved" ? "oldest" : "newest";
}

/** Whether a row in `status` belongs in the list `filter` shows. */
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

/**
 * The server's paging contract over a list a source returns whole (glossary
 * feedback is per language and small): search, status, order and an offset
 * cursor applied in the browser.
 */
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

/**
 * A reply link for a reader who left a contact email: the admin's own mail
 * app opens with a subject and the reader's note quoted, ready to answer.
 * Nothing is sent from dose.wiki.
 */
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

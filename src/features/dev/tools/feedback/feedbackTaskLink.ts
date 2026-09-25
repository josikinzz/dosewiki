/**
 * The Feedback tab's task link: which source, which item, and the queue
 * context around it (status filter, order, search), as one App Path.
 *
 *   /dev/article-feedback/<id>?source=article&status=unresolved&sort=oldest&q=dose
 *
 * The item rides in the path like every other /dev record; the filters ride
 * in the query. Only non-sensitive state goes in: ids, statuses, the order,
 * and search text that names no person. A search that looks like an email
 * address or a phone number stays out of the address, so a copied link never
 * carries reader contact details.
 */

import { devHref } from "@/utils/devHref";

import { isFeedbackQueueFilter, type FeedbackQueueFilter } from "./FeedbackReviewQueue";
import { looksLikeContactDetails, type QueueSort } from "./feedbackQueueModel";

export type FeedbackSource = "article" | "site";

export type FeedbackTaskContext = {
  source: FeedbackSource;
  id?: string | null;
  status?: FeedbackQueueFilter | null;
  sort?: QueueSort | null;
  search?: string;
};

export const FEEDBACK_STATUS_PARAM = "status";
export const FEEDBACK_SORT_PARAM = "sort";
export const FEEDBACK_SEARCH_PARAM = "q";

const SORTS: readonly QueueSort[] = ["oldest", "newest", "importance"];
const MAX_SHAREABLE_SEARCH = 100;

export function isQueueSort(value: unknown): value is QueueSort {
  return typeof value === "string" && (SORTS as readonly string[]).includes(value);
}

/**
 * Whether search text may go in an address: short, and naming no person.
 * Reader contact details are the one thing an admin might search by that must
 * never leave the page (see `looksLikeContactDetails`).
 */
export function isShareableSearch(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_SHAREABLE_SEARCH && !looksLikeContactDetails(trimmed);
}

/** The task link for a feedback item or queue view, as an App Path. */
export function feedbackTaskHref(context: FeedbackTaskContext): string {
  const id = context.id?.trim();
  const base = devHref({
    type: "dev",
    tab: "article-feedback",
    slug: id ? encodeURIComponent(id) : undefined,
    filter: context.source,
  });
  const params = new URLSearchParams();
  if (context.status) params.set(FEEDBACK_STATUS_PARAM, context.status);
  if (context.sort) params.set(FEEDBACK_SORT_PARAM, context.sort);
  if (context.search && isShareableSearch(context.search)) params.set(FEEDBACK_SEARCH_PARAM, context.search.trim());
  const query = params.toString();
  return query ? `${base}&${query}` : base;
}

/** The queue context a task link's query string carries; anything unknown is dropped. */
export function readFeedbackTaskParams(search: string): {
  status: FeedbackQueueFilter | null;
  sort: QueueSort | null;
  search: string;
} {
  const params = new URLSearchParams(search);
  const status = params.get(FEEDBACK_STATUS_PARAM);
  const sort = params.get(FEEDBACK_SORT_PARAM);
  const text = params.get(FEEDBACK_SEARCH_PARAM) ?? "";
  return {
    status: isFeedbackQueueFilter(status) ? status : null,
    sort: isQueueSort(sort) ? sort : null,
    search: isShareableSearch(text) ? text.trim() : "",
  };
}

/** A path segment back to the id it names; a malformed escape reads as written. */
export function decodeTaskId(segment: string | undefined): string | null {
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

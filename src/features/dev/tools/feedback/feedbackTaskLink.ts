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

export function isShareableSearch(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_SHAREABLE_SEARCH && !looksLikeContactDetails(trimmed);
}

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

export function decodeTaskId(segment: string | undefined): string | null {
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

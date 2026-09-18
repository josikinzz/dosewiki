"use client";

import { useState } from "react";

import { EditorSegmentedControl } from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";

import { articleFeedbackAdapter } from "./articleFeedbackAdapter";
import {
  FeedbackReviewQueue,
  isFeedbackQueueFilter,
  type FeedbackDraftGuard,
  type FeedbackQueueFilter,
} from "./FeedbackReviewQueue";
import { siteFeedbackAdapter } from "./siteFeedbackAdapter";

export type FeedbackSource = "article" | "site";

const SOURCE_OPTIONS: { value: FeedbackSource; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "site", label: "Site" },
];

const STATUS_PARAM = "status";

/**
 * One Feedback tab over both reader intakes. The source filter picks the
 * adapter; the queue itself does not know which source it is showing.
 *
 * The queue is keyed by source so switching remounts it: a half-typed note,
 * a pending transition, or a list still loading for the old source never
 * carries into the new one. The status filter lives here, above the remount,
 * so an editor working through New rows stays on New across both sources.
 *
 * Both filters live in the URL, `?source=` and `?status=`, so a reload keeps
 * them, and the retired `/dev/site-feedback` address presets the source
 * through the registry's filter segments. The route only resolves `source`
 * on the server; the client-only tab reads `status` in its lazy initial
 * state before first render. Writes go through native history rather than
 * the router: the filters are client-only state, so a server round trip
 * would buy nothing.
 */
export function FeedbackTab({ initialSource }: { initialSource?: string }) {
  const [source, setSource] = useState<FeedbackSource>(initialSource === "site" ? "site" : "article");
  const [statusFilter, setStatusFilter] = useState<FeedbackQueueFilter | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const fromUrl = new URLSearchParams(window.location.search).get(STATUS_PARAM);
    return isFeedbackQueueFilter(fromUrl) ? fromUrl : null;
  });

  function writeUrl(nextSource: FeedbackSource, nextStatus: FeedbackQueueFilter | null) {
    const path = viewToPath({ type: "dev", tab: "article-feedback", filter: nextSource });
    window.history.replaceState(null, "", nextStatus ? `${path}&${STATUS_PARAM}=${nextStatus}` : path);
  }

  function selectSource(next: FeedbackSource) {
    setSource(next);
    writeUrl(next, statusFilter);
  }

  function selectStatus(next: FeedbackQueueFilter) {
    setStatusFilter(next);
    writeUrl(source, next);
  }

  const sourceFilter = (guard: FeedbackDraftGuard) => (
    <EditorSegmentedControl
      label="Feedback source"
      options={SOURCE_OPTIONS}
      value={source}
      onChange={(value) => {
        if (value !== source) {
          guard(() => selectSource(value as FeedbackSource));
        }
      }}
    />
  );

  return source === "site" ? (
    <FeedbackReviewQueue
      key={source}
      adapter={siteFeedbackAdapter}
      headerActions={sourceFilter}
      statusFilter={statusFilter}
      onStatusFilterChange={selectStatus}
    />
  ) : (
    <FeedbackReviewQueue
      key={source}
      adapter={articleFeedbackAdapter}
      headerActions={sourceFilter}
      statusFilter={statusFilter}
      onStatusFilterChange={selectStatus}
    />
  );
}

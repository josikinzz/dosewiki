"use client";

import { useState } from "react";

import { EditorSegmentedControl } from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";

import { articleFeedbackAdapter } from "./articleFeedbackAdapter";
import { FeedbackReviewQueue } from "./FeedbackReviewQueue";
import { siteFeedbackAdapter } from "./siteFeedbackAdapter";

export type FeedbackSource = "article" | "site";

const SOURCE_OPTIONS: { value: FeedbackSource; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "site", label: "Site" },
];

/**
 * One Feedback tab over both reader intakes. The source filter picks the
 * adapter; the queue itself does not know which source it is showing.
 *
 * The queue is keyed by source so switching remounts it: a half-typed note,
 * a pending transition, or a list still loading for the old source never
 * carries into the new one.
 *
 * The filter lives in the URL as `?source=` so a reload keeps it, and the
 * retired `/dev/site-feedback` address presets it through the registry's
 * filter segments. Writes go through native history rather than the router:
 * the filter is client-only state, so a server round trip would buy nothing.
 */
export function FeedbackTab({ initialSource }: { initialSource?: string }) {
  const [source, setSource] = useState<FeedbackSource>(initialSource === "site" ? "site" : "article");

  function selectSource(next: FeedbackSource) {
    if (next === source) {
      return;
    }
    setSource(next);
    window.history.replaceState(null, "", viewToPath({ type: "dev", tab: "article-feedback", filter: next }));
  }

  const sourceFilter = (
    <EditorSegmentedControl
      label="Feedback source"
      options={SOURCE_OPTIONS}
      value={source}
      onChange={(value) => selectSource(value as FeedbackSource)}
    />
  );

  return source === "site" ? (
    <FeedbackReviewQueue key={source} adapter={siteFeedbackAdapter} headerActions={sourceFilter} />
  ) : (
    <FeedbackReviewQueue key={source} adapter={articleFeedbackAdapter} headerActions={sourceFilter} />
  );
}

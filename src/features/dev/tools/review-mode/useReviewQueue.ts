"use client";

import { useEffect, useMemo, useState } from "react";

import type { CategoryLayout } from "@/hooks/useCategoryLayout";
import type { ReviewFlag, SubstanceArticle } from "@/schema";
import type { SubstanceInfo } from "../substance-editor/types";
import { resolveEditorArticleSlug } from "../../context/devModeUtils";
import {
  buildChangedSinceReviewGroups,
  buildReviewGroups,
  buildReviewQueue,
  buildReviewFlagGroups,
  deriveReviewFlagLabels,
  filterReviewQueue,
  flattenHomeOrder,
  queueIndexOf,
  sortReviewQueue,
  type PublishedRevisions,
  type ReviewQueueEntry,
  type ReviewQueueGroup,
  type ReviewStatusOverrides,
} from "./reviewQueue";
import type { ReviewSettingsState } from "./useReviewSettings";

export interface ReviewQueueState {
  statsState: "loading" | "ready" | "fallback";
  queue: ReviewQueueEntry[];
  flagFilteredQueue: ReviewQueueEntry[];
  visibleQueue: ReviewQueueEntry[];
  availableFlagLabels: string[];
  queueGroups: ReviewQueueGroup[];
  pickerGroups: ReviewQueueGroup[];
  position: number;
  current: ReviewQueueEntry | null;
  article: SubstanceArticle | null;
  reviewedCount: number;
  changedSinceReviewCount: number;
  allReviewed: boolean;
  substances: SubstanceInfo[];
}

export function useReviewQueue({
  typedArticles,
  layout,
  overrides,
  flagOverrides,
  publishedRevisions = null,
  settings,
}: {
  typedArticles: SubstanceArticle[];
  layout: CategoryLayout;
  overrides: ReviewStatusOverrides;
  flagOverrides?: Readonly<Record<string, ReviewFlag[]>>;
  publishedRevisions?: PublishedRevisions | null;
  settings: ReviewSettingsState;
}): ReviewQueueState {
  const {
    settings: { order, unreviewedOnly, changedSinceReview },
    settingsRestored,
    effectiveFlagLabels,
    effectiveFlagSeverity,
    effectiveFlagGroupBy,
    currentSlug,
    setCurrentSlug,
  } = settings;
  const [sourceTokens, setSourceTokens] = useState<Record<string, number>>({});
  const [statsState, setStatsState] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );

  useEffect(() => {
    if (!settingsRestored || order !== "sources") {
      return;
    }

    let cancelled = false;
    setStatsState("loading");
    fetch("/api/dev/article-source-stats")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (payload: {
          stats?: Array<{ slug: string; totalTokens?: number }>;
        } | null) => {
          if (cancelled) return;
          if (!payload?.stats) {
            setStatsState("fallback");
            return;
          }
          const tokens: Record<string, number> = {};
          for (const stat of payload.stats) {
            tokens[stat.slug] = stat.totalTokens ?? 0;
          }
          setSourceTokens(tokens);
          setStatsState("ready");
        },
      )
      .catch(() => {
        if (!cancelled) setStatsState("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, [order, settingsRestored]);

  const homeOrder = useMemo(() => flattenHomeOrder(layout), [layout]);

  const queueArticles = useMemo(() => {
    if (!flagOverrides || Object.keys(flagOverrides).length === 0) return typedArticles;
    return typedArticles.map((article) => {
      const slug = resolveEditorArticleSlug(article);
      const flags = slug ? flagOverrides[slug] : undefined;
      return flags ? { ...article, editorial_review: { ...article.editorial_review, flags } } : article;
    });
  }, [flagOverrides, typedArticles]);

  const queue = useMemo(
    () =>
      sortReviewQueue(
        buildReviewQueue(queueArticles, overrides, publishedRevisions),
        order,
        {
          sourceTokens,
          homeOrder,
        },
      ),
    [queueArticles, overrides, publishedRevisions, order, sourceTokens, homeOrder],
  );
  const flagFilteredQueue = useMemo(
    () => filterReviewQueue(queue, { unreviewedOnly: false, currentSlug: null, changedSinceReview, flagLabels: effectiveFlagLabels, flagSeverity: effectiveFlagSeverity }),
    [queue, changedSinceReview, effectiveFlagLabels, effectiveFlagSeverity],
  );
  const visibleQueue = useMemo(
    () => filterReviewQueue(queue, { unreviewedOnly, currentSlug, changedSinceReview, flagLabels: effectiveFlagLabels, flagSeverity: effectiveFlagSeverity }),
    [queue, unreviewedOnly, currentSlug, changedSinceReview, effectiveFlagLabels, effectiveFlagSeverity],
  );
  const availableFlagLabels = useMemo(() => deriveReviewFlagLabels(queue), [queue]);
  const queueGroups = useMemo(
    () => buildReviewGroups(queue, layout),
    [queue, layout],
  );
  const pickerGroups = useMemo(
    () => changedSinceReview
      ? buildChangedSinceReviewGroups(flagFilteredQueue)
      : effectiveFlagGroupBy === "none" ? buildReviewGroups(flagFilteredQueue, layout) : buildReviewFlagGroups(flagFilteredQueue, effectiveFlagGroupBy),
    [changedSinceReview, flagFilteredQueue, layout, effectiveFlagGroupBy],
  );

  useEffect(() => {
    if (currentSlug || !settingsRestored) return;
    const first =
      queue.find((entry) => entry.status !== "completed") ?? queue[0];
    if (first) setCurrentSlug(first.slug);
  }, [currentSlug, queue, settingsRestored, setCurrentSlug]);

  const position = queueIndexOf(visibleQueue, currentSlug);
  const current = visibleQueue[position] ?? null;

  const article = useMemo(() => {
    if (!current) return null;
    return typedArticles.find((candidate) => resolveEditorArticleSlug(candidate) === current.slug) ?? null;
  }, [current, typedArticles]);

  const reviewedCount = useMemo(
    () => queue.filter((entry) => entry.status === "completed").length,
    [queue],
  );
  const changedSinceReviewCount = useMemo(
    () => queue.filter((entry) => entry.status === "stale").length,
    [queue],
  );
  const allReviewed = queue.length > 0 && reviewedCount === queue.length;

  const substances = useMemo<SubstanceInfo[]>(
    () =>
      queue.map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        reviewStatus: entry.status === "stale" ? "needed" : entry.status,
      })),
    [queue],
  );

  return {
    statsState,
    queue,
    flagFilteredQueue,
    visibleQueue,
    availableFlagLabels,
    queueGroups,
    pickerGroups,
    position,
    current,
    article,
    reviewedCount,
    changedSinceReviewCount,
    allReviewed,
    substances,
  };
}

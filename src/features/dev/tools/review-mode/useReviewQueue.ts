"use client";

import { useEffect, useMemo, useState } from "react";

import type { CategoryLayout } from "@/hooks/useCategoryLayout";
import type { ReviewFlag, SubstanceArticle } from "@/schema";
import type { SubstanceInfo } from "../substance-editor/types";
import { resolveEditorArticleSlug } from "../../context/devModeUtils";
import {
  buildReviewGroups,
  buildReviewQueue,
  buildReviewFlagGroups,
  deriveReviewFlagLabels,
  filterReviewQueue,
  flattenHomeOrder,
  queueIndexOf,
  sortReviewQueue,
  type ReviewQueueEntry,
  type ReviewQueueGroup,
  type ReviewStatusOverrides,
} from "./reviewQueue";
import type { ReviewSettingsState } from "./useReviewSettings";

export interface ReviewQueueState {
  /** Whether `/api/dev/article-source-stats` answered, for the settings panel. */
  statsState: "loading" | "ready" | "fallback";
  /** Every reachable article in the reviewer's chosen order. */
  queue: ReviewQueueEntry[];
  /** The queue under the flag filters only, which is what the picker lists. */
  flagFilteredQueue: ReviewQueueEntry[];
  /** The queue the arrows walk: flag filters plus unreviewed-only. */
  visibleQueue: ReviewQueueEntry[];
  availableFlagLabels: string[];
  queueGroups: ReviewQueueGroup[];
  pickerGroups: ReviewQueueGroup[];
  /** Index of the current article in `visibleQueue`. */
  position: number;
  current: ReviewQueueEntry | null;
  article: SubstanceArticle | null;
  reviewedCount: number;
  allReviewed: boolean;
  substances: SubstanceInfo[];
}

/**
 * The review queue and everything derived from it: the flip-through order,
 * the picker tree, the landing pick, and the article the queue position
 * currently names.
 */
export function useReviewQueue({
  typedArticles,
  layout,
  overrides,
  flagOverrides,
  settings,
}: {
  typedArticles: SubstanceArticle[];
  layout: CategoryLayout;
  overrides: ReviewStatusOverrides;
  /** Review Flags written this session, which the queue's badges read first. */
  flagOverrides?: Readonly<Record<string, ReviewFlag[]>>;
  settings: ReviewSettingsState;
}): ReviewQueueState {
  const {
    settings: { order, unreviewedOnly },
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

  // Source richness drives the default order; fall back to bibliography sizes
  // and say so, rather than silently pretending the stats arrived.
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

  // The queue reads flags written this session so picker badges and flag
  // filters follow the notes panel without waiting for a library refresh.
  const queueArticles = useMemo(() => {
    if (!flagOverrides || Object.keys(flagOverrides).length === 0) return typedArticles;
    return typedArticles.map((article) => {
      const slug = resolveEditorArticleSlug(article);
      const flags = slug ? flagOverrides[slug] : undefined;
      return flags ? { ...article, editorial_review: { ...article.editorial_review, flags } } : article;
    });
  }, [flagOverrides, typedArticles]);

  // Every reachable article is in the corpus, placed on the index or not:
  // unplaced ones land in the picker's Unplaced group and count toward
  // progress like any other.
  const queue = useMemo(
    () =>
      sortReviewQueue(
        buildReviewQueue(queueArticles, overrides),
        order,
        {
          sourceTokens,
          homeOrder,
        },
      ),
    [queueArticles, overrides, order, sourceTokens, homeOrder],
  );
  const flagFilteredQueue = useMemo(
    () => filterReviewQueue(queue, { unreviewedOnly: false, currentSlug: null, flagLabels: effectiveFlagLabels, flagSeverity: effectiveFlagSeverity }),
    [queue, effectiveFlagLabels, effectiveFlagSeverity],
  );
  const visibleQueue = useMemo(
    () => filterReviewQueue(queue, { unreviewedOnly, currentSlug, flagLabels: effectiveFlagLabels, flagSeverity: effectiveFlagSeverity }),
    [queue, unreviewedOnly, currentSlug, effectiveFlagLabels, effectiveFlagSeverity],
  );
  const availableFlagLabels = useMemo(() => deriveReviewFlagLabels(queue), [queue]);
  // The picker's category tree. Built from the full queue, like the flat list:
  // the unreviewed-only filter governs the flip-through, not the jump target.
  const queueGroups = useMemo(
    () => buildReviewGroups(queue, layout),
    [queue, layout],
  );
  const pickerGroups = useMemo(
    () => effectiveFlagGroupBy === "none" ? buildReviewGroups(flagFilteredQueue, layout) : buildReviewFlagGroups(flagFilteredQueue, effectiveFlagGroupBy),
    [flagFilteredQueue, layout, effectiveFlagGroupBy],
  );

  // Land on the deep-linked article, else the first still-unreviewed one in
  // the queue's own order — home-page order unless the reviewer chose another.
  //
  // Waiting for the stored settings is the whole point of the guard: articles
  // and layout are already in hand when this component mounts, so without it
  // the landing is picked on the first commit, from a queue sorted by the
  // *default* order, and then never revisited once `currentSlug` is set.
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
  const allReviewed = queue.length > 0 && reviewedCount === queue.length;

  const substances = useMemo<SubstanceInfo[]>(
    () =>
      queue.map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        reviewStatus: entry.status,
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
    allReviewed,
    substances,
  };
}

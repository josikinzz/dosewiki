import type { SubstanceArticle } from "@/schema";
import { substanceVisibility } from "@/schema/substance/substanceVisibilityPolicy";
import { slugify } from "@/utils/slug";
import type { ReviewStatus } from "../substance-editor/types";

/**
 * One flip-through candidate in the review queue.
 */
export interface ReviewQueueEntry {
  slug: string;
  name: string;
  status: ReviewStatus;
}

/**
 * Local, unsaved-to-context review states, keyed by slug.
 *
 * The review tick persists straight to Convex through its own endpoint, so the
 * dev shell's in-memory article set is deliberately left untouched — mutating
 * it would register a phantom pending change with the commit panel. This
 * overlay keeps the UI truthful until the next full data load.
 */
export type ReviewStatusOverrides = Record<string, ReviewStatus>;

function resolveArticleSlug(article: SubstanceArticle & { slug?: unknown }): string {
  const explicit = typeof article.slug === "string" ? article.slug.trim() : "";
  return (
    explicit || slugify(article.title || article.identification?.common_name || "")
  );
}

function resolveStatus(value: unknown): ReviewStatus {
  return value === "in_progress" || value === "completed" ? value : "needed";
}

/**
 * The launch review corpus: publicly listed articles in alphabetical order,
 * matching the coverage page's headline scope.
 */
export function buildReviewQueue(
  articles: readonly SubstanceArticle[],
  overrides: ReviewStatusOverrides = {},
): ReviewQueueEntry[] {
  return articles
    .flatMap((article) => {
      const slug = resolveArticleSlug(article);
      if (!slug) return [];
      const visibility = substanceVisibility({
        indexCategories: article.index_categories,
        priority: article.priority,
      });
      if (visibility !== "public") return [];
      return [
        {
          slug,
          name: article.title || article.identification?.common_name || slug,
          status: overrides[slug] ?? resolveStatus(article.editorial_review?.status),
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The entries the flip-through actually walks.
 *
 * With `unreviewedOnly`, completed articles drop out — except the one on
 * screen, so ticking an article never yanks it out from under the reviewer.
 * It leaves the queue on the next navigation instead.
 */
export function filterReviewQueue(
  entries: readonly ReviewQueueEntry[],
  options: { unreviewedOnly: boolean; currentSlug: string | null },
): ReviewQueueEntry[] {
  if (!options.unreviewedOnly) {
    return [...entries];
  }
  return entries.filter(
    (entry) => entry.status !== "completed" || entry.slug === options.currentSlug,
  );
}

/** Index of a slug in the queue, or 0 when it is absent (queue start). */
export function queueIndexOf(
  entries: readonly ReviewQueueEntry[],
  slug: string | null,
): number {
  if (!slug) return 0;
  const index = entries.findIndex((entry) => entry.slug === slug);
  return index >= 0 ? index : 0;
}

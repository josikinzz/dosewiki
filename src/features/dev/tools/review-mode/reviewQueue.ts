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
  /**
   * Fallback richness when no source stats are available for the slug: how
   * many bibliography entries the article itself carries.
   */
  referenceCount: number;
}

/**
 * A locally recorded review tick, keyed by slug.
 *
 * The tick persists straight to Convex through its own endpoint, so the dev
 * shell's in-memory article set is deliberately left untouched — mutating it
 * would register a phantom pending change with the commit panel. `baseStatus`
 * records what the article said when the tick happened: if the article's own
 * status later changes (an editor changed the review dropdown in the form and
 * applied it), the article wins and the stale tick stops shadowing it.
 */
export interface ReviewStatusOverride {
  status: ReviewStatus;
  baseStatus: ReviewStatus;
}

export type ReviewStatusOverrides = Record<string, ReviewStatusOverride>;

/** How the flip-through orders its queue. */
export type ReviewQueueOrder = "sources" | "home" | "alpha" | "alpha-desc";

export const REVIEW_QUEUE_ORDER_OPTIONS: Array<{
  value: ReviewQueueOrder;
  label: string;
}> = [
  { value: "sources", label: "Most source material" },
  { value: "home", label: "Home page order" },
  { value: "alpha", label: "A → Z" },
  { value: "alpha-desc", label: "Z → A" },
];

function resolveArticleSlug(article: SubstanceArticle & { slug?: unknown }): string {
  const explicit = typeof article.slug === "string" ? article.slug.trim() : "";
  return (
    explicit || slugify(article.title || article.identification?.common_name || "")
  );
}

function resolveStatus(value: unknown): ReviewStatus {
  return value === "in_progress" || value === "completed" ? value : "needed";
}

function resolveEntryStatus(
  articleStatus: ReviewStatus,
  override: ReviewStatusOverride | undefined,
): ReviewStatus {
  if (!override) return articleStatus;
  return articleStatus === override.baseStatus ? override.status : articleStatus;
}

/**
 * The launch review corpus: publicly listed articles, matching the coverage
 * page's headline scope. Ordering is applied separately by `sortReviewQueue`.
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
          status: resolveEntryStatus(
            resolveStatus(article.editorial_review?.status),
            overrides[slug],
          ),
          referenceCount:
            (article.references?.length ?? 0) +
            (article.source_citations?.length ?? 0) +
            (Array.isArray(article.citations) ? article.citations.length : 0),
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export interface ReviewQueueRanks {
  /** Total source-document tokens per slug, from `articleSources`. */
  sourceTokens?: Record<string, number>;
  /** Slugs in home-page order, flattened from the category layout. */
  homeOrder?: readonly string[];
}

/**
 * Order the queue without mutating it.
 *
 * `sources` ranks by scraped source material (token total), falling back to
 * the article's own bibliography size when a slug has no source stats — so
 * the default order stays meaningful even before the stats request lands.
 * `home` follows the public index layout; anything the layout does not place
 * trails alphabetically.
 */
export function sortReviewQueue(
  entries: readonly ReviewQueueEntry[],
  order: ReviewQueueOrder,
  ranks: ReviewQueueRanks = {},
): ReviewQueueEntry[] {
  const sorted = [...entries];

  if (order === "alpha") {
    return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (order === "alpha-desc") {
    return sorted.sort((a, b) => b.name.localeCompare(a.name));
  }

  if (order === "home") {
    const homeIndex = new Map<string, number>();
    (ranks.homeOrder ?? []).forEach((slug, index) => {
      if (!homeIndex.has(slug)) homeIndex.set(slug, index);
    });
    return sorted.sort((a, b) => {
      const aIndex = homeIndex.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = homeIndex.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.name.localeCompare(b.name);
    });
  }

  const richness = (entry: ReviewQueueEntry): number =>
    ranks.sourceTokens?.[entry.slug] ?? entry.referenceCount;
  return sorted.sort((a, b) => {
    const byRichness = richness(b) - richness(a);
    if (byRichness !== 0) return byRichness;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Slugs in the order the home page presents them: categories as laid out
 * (psychedelics first, on down), each category's sections in order, then its
 * unsectioned substances, deduplicated on first appearance.
 */
export function flattenHomeOrder(layout: {
  categories: Array<{
    sections: Array<{ drugs: string[] }>;
    drugs: string[];
  }>;
}): string[] {
  const seen = new Set<string>();
  const orderedSlugs: string[] = [];
  const push = (slug: string) => {
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    orderedSlugs.push(slug);
  };

  for (const category of layout.categories) {
    for (const section of category.sections) {
      section.drugs.forEach(push);
    }
    category.drugs.forEach(push);
  }

  return orderedSlugs;
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

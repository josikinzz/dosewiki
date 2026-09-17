import type { SubstanceArticle } from "@/schema";
import type { ReviewFlagSeverity } from "@/schema/substance/editorial";
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
  flagSummary?: ReviewFlagSummary | null;
  flags?: Array<{ label: string; severity: ReviewFlagSeverity }>;
}

export interface ReviewFlagSummary {
  count: number;
  highestSeverity: ReviewFlagSeverity;
}

/**
 * Master switch for the advisory Review Flags surface in the workbench:
 * picker badges, the flag filters, and flag-based grouping. Off by editorial
 * decision: the flag ledger is kept outside the workbench, and in the
 * workbench the badges pulled the reviewer's eye mid-read. The flags
 * stay in the queue data and the URL contract either way, so flipping this
 * back on restores the whole surface; while off, the consumers neutralize
 * any stored or URL-carried flag filter so a leftover setting cannot
 * silently shrink the queue.
 */
export const REVIEW_FLAGS_UI: boolean = false;

const FLAG_SEVERITY_RANK: Record<ReviewFlagSeverity, number> = {
  note: 0,
  minor: 1,
  major: 2,
};

export function deriveReviewFlagSummary(
  flags: SubstanceArticle["editorial_review"]["flags"],
): ReviewFlagSummary | null {
  if (!flags?.length) return null;
  const highestSeverity = flags.reduce<ReviewFlagSeverity>(
    (highest, flag) => FLAG_SEVERITY_RANK[flag.severity] > FLAG_SEVERITY_RANK[highest]
      ? flag.severity
      : highest,
    "note",
  );
  return { count: flags.length, highestSeverity };
}

/**
 * A locally recorded review tick, keyed by slug.
 *
 * The tick persists straight to Postgres through its own endpoint, so the dev
 * shell's in-memory article set is deliberately left untouched — mutating it
 * would register a phantom pending change with the commit panel. `baseStatus`
 * records what the article said when the tick happened: if the article's own
 * status later changes (an editor changed the review dropdown in the form and
 * applied it), the article wins and the stale tick stops shadowing it.
 */
export interface ReviewStatusOverride {
  status: ReviewStatus;
  baseStatus: ReviewStatus;
  /**
   * The `editorial_review` record Postgres returned for the tick. The queue only
   * needs `status`, but the rendered article, the citation panel, and the
   * editor form all read the whole object, and the working set will not carry
   * it until the slug re-hydrates or the library list refreshes, so the write
   * is kept here and overlaid.
   */
  review?: SubstanceArticle["editorial_review"];
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
 * A row carrying the library projection's precomputed bibliography size.
 * Slim editor-library rows have it; hydrated rows (and test fixtures) do not.
 */
interface ReferenceCounted { reference_count?: number; }

/**
 * How many bibliography entries back the article. The projected count wins
 * when the row carries it, so slim library rows and hydrated rows read
 * identically; otherwise sum the three arrays the whole article holds.
 */
function resolveReferenceCount(article: SubstanceArticle & ReferenceCounted): number {
  if (typeof article.reference_count === "number") return article.reference_count;
  return (
    (article.references?.length ?? 0) +
    (article.source_citations?.length ?? 0) +
    (Array.isArray(article.citations) ? article.citations.length : 0)
  );
}

/**
 * The article's review record as Postgres now holds it: the ticked one while the
 * override is still live, otherwise the article's own.
 *
 * Same shadowing rule as `resolveEntryStatus` — once the working set reports a
 * status other than the one the tick was made against, it has caught up (or an
 * editor moved it elsewhere) and the local record steps aside.
 */
export function resolveOverriddenEditorialReview(
  article: SubstanceArticle,
  override: ReviewStatusOverride | undefined,
): SubstanceArticle["editorial_review"] | null {
  if (!override?.review) return null;
  if (resolveStatus(article.editorial_review?.status) !== override.baseStatus) return null;
  return override.review;
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
          referenceCount: resolveReferenceCount(article),
          flagSummary: deriveReviewFlagSummary(article.editorial_review?.flags),
          flags: (article.editorial_review?.flags ?? []).map(({ label, severity }) => ({ label, severity })),
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Restrict the corpus to articles the home-page layout actually places.
 *
 * Unplaced articles used to trail the grouped picker as a "Not on the index"
 * holding pen, and every progress figure counted them. The launch pass reviews
 * the public index, so they are out of the corpus entirely — picker, arrows,
 * and counts all read from the filtered queue. An empty placement list keeps
 * the full queue: a layout that failed to arrive should degrade to reviewing
 * everything, not to an empty workbench.
 */
export function filterToPlacedSlugs(
  entries: readonly ReviewQueueEntry[],
  placedSlugs: readonly string[],
): ReviewQueueEntry[] {
  if (placedSlugs.length === 0) return [...entries];
  const placed = new Set(placedSlugs);
  return entries.filter((entry) => placed.has(entry.slug));
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

/** The slice of the Postgres category layout the grouped picker needs. */
export interface ReviewGroupLayout {
  categories: Array<{
    key: string;
    label: string;
    iconKey?: string;
    sections: Array<{ key: string; label: string; drugs: string[] }>;
    drugs: string[];
  }>;
}

/** One chemical-class subsection inside a psychoactive category. */
interface ReviewQueueSection { key: string;
label: string;
entries: ReviewQueueEntry[]; }

/** One psychoactive category — the top level of the grouped picker. */
export interface ReviewQueueGroup {
  key: string;
  label: string;
  iconKey?: string;
  sections: ReviewQueueSection[];
  /** Entries the layout places in the category but in no subsection. */
  entries: ReviewQueueEntry[];
  /** Every entry under the group, sections included. */
  count: number;
}

/** Slugs the layout never places, so they still have somewhere to live. */
export const UNPLACED_GROUP_KEY = "__unplaced";

interface EntryPlacement {
  categoryIndex: number;
  /** -1 for a drug listed directly on the category, outside any section. */
  sectionIndex: number;
}

/**
 * The queue as the home page arranges it: psychoactive categories in layout
 * order, each holding its chemical-class subsections.
 *
 * Entries keep the order they arrive in, so the grouping composes with whatever
 * `sortReviewQueue` did rather than overriding it. A slug the layout lists twice
 * belongs to its first placement only — the same first-appearance rule
 * `flattenHomeOrder` uses, so the grouped and flat views agree on the corpus.
 * Empty categories and subsections are dropped; anything the layout does not
 * place at all trails in one final group.
 */
export function buildReviewGroups(
  entries: readonly ReviewQueueEntry[],
  layout: ReviewGroupLayout,
): ReviewQueueGroup[] {
  const placements = new Map<string, EntryPlacement>();
  layout.categories.forEach((category, categoryIndex) => {
    const place = (slug: string, sectionIndex: number) => {
      if (!slug || placements.has(slug)) return;
      placements.set(slug, { categoryIndex, sectionIndex });
    };
    category.sections.forEach((section, sectionIndex) => {
      section.drugs.forEach((slug) => place(slug, sectionIndex));
    });
    category.drugs.forEach((slug) => place(slug, -1));
  });

  const buckets = layout.categories.map((category) => ({
    sections: category.sections.map(() => [] as ReviewQueueEntry[]),
    loose: [] as ReviewQueueEntry[],
  }));
  const unplaced: ReviewQueueEntry[] = [];

  for (const entry of entries) {
    const placement = placements.get(entry.slug);
    if (!placement) {
      unplaced.push(entry);
      continue;
    }
    const bucket = buckets[placement.categoryIndex];
    if (placement.sectionIndex < 0) bucket.loose.push(entry);
    else bucket.sections[placement.sectionIndex].push(entry);
  }

  const groups: ReviewQueueGroup[] = [];
  layout.categories.forEach((category, categoryIndex) => {
    const bucket = buckets[categoryIndex];
    const sections = category.sections.flatMap((section, sectionIndex) => {
      const sectionEntries = bucket.sections[sectionIndex];
      if (sectionEntries.length === 0) return [];
      return [{ key: section.key, label: section.label, entries: sectionEntries }];
    });
    const count =
      bucket.loose.length +
      sections.reduce((total, section) => total + section.entries.length, 0);
    if (count === 0) return;
    groups.push({
      key: category.key,
      label: category.label,
      iconKey: category.iconKey,
      sections,
      entries: bucket.loose,
      count,
    });
  });

  if (unplaced.length > 0) {
    groups.push({
      key: UNPLACED_GROUP_KEY,
      label: "Not on the index",
      sections: [],
      entries: unplaced,
      count: unplaced.length,
    });
  }

  return groups;
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
  options: { unreviewedOnly: boolean; currentSlug: string | null; flagLabels?: readonly string[]; flagSeverity?: ReviewFlagSeverity | null },
): ReviewQueueEntry[] {
  const labels = new Set(options.flagLabels ?? []);
  return entries.filter((entry) => {
    if (options.unreviewedOnly && entry.status === "completed" && entry.slug !== options.currentSlug) return false;
    if (labels.size > 0 && !entry.flags?.some((flag) => labels.has(flag.label))) return false;
    if (options.flagSeverity && !entry.flags?.some((flag) => flag.severity === options.flagSeverity)) return false;
    return true;
  });
}

/** Distinct exact Flag Labels currently represented in the queue corpus. */
export function deriveReviewFlagLabels(entries: readonly ReviewQueueEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => (entry.flags ?? []).map((flag) => flag.label)))].sort((a, b) => a.localeCompare(b));
}

export function buildReviewFlagGroups(entries: readonly ReviewQueueEntry[], by: "severity" | "label"): ReviewQueueGroup[] {
  const values = by === "severity"
    ? (["major", "minor", "note"] as const).filter((value) => entries.some((entry) => entry.flags?.some((flag) => flag.severity === value)))
    : deriveReviewFlagLabels(entries);
  return values.map((value) => {
    const grouped = entries.filter((entry) => entry.flags?.some((flag) => by === "severity" ? flag.severity === value : flag.label === value));
    return { key: `${by}:${value}`, label: value, sections: [], entries: grouped, count: grouped.length };
  });
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

import type { SubstanceArticle } from "@/schema";
import {
  deriveReviewState,
  type ReviewFlagSeverity,
  type ReviewState,
} from "@/schema/substance/editorial";
import { substanceVisibility } from "@/schema/substance/substanceVisibilityPolicy";
import { resolveEditorArticleSlug } from "../../context/devModeUtils";
import type { ReviewStatus } from "../substance-editor/types";

export interface ReviewQueueEntry {
  slug: string;
  name: string;
  status: ReviewState;
  reviewedRevision?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  recommendedBy?: string;
  referenceCount: number;
  flagSummary?: ReviewFlagSummary | null;
  flags?: Array<{ label: string; severity: ReviewFlagSeverity }>;
}

export interface ReviewFlagSummary {
  count: number;
  highestSeverity: ReviewFlagSeverity;
}

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

export interface ReviewStatusOverride {
  status: ReviewStatus;
  baseStatus: ReviewStatus;
  review?: SubstanceArticle["editorial_review"];
}

export type ReviewStatusOverrides = Record<string, ReviewStatusOverride>;

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

interface ReferenceCounted { reference_count?: number; }

function resolveReferenceCount(article: SubstanceArticle & ReferenceCounted): number {
  if (typeof article.reference_count === "number") return article.reference_count;
  return (
    (article.references?.length ?? 0) +
    (article.source_citations?.length ?? 0) +
    (Array.isArray(article.citations) ? article.citations.length : 0)
  );
}

export function resolveOverriddenEditorialReview(
  article: SubstanceArticle,
  override: ReviewStatusOverride | undefined,
): SubstanceArticle["editorial_review"] | null {
  if (!override?.review) return null;
  if (resolveStatus(article.editorial_review?.status) !== override.baseStatus) return null;
  return override.review;
}

export function signOffCredit(entry: Pick<ReviewQueueEntry, "reviewedBy" | "recommendedBy">): string | null {
  if (!entry.reviewedBy) return null;
  return entry.recommendedBy
    ? `Recommended by ${entry.recommendedBy}, approved by ${entry.reviewedBy}`
    : `Reviewed by ${entry.reviewedBy}`;
}

export type PublishedRevisions = Readonly<Record<string, string>>;

export function buildReviewQueue(
  articles: readonly SubstanceArticle[],
  overrides: ReviewStatusOverrides = {},
  publishedRevisions: PublishedRevisions | null = null,
): ReviewQueueEntry[] {
  return articles
    .flatMap((article) => {
      const slug = resolveEditorArticleSlug(article);
      if (!slug) return [];
      const visibility = substanceVisibility({
        indexCategories: article.index_categories,
        priority: article.priority,
      });
      if (visibility === "hidden") return [];
      const status = resolveEntryStatus(
        resolveStatus(article.editorial_review?.status),
        overrides[slug],
      );
      const review = resolveOverriddenEditorialReview(article, overrides[slug]) ?? article.editorial_review;
      const signed = status === "completed" ? review?.reviewed_revision : undefined;
      const published = publishedRevisions?.[slug];
      return [
        {
          slug,
          name: article.title || article.identification?.common_name || slug,
          status: published && signed
            ? deriveReviewState({ status, reviewed_revision: signed }, published)
            : status,
          ...(signed ? { reviewedRevision: signed } : {}),
          ...(signed && review?.reviewed_by ? { reviewedBy: review.reviewed_by } : {}),
          ...(signed && review?.reviewed_at ? { reviewedAt: review.reviewed_at } : {}),
          ...(signed && review?.recommended_by ? { recommendedBy: review.recommended_by } : {}),
          referenceCount: resolveReferenceCount(article),
          flagSummary: deriveReviewFlagSummary(article.editorial_review?.flags),
          flags: (article.editorial_review?.flags ?? []).map(({ label, severity }) => ({ label, severity })),
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export interface ReviewQueueRanks {
  sourceTokens?: Record<string, number>;
  homeOrder?: readonly string[];
}

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

export interface ReviewGroupLayout {
  categories: Array<{
    key: string;
    label: string;
    iconKey?: string;
    sections: Array<{ key: string; label: string; drugs: string[] }>;
    drugs: string[];
  }>;
}

interface ReviewQueueSection { key: string;
label: string;
entries: ReviewQueueEntry[]; }

export interface ReviewQueueGroup {
  key: string;
  label: string;
  iconKey?: string;
  sections: ReviewQueueSection[];
  entries: ReviewQueueEntry[];
  count: number;
}

export const UNPLACED_GROUP_KEY = "__unplaced";

interface EntryPlacement {
  categoryIndex: number;
  sectionIndex: number;
}

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
      label: "Unplaced",
      sections: [],
      entries: unplaced,
      count: unplaced.length,
    });
  }

  return groups;
}

export function filterReviewQueue(
  entries: readonly ReviewQueueEntry[],
  options: {
    unreviewedOnly: boolean;
    currentSlug: string | null;
    changedSinceReview?: boolean;
    flagLabels?: readonly string[];
    flagSeverity?: ReviewFlagSeverity | null;
  },
): ReviewQueueEntry[] {
  const labels = new Set(options.flagLabels ?? []);
  return entries.filter((entry) => {
    if (options.unreviewedOnly && entry.status === "completed" && entry.slug !== options.currentSlug) return false;
    if (options.changedSinceReview && entry.status !== "stale" && entry.slug !== options.currentSlug) return false;
    if (labels.size > 0 && !entry.flags?.some((flag) => labels.has(flag.label))) return false;
    if (options.flagSeverity && !entry.flags?.some((flag) => flag.severity === options.flagSeverity)) return false;
    return true;
  });
}

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

export const CHANGED_SINCE_REVIEW_GROUP_KEY = "__changed-since-review";

export function buildChangedSinceReviewGroups(entries: readonly ReviewQueueEntry[]): ReviewQueueGroup[] {
  if (entries.length === 0) return [];
  return [{
    key: CHANGED_SINCE_REVIEW_GROUP_KEY,
    label: "Changed since review",
    sections: [],
    entries: [...entries],
    count: entries.length,
  }];
}

export function queueIndexOf(
  entries: readonly ReviewQueueEntry[],
  slug: string | null,
): number {
  if (!slug) return 0;
  const index = entries.findIndex((entry) => entry.slug === slug);
  return index >= 0 ? index : 0;
}

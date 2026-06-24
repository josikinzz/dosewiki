import { slugify } from "./substanceIngestion";
import { getDefaultEditorialReview, type SubstanceArticle } from "../../src/schema";

export type SubstancePriority = "high" | "normal" | "low";

type SubstanceArticleRecord = Omit<SubstanceArticle, "priority" | "editorial_review" | "references"> & {
  slug?: string;
  priority?: SubstancePriority | null;
  editorial_review?: SubstanceArticle["editorial_review"];
  references?: SubstanceArticle["references"];
};

export type SubstanceLookupProjection = {
  slug: string;
  name: string;
  priority: SubstancePriority;
};

export type SubstancePublicPreviewProjection = {
  title: string;
  slug: string;
  summary: string;
  priority: SubstancePriority;
  indexCategories: string[];
};

export type SubstanceLibraryInputProjection = SubstancePublicArticleProjection;

export type SubstanceSearchInputProjection = {
  title: string;
  slug: string;
  priority: SubstancePriority;
  index_categories: string[];
  identification?: unknown;
  classification?: unknown;
  pharmacology?: unknown;
  subjective_effects?: unknown;
};

export type SubstanceRandomPreviewProjection = SubstancePublicPreviewProjection;
export type SubstancePublicArticleProjection = Omit<SubstanceArticleRecord, "editorial_review" | "references"> & {
  slug: string;
  priority: SubstancePriority;
  references: SubstanceArticle["references"];
  /**
   * Public-safe derivation of the editor-only `editorial_review` field: `true`
   * only when an editor has marked the article's review as completed. The full
   * `editorial_review` object (including private notes) is never exposed.
   */
  expert_reviewed: boolean;
};
export type SubstanceEditorArticleProjection = SubstanceArticleRecord & {
  slug: string;
  priority: SubstancePriority;
  editorial_review: SubstanceArticle["editorial_review"];
  references: SubstanceArticle["references"];
};

export const normalizeSubstancePriority = (
  priority: SubstanceArticleRecord["priority"],
): SubstancePriority => priority ?? "normal";

export const resolveSubstanceSlug = (article: Pick<SubstanceArticleRecord, "slug" | "title">): string =>
  article.slug ?? slugify(article.title);

export const trimSubstanceExcerpt = (value: unknown, maxLength = 200): string => {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

export function projectLookup(article: SubstanceArticleRecord): SubstanceLookupProjection {
  return {
    slug: resolveSubstanceSlug(article),
    name: article.title,
    priority: normalizeSubstancePriority(article.priority),
  };
}

export function projectPublicPreview(article: SubstanceArticleRecord): SubstancePublicPreviewProjection {
  return {
    title: article.title,
    slug: resolveSubstanceSlug(article),
    summary: trimSubstanceExcerpt(article.summary, 200),
    priority: normalizeSubstancePriority(article.priority),
    indexCategories: article.index_categories,
  };
}

export function projectLibraryInput(article: SubstanceArticleRecord): SubstanceLibraryInputProjection {
  return projectPublicArticle(article);
}

export function projectSearchInput(article: SubstanceArticleRecord): SubstanceSearchInputProjection {
  return {
    title: article.title,
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
    index_categories: article.index_categories,
    identification: article.identification,
    classification: article.classification,
    pharmacology: article.pharmacology,
    subjective_effects: article.subjective_effects,
  };
}

export const isCompletedEditorialReview = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as { status?: unknown }).status === "completed";

export function projectPublicArticle(article: SubstanceArticleRecord): SubstancePublicArticleProjection {
  const { editorial_review: editorialReview, ...publicArticle } = article;
  return {
    ...publicArticle,
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
    references: article.references ?? [],
    expert_reviewed: isCompletedEditorialReview(editorialReview),
  };
}

export function projectEditorArticle(article: SubstanceArticleRecord): SubstanceEditorArticleProjection {
  return {
    ...article,
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
    editorial_review: article.editorial_review ?? getDefaultEditorialReview(),
    references: article.references ?? [],
  };
}

export const compareSubstancePreviews = (
  left: SubstancePublicPreviewProjection,
  right: SubstancePublicPreviewProjection,
) => {
  const priorityScore: Record<SubstancePriority, number> = {
    high: 0,
    normal: 1,
    low: 2,
  };
  const priorityDelta = priorityScore[left.priority] - priorityScore[right.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return left.title.localeCompare(right.title);
};

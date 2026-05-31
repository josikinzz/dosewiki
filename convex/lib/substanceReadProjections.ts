import { slugify } from "./substanceIngestion";
import type { SubstanceArticle } from "../../src/schema";

export type SubstancePriority = "high" | "normal" | "low";

type SubstanceArticleRecord = Omit<SubstanceArticle, "priority" | "editorial_review" | "references"> & {
  slug?: string;
  priority?: SubstancePriority | null;
  editorial_review?: unknown;
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
};
export type SubstanceEditorArticleProjection = SubstanceArticleRecord & {
  slug: string;
  priority: SubstancePriority;
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

export function projectPublicArticle(article: SubstanceArticleRecord): SubstancePublicArticleProjection {
  const { editorial_review: _editorialReview, ...publicArticle } = article;
  return {
    ...publicArticle,
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
    references: article.references ?? [],
  };
}

export function projectEditorArticle(article: SubstanceArticleRecord): SubstanceEditorArticleProjection {
  return {
    ...article,
    slug: resolveSubstanceSlug(article),
    priority: normalizeSubstancePriority(article.priority),
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

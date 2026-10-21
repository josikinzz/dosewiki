import { PostgresError, v } from "../../lib/postgres/runtime/values";
import type { PublicSubstanceCoverageRow } from "../../lib/postgres/runtime/projectionReads";
import { normalizeSubstancePriority, resolveSubstanceSlug } from "../../src/data/projections/substanceProjectionCore";
import {
  buildCoverageRow,
  type getCoverageColumns,
  type CoverageArticleInput,
  type CoverageRow,
} from "../../src/features/coverage/coverageModel";
import { normalizePharmacologySection } from "../../lib/article/normalization.mjs";
import { EDITORIAL_REVIEW_DEFAULT } from "../../src/schema/substance/editorialReviewVisibilityPolicy";

const RETIRED_CORPUS_OPERATION_MESSAGE =
  "Whole-corpus substance operations are retired. Use the bounded pagination endpoints and guarded per-article/CAS write workflows.";

const RETIRED_RANDOM_SAMPLE_MESSAGE =
  "The random-sample query is retired because its fallback paths require unbounded corpus reads. Use a bounded preview endpoint.";

export function rejectRetiredRandomSample(): never {
  throw new PostgresError({
    code: "BOUNDED_PAGINATION_REQUIRED",
    message: RETIRED_RANDOM_SAMPLE_MESSAGE,
  });
}

export function rejectWholeCorpusProjection(): never {
  throw new PostgresError({
    code: "BOUNDED_PAGINATION_REQUIRED",
    message: RETIRED_CORPUS_OPERATION_MESSAGE,
  });
}

export function rejectRetiredBulkReplacement(): never {
  throw new PostgresError({
    code: "BULK_REPLACEMENT_RETIRED",
    message: RETIRED_CORPUS_OPERATION_MESSAGE,
  });
}

const SCRIPT_CORPUS_PAGE_SIZE = 32;

export function clampScriptCorpusPageSize(requested: number): number {
  const normalized = Number.isFinite(requested) ? Math.floor(requested) : SCRIPT_CORPUS_PAGE_SIZE;
  return Math.min(Math.max(normalized, 1), SCRIPT_CORPUS_PAGE_SIZE);
}

function pickDefinedReferenceMetadata(reference: Record<string, unknown>) {
  const projected: Record<string, unknown> = {};
  for (const field of ["id", "title", "doi", "pmid", "isbn", "url", "authors", "metadataProvenance"] as const) {
    if (reference[field] !== undefined) projected[field] = reference[field];
  }
  return projected;
}

export function projectReferenceMetadataArticle(article: Record<string, unknown>) {
  return {
    slug: article.slug,
    title: article.title,
    references: Array.isArray(article.references)
      ? article.references.map((value) => pickDefinedReferenceMetadata(value as Record<string, unknown>))
      : [],
  };
}

const PUBLIC_CORPUS_PAGE_SIZE = 32;
const PUBLIC_CORPUS_MAX_PAGE_SIZE = 200;
export const publicCorpusPageArgs = {
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
};

export function clampPublicCorpusPageSize(requested: number | undefined): number {
  const normalized = Math.floor(requested ?? PUBLIC_CORPUS_PAGE_SIZE);
  return Math.min(Math.max(normalized, 1), PUBLIC_CORPUS_MAX_PAGE_SIZE);
}

const PUBLIC_SLUG_PAGE_SIZE = 160;
const PUBLIC_SLUG_PAGE_MAX_SIZE = 400;

export function clampPublicSlugPageSize(requested: number | undefined): number {
  const normalized = Math.floor(requested ?? PUBLIC_SLUG_PAGE_SIZE);
  return Math.min(Math.max(normalized, 1), PUBLIC_SLUG_PAGE_MAX_SIZE);
}

export function projectPublicCoverageRow(
  row: PublicSubstanceCoverageRow,
  columns: ReturnType<typeof getCoverageColumns>,
): CoverageRow {
  const review = row.editorial_review;
  const expertReviewed =
    typeof review === "object" &&
    review !== null &&
    "status" in review &&
    review.status === "completed";
  const coverageInput = {
    ...row,
    pharmacology: normalizePharmacologySection(row.pharmacology),
    slug: resolveSubstanceSlug(row),
    priority: normalizeSubstancePriority(row.priority),
    expert_reviewed: expertReviewed,
    editorial_review: row.editorial_review ?? EDITORIAL_REVIEW_DEFAULT,
    references: row.references ?? [],
  } as unknown as CoverageArticleInput;
  return buildCoverageRow(coverageInput, columns);
}

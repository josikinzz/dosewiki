import type { SubstanceArticle } from "../../schema";

/**
 * Server-side builder for the About page's "archival SubstanceIndex.json" preview.
 *
 * Previously the page serialized 12 *complete* SubstanceArticle objects
 * (~373 KB / ~77 KB gz) into the client RSC payload just to show one truncated.
 * We now pre-serialize on the server and ship only the rendered snapshots:
 * the smallest articles ship complete (so the preview always contains whole
 * records) until {@link ABOUT_PREVIEW_TOTAL_BYTE_BUDGET} is spent, and the
 * rest are truncated to {@link ABOUT_PREVIEW_LINE_LIMIT} lines.
 *
 * `import type { SubstanceArticle }` is erased at compile time, so importing this module
 * does NOT pull the Zod schema graph into any client bundle.
 */

export const ABOUT_PREVIEW_LINE_LIMIT = 96;

/**
 * Total pretty-printed bytes allowed for complete articles across all
 * snapshots (~64 KB ≈ 12 KB gz). The smallest article is always shipped
 * complete even if it alone exceeds the budget, so the preview is guaranteed
 * to contain at least one whole record.
 */
const ABOUT_PREVIEW_TOTAL_BYTE_BUDGET = 64 * 1024;

/** Canonical field order, mirrored from substance.schema.ts. */
const ARTICLE_FIELD_ORDER = [
  "id", "title", "priority", "index_categories", "identification", "classification",
  "summary", "dosage", "duration", "subjective_effects", "comparisons", "pharmacology",
  "interactions", "reagent_testing", "tolerance", "harm_potential", "history_culture",
  "legality", "source_citations", "citations",
] as const;

export interface AboutPreviewSnapshot {
  /** Pretty-printed JSON, truncated to at most ABOUT_PREVIEW_LINE_LIMIT lines. */
  json: string;
  /** Whether the full article had more lines than the preview shows. */
  truncated: boolean;
}

function reorderArticleFields(article: SubstanceArticle): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of ARTICLE_FIELD_ORDER) {
    if (key in article) ordered[key] = article[key as keyof SubstanceArticle];
  }
  for (const key of Object.keys(article)) {
    if (!(key in ordered)) ordered[key] = article[key as keyof SubstanceArticle];
  }
  return ordered;
}

function serializeArticle(article: SubstanceArticle): string {
  return JSON.stringify(reorderArticleFields(article), null, 2);
}

function truncateToLineLimit(json: string): AboutPreviewSnapshot {
  const lines = json.split("\n");
  const truncated = lines.length > ABOUT_PREVIEW_LINE_LIMIT;
  return {
    json: (truncated ? lines.slice(0, ABOUT_PREVIEW_LINE_LIMIT) : lines).join("\n"),
    truncated,
  };
}

export function buildAboutPreviewSnapshots(
  articles: SubstanceArticle[],
): AboutPreviewSnapshot[] {
  const serialized = articles.map(serializeArticle);

  // Spend the byte budget on the smallest articles first; display order is preserved.
  const bySizeAscending = serialized
    .map((json, index) => ({ index, bytes: json.length }))
    .sort((left, right) => left.bytes - right.bytes);

  const complete = new Set<number>();
  let remaining = ABOUT_PREVIEW_TOTAL_BYTE_BUDGET;
  for (const { index, bytes } of bySizeAscending) {
    // The first (smallest) article always ships whole — the preview's purpose
    // is to show at least one real, complete record.
    if (complete.size > 0 && bytes > remaining) break;
    complete.add(index);
    remaining -= bytes;
  }

  return serialized.map((json, index) =>
    complete.has(index) ? { json, truncated: false } : truncateToLineLimit(json),
  );
}

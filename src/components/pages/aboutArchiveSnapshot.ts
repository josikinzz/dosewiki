import type { SubstanceArticle } from "../../schema";

export const ABOUT_PREVIEW_LINE_LIMIT = 96;

const ABOUT_PREVIEW_TOTAL_BYTE_BUDGET = 64 * 1024;

const ARTICLE_FIELD_ORDER = [
  "id", "title", "priority", "index_categories", "identification", "classification",
  "summary", "dosage", "duration", "subjective_effects", "comparisons", "pharmacology",
  "interactions", "reagent_testing", "tolerance", "harm_potential", "history_culture",
  "legality", "source_citations", "citations",
] as const;

export interface AboutPreviewSnapshot {
  json: string;
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

  const bySizeAscending = serialized
    .map((json, index) => ({ index, bytes: json.length }))
    .sort((left, right) => left.bytes - right.bytes);

  const complete = new Set<number>();
  let remaining = ABOUT_PREVIEW_TOTAL_BYTE_BUDGET;
  for (const { index, bytes } of bySizeAscending) {
    if (complete.size > 0 && bytes > remaining) break;
    complete.add(index);
    remaining -= bytes;
  }

  return serialized.map((json, index) =>
    complete.has(index) ? { json, truncated: false } : truncateToLineLimit(json),
  );
}

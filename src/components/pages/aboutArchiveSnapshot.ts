import type { SubstanceArticle } from "../../schema";

/**
 * Server-side builder for the About page's "archival SubstanceIndex.json" preview.
 *
 * The preview only ever renders the first {@link ABOUT_PREVIEW_LINE_LIMIT} lines of a
 * single article's JSON. Previously the page serialized 12 *complete* SubstanceArticle
 * objects (~373 KB / ~77 KB gz) into the client RSC payload just to show one truncated.
 * We now pre-serialize and truncate on the server and ship only the rendered snapshots.
 *
 * `import type { SubstanceArticle }` is erased at compile time, so importing this module
 * does NOT pull the Zod schema graph into any client bundle.
 */

export const ABOUT_PREVIEW_LINE_LIMIT = 96;

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

export function buildAboutPreviewSnapshot(article: SubstanceArticle): AboutPreviewSnapshot {
  const lines = JSON.stringify(reorderArticleFields(article), null, 2).split("\n");
  const truncated = lines.length > ABOUT_PREVIEW_LINE_LIMIT;
  return {
    json: (truncated ? lines.slice(0, ABOUT_PREVIEW_LINE_LIMIT) : lines).join("\n"),
    truncated,
  };
}

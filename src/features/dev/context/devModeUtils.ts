import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { SubstanceArticle } from "@/schema";

export const EMPTY_INDEX_CONFIG: ManualIndexConfig = { version: 1, categories: [] };

/**
 * The slug an editor surface knows an article by, or null when the row has none.
 *
 * Every Postgres editor projection (the library list rows and the per-slug
 * hydration) attaches the stored `slug`, so this reads that and nothing else.
 * There is no title fallback: a slug guessed from a title can name a different
 * article than the one stored under it, and the library list and the hydrated
 * article have to agree exactly or a hydrated article never finds its row.
 */
export const resolveEditorArticleSlug = (article: SubstanceArticle | { slug?: unknown }): string | null => {
  const stored = (article as { slug?: unknown }).slug;
  const slug = typeof stored === "string" ? stored.trim() : "";
  return slug || null;
};

/**
 * Copies one document node — a single article, one manual index config — so it
 * can be handed to a mutating consumer without touching shared editor state.
 * Never clone a whole corpus with this; the editor session shares structure
 * precisely so that a per-article edit stays a per-article cost.
 */
export const deepClone = <T,>(value: T): T => {
  if (value === undefined || value === null || typeof value !== "object") {
    return value;
  }

  try {
    return structuredClone(value);
  } catch {
    // Non-structured-cloneable payloads (functions, class instances) still get
    // the old JSON round trip, which drops them exactly as it always did.
    return JSON.parse(JSON.stringify(value)) as T;
  }
};

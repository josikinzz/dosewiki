import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { SubstanceArticle } from "@/schema";
import { slugify } from "@/utils/slug";

export const EMPTY_INDEX_CONFIG: ManualIndexConfig = { version: 1, categories: [] };

/**
 * The slug an editor surface knows an article by.
 *
 * Postgres projections attach a resolved `slug`, but the article schema itself
 * has none, so every editor picker falls back to slugifying the title. The
 * library list and the on-demand article hydration have to agree on this
 * exactly, or a hydrated article would never find the row it belongs to.
 */
export const resolveEditorArticleSlug = (article: SubstanceArticle): string => {
  const explicitSlug = "slug" in article && typeof article.slug === "string"
    ? article.slug.trim()
    : "";

  return explicitSlug || slugify(article.title || article.identification?.common_name || "");
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

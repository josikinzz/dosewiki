import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { SubstanceArticle } from "@/schema";

export const EMPTY_INDEX_CONFIG: ManualIndexConfig = { version: 1, categories: [] };

export const resolveEditorArticleSlug = (article: SubstanceArticle | { slug?: unknown }): string | null => {
  const stored = (article as { slug?: unknown }).slug;
  const slug = typeof stored === "string" ? stored.trim() : "";
  return slug || null;
};

export const deepClone = <T,>(value: T): T => {
  if (value === undefined || value === null || typeof value !== "object") {
    return value;
  }

  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
};

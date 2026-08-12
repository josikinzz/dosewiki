import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";

export const EMPTY_INDEX_CONFIG: ManualIndexConfig = { version: 1, categories: [] };

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

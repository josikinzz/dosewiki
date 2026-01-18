/**
 * Lazy substance index loader with caching.
 *
 * For standard builds: dynamically fetches SubstanceIndex.compressed and decompresses on first access.
 * For inline builds: uses synchronously bundled data (defined via VITE_INLINE_BUILD env).
 *
 * This module provides both sync and async access patterns to support different build modes.
 */

import { z } from "zod";
import { substanceArticleSchema, type SubstanceArticle } from "../schema";
import { decompressFromBase64 } from "../utils/lzString";

// Cached substance index after loading
let substanceIndexCache: SubstanceArticle[] | null = null;
let substanceIndexPromise: Promise<SubstanceArticle[]> | null = null;

// For inline builds, we need synchronous access
let syncSubstanceIndexLoaded = false;

const getSubstanceIndexCompressedUrl = (): string => {
  const baseUrl = import.meta.env?.BASE_URL || "/";
  return baseUrl.endsWith("/") ? `${baseUrl}SubstanceIndex.compressed.txt` : `${baseUrl}/SubstanceIndex.compressed.txt`;
};

async function fetchCompressedBase64(): Promise<string> {
  const response = await fetch(getSubstanceIndexCompressedUrl());
  if (!response.ok) {
    throw new Error(`Failed to fetch compressed substance index: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Parse and validate decompressed substance data.
 */
function parseSubstanceIndex(decoded: string): SubstanceArticle[] {
  const parsed = JSON.parse(decoded);
  const result = z.array(substanceArticleSchema).safeParse(parsed);

  if (!result.success) {
    const isTestEnv = import.meta.env?.MODE === "test" || import.meta.env?.VITEST;
    if (!isTestEnv) {
      console.warn("Substance validation warnings:", result.error.issues);
    }
  }

  return result.success ? result.data : parsed;
}

/**
 * Load substance index asynchronously (standard builds).
 * Returns cached data if already loaded.
 */
export async function loadSubstanceIndex(): Promise<SubstanceArticle[]> {
  // Return cached data if available
  if (substanceIndexCache !== null) {
    return substanceIndexCache;
  }

  // Return existing promise if loading is in progress
  if (substanceIndexPromise !== null) {
    return substanceIndexPromise;
  }

  // Start async load
  substanceIndexPromise = (async () => {
    const compressedBase64 = await fetchCompressedBase64();
    const decoded = decompressFromBase64(compressedBase64);

    if (decoded === null) {
      throw new Error("Failed to decompress substance index dataset");
    }

    substanceIndexCache = parseSubstanceIndex(decoded);
    return substanceIndexCache;
  })();

  return substanceIndexPromise;
}

/**
 * Load substance index synchronously (inline builds only).
 * This is used when VITE_INLINE_BUILD is true.
 */
export function loadSubstanceIndexSync(): SubstanceArticle[] {
  if (substanceIndexCache !== null) {
    return substanceIndexCache;
  }

  if (syncSubstanceIndexLoaded) {
    // Already attempted sync load but cache is empty - return empty array
    return [];
  }

  // For sync loading, we need the compressed data to be available
  // This only works in inline builds where everything is bundled
  throw new Error(
    "Synchronous substance index loading is only available in inline builds. " +
    "Use loadSubstanceIndex() for async loading in standard builds."
  );
}

/**
 * Check if substance index has been loaded.
 */
export function isSubstanceIndexLoaded(): boolean {
  return substanceIndexCache !== null;
}

/**
 * Get cached substance index if available, or null if not yet loaded.
 */
export function getSubstanceIndexIfLoaded(): SubstanceArticle[] | null {
  return substanceIndexCache;
}

/**
 * Preload substance index in the background.
 * Call this early to start loading before the data is needed.
 */
export function preloadSubstanceIndex(): void {
  if (substanceIndexCache === null && substanceIndexPromise === null) {
    loadSubstanceIndex().catch((error) => {
      console.error("Failed to preload substance index:", error);
    });
  }
}

/**
 * Initialize with synchronous data (for inline builds).
 * This allows the inline build to inject pre-bundled data.
 */
export function initializeWithSyncData(compressedBase64: string): SubstanceArticle[] {
  if (substanceIndexCache !== null) {
    return substanceIndexCache;
  }

  const decoded = decompressFromBase64(compressedBase64);
  if (decoded === null) {
    throw new Error("Failed to decompress substance index dataset");
  }

  substanceIndexCache = parseSubstanceIndex(decoded);
  syncSubstanceIndexLoaded = true;
  return substanceIndexCache;
}

/**
 * Clear the cache (mainly for testing).
 */
export function clearSubstanceIndexCache(): void {
  substanceIndexCache = null;
  substanceIndexPromise = null;
  syncSubstanceIndexLoaded = false;
}

/**
 * Set the substance index cache directly (for Convex integration).
 * This allows external sources to populate the cache.
 */
export function setSubstanceIndexCache(substances: SubstanceArticle[]): void {
  substanceIndexCache = substances;
}

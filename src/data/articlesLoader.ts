/**
 * Lazy article loader with caching.
 *
 * For standard builds: dynamically imports articles.compressed and decompresses on first access.
 * For inline builds: uses synchronously bundled data (defined via VITE_INLINE_BUILD env).
 *
 * This module provides both sync and async access patterns to support different build modes.
 */

import { z } from "zod";
import { substanceArticleSchema, type SubstanceArticle } from "../schema";
import { decompressFromBase64 } from "../utils/lzString";

// Cached articles after loading
let articlesCache: SubstanceArticle[] | null = null;
let articlesPromise: Promise<SubstanceArticle[]> | null = null;

// For inline builds, we need synchronous access
let syncArticlesLoaded = false;

const getArticlesCompressedUrl = (): string => {
  const baseUrl = import.meta.env?.BASE_URL || "/";
  return baseUrl.endsWith("/") ? `${baseUrl}articles.compressed.txt` : `${baseUrl}/articles.compressed.txt`;
};

async function fetchCompressedBase64(): Promise<string> {
  const response = await fetch(getArticlesCompressedUrl());
  if (!response.ok) {
    throw new Error(`Failed to fetch compressed articles: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Parse and validate decompressed article data.
 */
function parseArticles(decoded: string): SubstanceArticle[] {
  const parsed = JSON.parse(decoded);
  const result = z.array(substanceArticleSchema).safeParse(parsed);

  if (!result.success) {
    const isTestEnv = import.meta.env?.MODE === "test" || import.meta.env?.VITEST;
    if (!isTestEnv) {
      console.warn("Article validation warnings:", result.error.issues);
    }
  }

  return result.success ? result.data : parsed;
}

/**
 * Load articles asynchronously (standard builds).
 * Returns cached data if already loaded.
 */
export async function loadArticles(): Promise<SubstanceArticle[]> {
  // Return cached data if available
  if (articlesCache !== null) {
    return articlesCache;
  }

  // Return existing promise if loading is in progress
  if (articlesPromise !== null) {
    return articlesPromise;
  }

  // Start async load
  articlesPromise = (async () => {
    const articlesCompressedBase64 = await fetchCompressedBase64();
    const decoded = decompressFromBase64(articlesCompressedBase64);

    if (decoded === null) {
      throw new Error("Failed to decompress articles dataset");
    }

    articlesCache = parseArticles(decoded);
    return articlesCache;
  })();

  return articlesPromise;
}

/**
 * Load articles synchronously (inline builds only).
 * This is used when VITE_INLINE_BUILD is true.
 */
export function loadArticlesSync(): SubstanceArticle[] {
  if (articlesCache !== null) {
    return articlesCache;
  }

  if (syncArticlesLoaded) {
    // Already attempted sync load but cache is empty - return empty array
    return [];
  }

  // For sync loading, we need the compressed data to be available
  // This only works in inline builds where everything is bundled
  throw new Error(
    "Synchronous article loading is only available in inline builds. " +
    "Use loadArticles() for async loading in standard builds."
  );
}

/**
 * Check if articles have been loaded.
 */
export function isArticlesLoaded(): boolean {
  return articlesCache !== null;
}

/**
 * Get cached articles if available, or null if not yet loaded.
 */
export function getArticlesIfLoaded(): SubstanceArticle[] | null {
  return articlesCache;
}

/**
 * Preload articles in the background.
 * Call this early to start loading before the data is needed.
 */
export function preloadArticles(): void {
  if (articlesCache === null && articlesPromise === null) {
    loadArticles().catch((error) => {
      console.error("Failed to preload articles:", error);
    });
  }
}

/**
 * Initialize with synchronous data (for inline builds).
 * This allows the inline build to inject pre-bundled data.
 */
export function initializeWithSyncData(compressedBase64: string): SubstanceArticle[] {
  if (articlesCache !== null) {
    return articlesCache;
  }

  const decoded = decompressFromBase64(compressedBase64);
  if (decoded === null) {
    throw new Error("Failed to decompress articles dataset");
  }

  articlesCache = parseArticles(decoded);
  syncArticlesLoaded = true;
  return articlesCache;
}

/**
 * Clear the cache (mainly for testing).
 */
export function clearArticlesCache(): void {
  articlesCache = null;
  articlesPromise = null;
  syncArticlesLoaded = false;
}

/**
 * Set the articles cache directly (for Convex integration).
 * This allows external sources to populate the cache.
 */
export function setArticlesCache(articles: SubstanceArticle[]): void {
  articlesCache = articles;
}

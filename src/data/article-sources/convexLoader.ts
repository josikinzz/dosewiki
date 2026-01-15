/**
 * Convex-enabled article source loader.
 * 
 * This module provides a Convex-first loading strategy for article sources,
 * with fallback to the bundled static files.
 */

import { isConvexEnabled, getConvexClient } from "../../lib/convex";
import { api } from "../../../convex/_generated/api";
import type { SubstanceModule } from "./index";

// Cache for Convex-loaded sources to avoid repeated queries
const convexCache = new Map<string, SubstanceModule>();

/**
 * Load article sources from Convex.
 * Returns null if Convex is not enabled or source not found.
 */
export async function loadFromConvex(slug: string): Promise<SubstanceModule | null> {
  if (!isConvexEnabled()) {
    return null;
  }

  // Check cache first
  const cached = convexCache.get(slug);
  if (cached) {
    return cached;
  }

  try {
    const client = getConvexClient();
    const result = await client.query(api.articleSources.getBySlug, { slug });
    
    if (!result) {
      return null;
    }

    // Transform Convex result to SubstanceModule format
    const module: SubstanceModule = {
      substanceName: result.substanceName,
      sources: result.sources,
      contents: result.contents as Record<string, string>,
    };

    // Cache the result
    convexCache.set(slug, module);

    return module;
  } catch (error) {
    console.error(`Failed to load article sources from Convex for ${slug}:`, error);
    return null;
  }
}

/**
 * Clear the Convex source cache.
 */
export function clearConvexCache(): void {
  convexCache.clear();
}

/**
 * Clear a specific entry from the cache.
 */
export function clearFromCache(slug: string): void {
  convexCache.delete(slug);
}

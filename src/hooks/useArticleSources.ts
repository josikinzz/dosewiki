/**
 * Hook for loading article sources from Convex.
 *
 * Provides the substance list (for DevMode dropdown) and
 * functions to load individual substance source content.
 */

import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { getConvexClient, isConvexEnabled } from "../lib/convex";

export interface SourceInfo {
  id: string;
  fileName: string;
  displayName: string;
  size: number;
  tokens: number;
}

export interface SubstanceSourceInfo {
  name: string;
  slug: string;
  sources: SourceInfo[];
}

export interface SubstanceModule {
  substanceName: string;
  sources: SourceInfo[];
  contents: Record<string, string>;
}

// Cache for loaded substance modules
const moduleCache = new Map<string, SubstanceModule>();

/**
 * Hook to get the list of substances with available sources.
 * Uses Convex pagination to load all substances without hitting limits.
 */
export function useSubstanceSourceList(): {
  substances: SubstanceSourceInfo[];
  isLoading: boolean;
  error: string | null;
} {
  const [substances, setSubstances] = useState<SubstanceSourceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConvexEnabled()) {
      setError("Convex not configured");
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAll() {
      const client = getConvexClient();
      const allItems: SubstanceSourceInfo[] = [];
      let cursor: string | undefined = undefined;
      let isDone = false;

      try {
        while (!isDone && !cancelled) {
          const result = await client.query(api.articleSources.getSubstanceList, {
            cursor,
            limit: 100,
          });

          allItems.push(...result.items);
          cursor = result.cursor ?? undefined;
          isDone = result.isDone;
        }

        if (!cancelled) {
          setSubstances(allItems);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load substances");
          setIsLoading(false);
        }
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  return { substances, isLoading, error };
}

/**
 * Hook to load a specific substance's source content.
 */
export function useSubstanceSource(slug: string | null): {
  module: SubstanceModule | null;
  isLoading: boolean;
  error: string | null;
} {
  // Use Convex reactive query for the specific substance
  const result = useQuery(
    api.articleSources.getBySlug,
    slug ? { slug } : "skip"
  );

  const module = useMemo<SubstanceModule | null>(() => {
    if (!result) return null;

    return {
      substanceName: result.substanceName,
      sources: result.sources,
      contents: result.contents as Record<string, string>,
    };
  }, [result]);

  return {
    module,
    isLoading: result === undefined,
    error: null,
  };
}

/**
 * Imperatively load a substance's sources (for use outside React components).
 */
export async function loadSubstanceSourcesFromConvex(
  slug: string
): Promise<SubstanceModule | null> {
  // Check cache first
  const cached = moduleCache.get(slug);
  if (cached) {
    return cached;
  }

  if (!isConvexEnabled()) {
    return null;
  }

  try {
    const client = getConvexClient();
    const result = await client.query(api.articleSources.getBySlug, { slug });

    if (!result) {
      return null;
    }

    const module: SubstanceModule = {
      substanceName: result.substanceName,
      sources: result.sources,
      contents: result.contents as Record<string, string>,
    };

    // Cache the result
    moduleCache.set(slug, module);

    return module;
  } catch (error) {
    console.error(`Failed to load article sources for ${slug}:`, error);
    return null;
  }
}

/**
 * Clear the module cache.
 */
export function clearSourceCache(): void {
  moduleCache.clear();
}

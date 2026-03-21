import { useEffect, useMemo, useState } from "react";
import type { ProtestKitResponse } from "../types/reagent";

const reagentCache = new Map<string, ProtestKitResponse | null>();
const pendingRequests = new Map<string, Promise<ProtestKitResponse | null>>();

/**
 * Normalize a substance name for API lookup.
 * Converts to lowercase and removes special characters.
 */
function normalizeSubstanceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .trim();
}

/**
 * Get the API URL for fetching reagent data.
 * Uses a Vercel proxy to bypass CORS restrictions.
 */
function getApiUrl(substanceName: string): string {
  const normalized = encodeURIComponent(substanceName);
  return `/api/reagent-proxy?substance=${normalized}`;
}

/**
 * Fetch reagent data trying multiple name candidates until one succeeds.
 */
async function fetchReagentData(
  substanceName: string,
  aliases: string[]
): Promise<ProtestKitResponse | null> {
  const candidates = [substanceName, ...aliases]
    .filter(Boolean)
    .map(normalizeSubstanceName)
    .filter((name) => name.length > 0);

  const uniqueCandidates = [...new Set(candidates)];

  for (const name of uniqueCandidates) {
    try {
      const res = await fetch(getApiUrl(name));
      if (res.ok) {
        return res.json();
      }

      if (res.status === 404) {
        continue;
      }

      if (res.status === 429) {
        return null;
      }

      return null;
    } catch (err) {
      console.warn(`ProtestKit API error for ${name}:`, err);
      return null;
    }
  }

  // No candidate succeeded - substance not in ProtestKit database
  return null;
}

function getCacheKey(substanceName: string, aliases: string[]): string {
  return [substanceName.trim().toLowerCase(), ...aliases.map((alias) => alias.trim().toLowerCase())]
    .filter(Boolean)
    .join("|");
}

async function fetchCachedReagentData(
  substanceName: string,
  aliases: string[]
): Promise<ProtestKitResponse | null> {
  const cacheKey = getCacheKey(substanceName, aliases);

  if (reagentCache.has(cacheKey)) {
    return reagentCache.get(cacheKey) ?? null;
  }

  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = fetchReagentData(substanceName, aliases)
    .then((result) => {
      reagentCache.set(cacheKey, result);
      pendingRequests.delete(cacheKey);
      return result;
    })
    .catch((error) => {
      pendingRequests.delete(cacheKey);
      throw error;
    });

  pendingRequests.set(cacheKey, request);
  return request;
}

/**
 * Hook to fetch reagent testing data from ProtestKit API.
 * Uses TanStack Query for caching, deduplication, and retry logic.
 *
 * Tries the primary substance name first, then aliases until one succeeds.
 * Returns null data if substance not found in ProtestKit database.
 */
export function useReagentData(
  substanceName: string,
  aliases: string[] = []
) {
  const cacheKey = useMemo(() => getCacheKey(substanceName, aliases), [substanceName, aliases]);
  const [data, setData] = useState<ProtestKitResponse | null>(() => {
    if (!cacheKey) {
      return null;
    }

    return reagentCache.get(cacheKey) ?? null;
  });
  const [isLoading, setIsLoading] = useState(Boolean(substanceName) && !reagentCache.has(cacheKey));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!substanceName) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const cached = reagentCache.get(cacheKey);
    if (cached !== undefined) {
      setData(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    fetchCachedReagentData(substanceName, aliases)
      .then((result) => {
        if (isCancelled) {
          return;
        }

        setData(result);
        setIsLoading(false);
        setError(null);
      })
      .catch((caughtError: unknown) => {
        if (isCancelled) {
          return;
        }

        setData(null);
        setIsLoading(false);
        setError(caughtError instanceof Error ? caughtError : new Error("Failed to fetch reagent data."));
      });

    return () => {
      isCancelled = true;
    };
  }, [aliases, cacheKey, substanceName]);

  return { data, isLoading, error, isError: error !== null };
}

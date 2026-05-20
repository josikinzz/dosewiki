import { useEffect, useMemo, useState } from "react";
import {
  buildReagentLookupCandidates,
  getProtestKitProxyUrl,
  getReagentCacheKey,
  normalizeProtestKitResponse,
  validateProtestKitResponse,
  type NormalizedReagentData,
} from "@/lib/reagentTesting";

const reagentCache = new Map<string, NormalizedReagentData | null>();
const pendingRequests = new Map<string, Promise<NormalizedReagentData | null>>();

/**
 * Fetch reagent data trying multiple name candidates until one succeeds.
 */
async function fetchReagentData(
  substanceName: string,
  aliases: string[]
): Promise<NormalizedReagentData | null> {
  const candidates = buildReagentLookupCandidates({ commonName: substanceName, aliases });

  for (const name of candidates) {
    try {
      const res = await fetch(getProtestKitProxyUrl(name));
      if (res.ok) {
        const validation = validateProtestKitResponse(await res.json());
        return validation.ok ? normalizeProtestKitResponse(validation.data) : null;
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

async function fetchCachedReagentData(
  substanceName: string,
  aliases: string[]
): Promise<NormalizedReagentData | null> {
  const cacheKey = getReagentCacheKey(substanceName, aliases);

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
  const cacheKey = useMemo(() => getReagentCacheKey(substanceName, aliases), [substanceName, aliases]);
  const [data, setData] = useState<NormalizedReagentData | null>(() => {
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

import { useEffect, useState } from "react";
import {
  normalizeProtestKitResponse,
  validateProtestKitResponse,
  type NormalizedReagentData,
} from "@/lib/reagentTesting";

const reagentCache = new Map<string, NormalizedReagentData | null>();
const pendingRequests = new Map<string, Promise<NormalizedReagentData | null>>();

async function fetchReagentData(slug: string): Promise<NormalizedReagentData | null> {
  try {
    const response = await fetch(`/api/reagent-proxy?slug=${encodeURIComponent(slug)}`);
    if (response.status === 204 || response.status === 404 || response.status === 429) {
      return null;
    }
    if (!response.ok) {
      return null;
    }

    const validation = validateProtestKitResponse(await response.json());
    return validation.ok ? normalizeProtestKitResponse(validation.data) : null;
  } catch (error) {
    console.warn("Reagent snapshot read error:", error);
    return null;
  }
}

async function fetchCachedReagentData(slug: string): Promise<NormalizedReagentData | null> {
  if (reagentCache.has(slug)) {
    return reagentCache.get(slug) ?? null;
  }

  const pending = pendingRequests.get(slug);
  if (pending) {
    return pending;
  }

  const request = fetchReagentData(slug)
    .then((result) => {
      reagentCache.set(slug, result);
      pendingRequests.delete(slug);
      return result;
    })
    .catch((error) => {
      pendingRequests.delete(slug);
      throw error;
    });

  pendingRequests.set(slug, request);
  return request;
}

/** Read imported reagent-test data by canonical DoseWiki slug. */
export function useReagentData(slug: string) {
  const [data, setData] = useState<NormalizedReagentData | null>(() =>
    slug ? reagentCache.get(slug) ?? null : null,
  );
  const [isLoading, setIsLoading] = useState(Boolean(slug) && !reagentCache.has(slug));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!slug) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const cached = reagentCache.get(slug);
    if (cached !== undefined) {
      setData(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    fetchCachedReagentData(slug)
      .then((result) => {
        if (isCancelled) return;
        setData(result);
        setIsLoading(false);
        setError(null);
      })
      .catch((caughtError: unknown) => {
        if (isCancelled) return;
        setData(null);
        setIsLoading(false);
        setError(caughtError instanceof Error ? caughtError : new Error("Failed to read reagent data."));
      });

    return () => {
      isCancelled = true;
    };
  }, [slug]);

  return { data, isLoading, error, isError: error !== null };
}

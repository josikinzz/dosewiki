import { useEffect, useState } from "react";
import type { ProtestKitResponse } from "../types/reagent";

interface UseReagentDataResult {
  data: ProtestKitResponse | null;
  isLoading: boolean;
  error: Error | null;
}

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
  // Use proxy endpoint to bypass CORS
  return `/api/reagent-proxy?substance=${normalized}`;
}

/**
 * Hook to fetch reagent testing data from ProtestKit API.
 * Tries the primary substance name first, then aliases until one succeeds.
 * Returns null data if substance not found in ProtestKit database.
 */
export function useReagentData(
  substanceName: string,
  aliases: string[] = []
): UseReagentDataResult {
  const [data, setData] = useState<ProtestKitResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      setIsLoading(true);
      setError(null);
      setData(null);

      // Build list of names to try: primary name, then aliases
      const candidates = [substanceName, ...aliases]
        .filter(Boolean)
        .map(normalizeSubstanceName)
        .filter((name) => name.length > 0);

      // Deduplicate
      const uniqueCandidates = [...new Set(candidates)];

      // Try each candidate until one succeeds
      for (const name of uniqueCandidates) {
        try {
          const res = await fetch(getApiUrl(name), {
            signal: controller.signal,
          });

          if (res.ok) {
            const json = await res.json();
            setData(json);
            setIsLoading(false);
            return;
          }
          // If 404, continue to next candidate
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            return; // Component unmounted, ignore
          }
          // Log but continue to next candidate
          console.warn(`ProtestKit API error for ${name}:`, err);
        }
      }

      // No candidate succeeded - substance not in ProtestKit database
      setData(null);
      setIsLoading(false);
    }

    fetchData();

    return () => controller.abort();
  }, [substanceName, aliases.join(",")]);

  return { data, isLoading, error };
}

import { useQuery } from "@tanstack/react-query";
import type { ProtestKitResponse } from "../types/reagent";

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
  const aliasKey = aliases.join(",");

  return useQuery({
    queryKey: ["reagent", substanceName, aliasKey],
    queryFn: () => fetchReagentData(substanceName, aliases),
    enabled: Boolean(substanceName),
    staleTime: 10 * 60 * 1000,  // 10 minutes - reagent data rarely changes
    gcTime: 60 * 60 * 1000,     // 1 hour cache
    retry: false,
  });
}

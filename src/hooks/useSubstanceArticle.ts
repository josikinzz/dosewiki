/**
 * Hook for loading a single substance article by slug.
 *
 * This enables per-article loading instead of loading all 679 articles
 * on app startup. Articles are fetched on-demand when navigating to them.
 */

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { SubstanceArticle } from "../schema";

/**
 * Hook to load a single substance article by slug.
 *
 * @param slug - The URL-friendly slug of the substance (e.g., "lsd", "ketamine")
 * @returns Article data, loading state, and whether article was found
 */
export function useSubstanceArticle(slug: string | null) {
  const article = useQuery(
    api.substanceIndex.getBySlug,
    slug ? { slug } : "skip"
  );

  // Strip Convex metadata fields if article exists
  const cleanArticle = article
    ? (({ _id, _creationTime, ...rest }) => rest)(article) as SubstanceArticle
    : null;

  return {
    article: cleanArticle,
    isLoading: slug !== null && article === undefined,
    notFound: slug !== null && article === null,
  };
}

/**
 * Hook to load the lightweight slug-name map for resolving drug names.
 *
 * This returns ~20KB of data (slug/name/priority for all substances)
 * instead of the full 5MB article collection.
 */
export function useSubstanceLookup() {
  const data = useQuery(api.substanceIndex.getSlugNameMap);

  // Build a Map for O(1) lookups
  const lookup = data
    ? new Map(data.map((item) => [item.slug, item]))
    : null;

  return {
    lookup,
    isLoading: data === undefined,
    substances: data ?? [],
  };
}

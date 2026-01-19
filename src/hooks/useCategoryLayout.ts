/**
 * Hook for loading the category layout from Convex.
 *
 * The category layout is a lightweight (~14KB) data structure containing
 * just the category/section/drug-slug hierarchy. Names are resolved
 * client-side using the slug-name map.
 */

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface CategoryLayoutSection {
  key: string;
  label: string;
  drugs: string[]; // Just slugs
}

export interface CategoryLayoutCategory {
  key: string;
  label: string;
  iconKey: string;
  sections: CategoryLayoutSection[];
  drugs: string[]; // Top-level drugs not in sections
  columns?: Record<string, number>;
}

export interface CategoryLayout {
  version: number;
  categories: CategoryLayoutCategory[];
}

/**
 * Hook to load the category layout from Convex.
 *
 * @returns Layout data, loading state, and whether layout exists
 */
export function useCategoryLayout() {
  const layout = useQuery(api.categoryLayout.get);

  return {
    layout: layout as CategoryLayout | null | undefined,
    isLoading: layout === undefined,
    exists: layout !== null && layout !== undefined,
  };
}

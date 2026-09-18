/**
 * Hook for loading the category layout through the editor read route.
 *
 * The category layout is a lightweight (~14KB) data structure containing
 * just the category/section/drug-slug hierarchy. Names are resolved
 * client-side using the slug-name map.
 */

import { useEditorRead } from "./useEditorRead";

interface CategoryLayoutSection {
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
 * Hook to load the category layout.
 *
 * @returns Layout data, loading state, and whether layout exists
 */
export function useCategoryLayout() {
  const layout = useEditorRead("categoryLayout:get", {}, "list");

  return {
    layout: layout as CategoryLayout | null | undefined,
    isLoading: layout === undefined,
    exists: layout !== null && layout !== undefined,
  };
}

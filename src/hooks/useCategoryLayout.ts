import { useEditorRead } from "./useEditorRead";

interface CategoryLayoutSection {
  key: string;
  label: string;
  drugs: string[];
}

export interface CategoryLayoutCategory {
  key: string;
  label: string;
  iconKey: string;
  sections: CategoryLayoutSection[];
  drugs: string[];
  columns?: Record<string, number>;
}

export interface CategoryLayout {
  version: number;
  categories: CategoryLayoutCategory[];
}

export function useCategoryLayout() {
  const layout = useEditorRead("categoryLayout:get", {}, "list");

  return {
    layout: layout as CategoryLayout | null | undefined,
    isLoading: layout === undefined,
    exists: layout !== null && layout !== undefined,
  };
}

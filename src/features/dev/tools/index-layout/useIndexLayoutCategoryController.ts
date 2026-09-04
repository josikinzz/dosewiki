import { useCallback, useMemo } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { SubstanceRecord } from "@/data/builders/contentBuilder";
import { slugify } from "@/utils/slug";
import type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualIndexConfig,
  SubstanceOption,
} from "./types";
import { removeCategorySection, resolveCategoryColumn } from "./categoryEditorUtils";
import { generateUniqueKey } from "./utils";

export type ColumnGroupItem = {
  category: ManualCategoryDefinition;
  originalIndex: number;
};

export type ColumnGroup = {
  index: number;
  items: ColumnGroupItem[];
};

type UseIndexLayoutCategoryControllerArgs = {
  allSubstanceRecords: readonly SubstanceRecord[];
  draftManual: ManualIndexConfig;
  columnCount: number;
  updateDraftManualForActive: (updater: (manual: ManualIndexConfig) => ManualIndexConfig) => void;
};

export function useIndexLayoutCategoryController({
  allSubstanceRecords,
  draftManual,
  columnCount,
  updateDraftManualForActive,
}: UseIndexLayoutCategoryControllerArgs) {
  const substanceOptions = useMemo<SubstanceOption[]>(
    () =>
      allSubstanceRecords
        .map((record) => ({
          slug: record.slug,
          name: record.name,
          alias: record.aliases?.[0],
          isHidden: record.isHidden,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allSubstanceRecords],
  );

  const datasetSlugSet = useMemo<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    draftManual.categories.forEach((category) => {
      category.drugs.forEach((slug) => set.add(slugify(slug)));
      category.sections.forEach((section) => {
        section.drugs.forEach((slug) => set.add(slugify(slug)));
      });
    });
    return set;
  }, [draftManual]);

  const getColumnForCategory = useCallback(
    (category: ManualCategoryDefinition, index: number): number => {
      return resolveCategoryColumn(category, columnCount, index) % columnCount;
    },
    [columnCount],
  );

  const { columnGroups, columnById } = useMemo(() => {
    const groups: ColumnGroup[] = Array.from({ length: columnCount }, (_, index) => ({
      index,
      items: [],
    }));
    const lookup = new Map<string, number>();

    draftManual.categories.forEach((category, index) => {
      const effectiveColumn = getColumnForCategory(category, index);
      groups[effectiveColumn]?.items.push({ category, originalIndex: index });
      lookup.set(category.key, effectiveColumn);
    });

    return { columnGroups: groups, columnById: lookup };
  }, [columnCount, draftManual.categories, getColumnForCategory]);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) {
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) {
        return;
      }

      updateDraftManualForActive((previous) => {
        const categories = previous.categories;
        const fromIndex = categories.findIndex((category) => category.key === activeId);
        if (fromIndex < 0) {
          return previous;
        }

        const toIndex = categories.findIndex((category) => category.key === overId);
        const activeCategory = categories[fromIndex];
        const activeColumn = getColumnForCategory(activeCategory, fromIndex);

        let targetColumn = columnById.get(overId) ?? activeColumn;
        if (overId.startsWith("column-")) {
          const parsed = Number(overId.replace("column-", ""));
          if (Number.isInteger(parsed)) {
            targetColumn = parsed;
          }
        }

        const nextCategories = categories.slice();
        const [moved] = nextCategories.splice(fromIndex, 1);

        let nextMoved = moved;
        if (targetColumn !== activeColumn) {
          nextMoved = {
            ...moved,
            columns: {
              ...(moved.columns ?? {}),
              [String(columnCount)]: targetColumn,
            },
          };
        }

        let insertIndex = toIndex;
        if (insertIndex < 0 || overId.startsWith("column-")) {
          let lastIndex = -1;
          nextCategories.forEach((category, index) => {
            if (getColumnForCategory(category, index) === targetColumn) {
              lastIndex = index;
            }
          });
          insertIndex = lastIndex + 1;
        } else if (fromIndex < insertIndex) {
          insertIndex -= 1;
        }

        nextCategories.splice(insertIndex, 0, nextMoved);
        return {
          ...previous,
          categories: nextCategories,
        };
      });
    },
    [columnById, columnCount, getColumnForCategory, updateDraftManualForActive],
  );

  const updateCategory = useCallback(
    (index: number, updater: (category: ManualCategoryDefinition) => ManualCategoryDefinition) => {
      updateDraftManualForActive((previous) => {
        if (index < 0 || index >= previous.categories.length) {
          return previous;
        }
        const currentCategory = previous.categories[index];
        const nextCategory = updater(currentCategory);
        if (nextCategory === currentCategory) {
          return previous;
        }
        const nextCategories = previous.categories.slice();
        nextCategories[index] = nextCategory;
        return {
          ...previous,
          categories: nextCategories,
        };
      });
    },
    [updateDraftManualForActive],
  );

  const removeCategory = useCallback((index: number) => {
    updateDraftManualForActive((previous) => {
      if (index < 0 || index >= previous.categories.length || previous.categories.length <= 1) {
        return previous;
      }
      const nextCategories = previous.categories.filter((_, current) => current !== index);
      if (nextCategories.length === previous.categories.length) {
        return previous;
      }
      return {
        ...previous,
        categories: nextCategories,
      };
    });
  }, [updateDraftManualForActive]);

  const moveCategory = useCallback(
    (index: number, direction: "up" | "down") => {
      updateDraftManualForActive((previous) => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= previous.categories.length) {
          return previous;
        }
        const nextCategories = previous.categories.slice();
        const [moved] = nextCategories.splice(index, 1);
        nextCategories.splice(targetIndex, 0, moved);
        return {
          ...previous,
          categories: nextCategories,
        };
      });
    },
    [updateDraftManualForActive],
  );

  const addCategory = useCallback(() => {
    updateDraftManualForActive((previous) => {
      const existingKeys = new Set(previous.categories.map((category) => slugify(category.key)));
      const key = generateUniqueKey("New Category", existingKeys);
      const nextCategory: ManualCategoryDefinition = {
        key,
        label: "New Category",
        iconKey: "sparkle",
        notes: "",
        drugs: [],
        sections: [],
      };
      return {
        ...previous,
        categories: [...previous.categories, nextCategory],
      };
    });
  }, [updateDraftManualForActive]);

  const addSection = useCallback((index: number) => {
    updateCategory(index, (category) => {
      const existingKeys = new Set(category.sections.map((section) => slugify(section.key)));
      const key = generateUniqueKey("New Section", existingKeys);
      const nextSection: ManualCategorySection = {
        key,
        label: "New Section",
        drugs: [],
        notes: "",
      };
      return {
        ...category,
        sections: [...category.sections, nextSection],
      };
    });
  }, [updateCategory]);

  const removeSection = useCallback(
    (index: number, sectionIndex: number) => {
      updateCategory(index, (category) => removeCategorySection(category, sectionIndex));
    },
    [updateCategory],
  );

  const setColumn = useCallback(
    (index: number, column: number) => {
      updateDraftManualForActive((previous) => {
        if (index < 0 || index >= previous.categories.length) {
          return previous;
        }
        const category = previous.categories[index];
        if (!Number.isInteger(column) || column < 0 || column >= columnCount) {
          return previous;
        }

        const nextCategories = previous.categories.slice();
        nextCategories[index] = {
          ...category,
          columns: {
            ...(category.columns ?? {}),
            [String(columnCount)]: column,
          },
        };
        return {
          ...previous,
          categories: nextCategories,
        };
      });
    },
    [columnCount, updateDraftManualForActive],
  );

  return {
    substanceOptions,
    datasetSlugSet,
    columnGroups,
    handleDragEnd,
    updateCategory,
    removeCategory,
    moveCategory,
    addCategory,
    addSection,
    removeSection,
    setColumn,
  };
}

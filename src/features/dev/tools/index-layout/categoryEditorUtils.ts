import { arrayMove } from "@dnd-kit/sortable";
import { slugify } from "@/utils/slug";
import type { ManualCategoryDefinition, ManualCategorySection, SlugStatus } from "./types";

type SortSlugsWithCommonPriority = (slugs: readonly string[]) => string[];
type ResolveSlugStatus = (slug: string, counts: Map<string, number>) => SlugStatus;

export const computeSlugCounts = (category: ManualCategoryDefinition): Map<string, number> => {
  const counts = new Map<string, number>();

  const register = (value: string) => {
    const normalized = slugify(value);
    if (!normalized) {
      return;
    }
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  };

  category.drugs.forEach(register);
  category.sections.forEach((section) => section.drugs.forEach(register));

  return counts;
};

export const buildCategorySlugStatuses = (
  category: ManualCategoryDefinition,
  resolveSlugStatus: ResolveSlugStatus,
): Map<string, SlugStatus> => {
  const statuses = new Map<string, SlugStatus>();

  const registerList = (slugs: readonly string[]) => {
    const counts = new Map<string, number>();
    slugs.forEach((slug) => {
      const normalized = slugify(slug);
      if (normalized) {
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    });
    slugs.forEach((slug) => {
      const status = resolveSlugStatus(slug, counts);
      const previous = statuses.get(slug);
      statuses.set(slug, previous?.issues.includes("duplicate") ? previous : status);
    });
  };

  registerList(category.drugs);
  category.sections.forEach((section) => registerList(section.drugs));

  return statuses;
};

export const resolveCategoryColumn = (
  category: ManualCategoryDefinition,
  columnCount: number,
  fallbackIndex: number,
): number => {
  if (category.columns && category.columns[String(columnCount)] !== undefined) {
    return category.columns[String(columnCount)];
  }
  if (category.column !== undefined) {
    return category.column % columnCount;
  }
  return fallbackIndex % columnCount;
};

export const collectNormalizedSlugs = (slugs: readonly string[]): ReadonlySet<string> => {
  return new Set(slugs.map((slug) => slugify(slug)));
};

export const collectNormalizedCategorySlugs = (
  category: ManualCategoryDefinition,
): ReadonlySet<string> => {
  const slugs = new Set<string>();

  category.drugs.forEach((slug) => slugs.add(slugify(slug)));
  category.sections.forEach((section) => {
    section.drugs.forEach((slug) => slugs.add(slugify(slug)));
  });

  return slugs;
};

export const collectExistingCategorySlugs = (category: ManualCategoryDefinition): string[] => {
  return [
    ...category.drugs,
    ...category.sections.flatMap((section) => section.drugs),
  ];
};

type EditableCategoryField = "label" | "key" | "iconKey" | "notes";

export const updateCategoryField = (
  category: ManualCategoryDefinition,
  field: EditableCategoryField,
  value: string,
): ManualCategoryDefinition => {
  if ((category[field] ?? "") === value) {
    return category;
  }
  return {
    ...category,
    [field]: value,
  } as ManualCategoryDefinition;
};

export const addTopLevelCategoryDrug = (
  category: ManualCategoryDefinition,
  slug: string,
  sortSlugsWithCommonPriority: SortSlugsWithCommonPriority,
): ManualCategoryDefinition => ({
  ...category,
  drugs: sortSlugsWithCommonPriority([...category.drugs, slug]),
});

export const removeTopLevelCategoryDrug = (
  category: ManualCategoryDefinition,
  slug: string,
  sortSlugsWithCommonPriority: SortSlugsWithCommonPriority,
): ManualCategoryDefinition => {
  const nextDrugs = category.drugs.filter((entry) => entry !== slug);
  if (nextDrugs.length === category.drugs.length) {
    return category;
  }

  return {
    ...category,
    drugs: sortSlugsWithCommonPriority(nextDrugs),
  };
};

export const replaceCategorySection = (
  category: ManualCategoryDefinition,
  sectionIndex: number,
  nextSection: ManualCategorySection,
): ManualCategoryDefinition => {
  if (sectionIndex < 0 || sectionIndex >= category.sections.length) {
    return category;
  }

  const currentSection = category.sections[sectionIndex];
  if (currentSection === nextSection) {
    return category;
  }

  const nextSections = category.sections.slice();
  nextSections[sectionIndex] = nextSection;

  return {
    ...category,
    sections: nextSections,
  };
};

export const moveCategorySection = (
  category: ManualCategoryDefinition,
  sectionIndex: number,
  direction: "up" | "down",
): ManualCategoryDefinition => {
  const targetIndex = direction === "up" ? sectionIndex - 1 : sectionIndex + 1;
  if (targetIndex < 0 || targetIndex >= category.sections.length) {
    return category;
  }

  const nextSections = category.sections.slice();
  const [moved] = nextSections.splice(sectionIndex, 1);
  nextSections.splice(targetIndex, 0, moved);

  return {
    ...category,
    sections: nextSections,
  };
};

export const removeCategorySection = (
  category: ManualCategoryDefinition,
  sectionIndex: number,
): ManualCategoryDefinition => {
  if (sectionIndex < 0 || sectionIndex >= category.sections.length) {
    return category;
  }

  const nextSections = category.sections.filter((_, currentIndex) => currentIndex !== sectionIndex);
  if (nextSections.length === category.sections.length) {
    return category;
  }

  return {
    ...category,
    sections: nextSections,
  };
};

export const getCategorySectionId = (categoryKey: string, sectionKey: string): string => {
  return `${categoryKey}::${sectionKey}`;
};

export const reorderCategorySections = (
  category: ManualCategoryDefinition,
  activeId: string,
  overId: string,
): ManualCategoryDefinition => {
  const fromIndex = category.sections.findIndex(
    (section) => getCategorySectionId(category.key, section.key) === activeId,
  );
  const toIndex = category.sections.findIndex(
    (section) => getCategorySectionId(category.key, section.key) === overId,
  );

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return category;
  }

  return {
    ...category,
    sections: arrayMove(category.sections, fromIndex, toIndex),
  };
};

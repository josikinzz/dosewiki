import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../../../common/Icon";
import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { JsonEditor } from "../../../common/JsonEditor";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDevMode } from "../../../dev/DevModeContext";
import { useLibrary } from "../../../../data/ArticlesProvider";
import { slugify } from "../../../../utils/slug";
import { useResponsiveColumnCount } from "../../../../hooks/useResponsiveColumnCount";
import { CategoryEditor } from "./CategoryEditor";
import { DatasetTabs } from "./DatasetTabs";
import { LayoutToolbar } from "./LayoutToolbar";
import { useLayoutEditor } from "./useLayoutEditor";

import {
  type IndexLayoutTabProps,
  type SubstanceOption,
  type SlugStatus,
  type SlugIssue,
  type ManualDatasetKey,
  type ManualCategoryDefinition,
  type ManualIndexConfig,
} from "./types";

import {
  deepClone,
  areManualsEqual,
  generateUniqueKey,
} from "./utils";

const MAX_COLUMNS = 6;

function ColumnDroppable({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className ?? "flex flex-1 flex-col gap-6"}>
      {children}
    </div>
  );
}

const COMMON_TAG = "common";

const normalizeTag = (value: string): string => value.trim().toLowerCase();
const DATASET_ORDER: ManualDatasetKey[] = ["psychoactive", "chemical", "mechanism"];


export function IndexLayoutTab({
  commitPanel,
}: IndexLayoutTabProps) {
  const [columnMode, setColumnMode] = useState<"auto" | 1 | 2 | 3 | 4 | 5 | 6>("auto");
  const autoColumnCount = useResponsiveColumnCount();
  const columnCount = columnMode === "auto" ? autoColumnCount : columnMode;

  const {
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    replacePsychoactiveIndexManual,
    replaceChemicalIndexManual,
    replaceMechanismIndexManual,
    resetPsychoactiveIndexManual,
    resetChemicalIndexManual,
    resetMechanismIndexManual,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
  } = useDevMode();
  const { allSubstanceRecords, allSubstancesBySlug } = useLibrary();

  const {
    sortSlugsWithCommonPriority,
    sortSlugsForDataset,
    sortSectionsForDataset,
    resolveSlugStatus,
  } = useMemo(() => {
    const commonSlugSet = new Set<string>(
      allSubstanceRecords
        .filter((record) => {
          const candidates = [
            ...(record.categories ?? []),
            ...(record.indexCategories ?? []),
          ];
          return candidates.some((category) => normalizeTag(category) === COMMON_TAG);
        })
        .map((record) => record.slug),
    );

    const isCommonSlug = (slug: string): boolean => {
      if (commonSlugSet.has(slug)) {
        return true;
      }
      const record = allSubstancesBySlug.get(slug);
      if (!record) {
        return false;
      }
      const candidates = [
        ...(record.categories ?? []),
        ...(record.indexCategories ?? []),
      ];
      const matches = candidates.some((category) => normalizeTag(category) === COMMON_TAG);
      if (matches) {
        commonSlugSet.add(slug);
      }
      return matches;
    };

    const getSlugSortName = (slug: string): string => allSubstancesBySlug.get(slug)?.name ?? slug;

    const sortSlugsWithCommonPriority = (slugs: readonly string[]): string[] =>
      slugs
        .map((slug) => ({
          slug,
          isCommon: isCommonSlug(slug),
          name: getSlugSortName(slug),
        }))
        .sort((first, second) => {
          if (first.isCommon !== second.isCommon) {
            return first.isCommon ? -1 : 1;
          }
          return first.name.localeCompare(second.name, undefined, {
            sensitivity: "base",
            numeric: true,
          });
        })
        .map((entry) => entry.slug);

    const sortSectionsWithCommonPriority = (
      sections: readonly ManualCategorySection[],
    ): ManualCategorySection[] =>
      sections.map((section) => ({
        ...section,
        drugs: sortSlugsWithCommonPriority(section.drugs),
      }));

    const sortSlugsAlphabetically = (slugs: readonly string[]): string[] =>
      [...slugs]
        .map((slug) => ({ slug, name: getSlugSortName(slug) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
        .map((entry) => entry.slug);

    const sortSlugsForDataset = (
      dataset: ManualDatasetKey,
      slugs: readonly string[],
    ): string[] => {
      if (dataset === "psychoactive") {
        return sortSlugsWithCommonPriority(slugs);
      }
      return sortSlugsAlphabetically(slugs);
    };

    const sortSectionsForDataset = (
      dataset: ManualDatasetKey,
      sections: readonly ManualCategorySection[],
    ): ManualCategorySection[] => {
      if (dataset === "psychoactive") {
        return sortSectionsWithCommonPriority(sections);
      }

      return sections.map((section) => ({
        ...section,
        drugs: sortSlugsForDataset(dataset, section.drugs),
      }));
    };

    const resolveSlugStatus = (slug: string, counts: Map<string, number>): SlugStatus => {
      const normalized = slugify(slug);
      const issues: SlugIssue[] = [];
      if (!normalized) {
        issues.push("missing");
        return { slug, issues };
      }

      const record = allSubstancesBySlug.get(normalized);
      if (!record) {
        issues.push("missing");
        return { slug, issues };
      }

      if (record.isHidden) {
        issues.push("hidden");
      }

      if ((counts.get(normalized) ?? 0) > 1) {
        issues.push("duplicate");
      }

      return {
        slug,
        name: record.name,
        alias: record.aliases?.[0],
        issues,
      };
    };

    return {
      sortSlugsWithCommonPriority,
      sortSlugsForDataset,
      sortSectionsForDataset,
      resolveSlugStatus,
    };
  }, [allSubstanceRecords, allSubstancesBySlug]);

  const datasetOrder = DATASET_ORDER;

  interface DatasetDefinition {
    key: ManualDatasetKey;
    label: string;
    icon: IconName;
    description: string;
    helperLabel: string;
    helperDetail: string;
    manual: ManualIndexConfig;
    replaceManual: (next: ManualIndexConfig) => void;
    resetContextManual: () => void;
    getOriginalManual: () => ManualIndexConfig;
  }

  const datasetDefinitions = useMemo<Record<ManualDatasetKey, DatasetDefinition>>(
    () => ({
      psychoactive: {
        key: "psychoactive",
        label: "Psychoactive class",
        icon: "fluent:brain-circuit-28-filled",
        description: "Curate the manual layout for psychoactive classifications used on the substance index.",
        helperLabel: "Psychoactive class manual",
        helperDetail: "Controls the category, section, and ordering for the public Psychoactive class tab.",
        manual: psychoactiveIndexManual,
        replaceManual: replacePsychoactiveIndexManual,
        resetContextManual: resetPsychoactiveIndexManual,
        getOriginalManual: getOriginalPsychoactiveIndexManual,
      },
      chemical: {
        key: "chemical",
        label: "Chemical class",
        icon: "solar:benzene-ring-line-duotone",
        description: "Compose the curated chemical class ordering for the substance index.",
        helperLabel: "Chemical class manual",
        helperDetail: "Feeds the Chemical class tab and Dev Tools previews when editing articles.",
        manual: chemicalIndexManual,
        replaceManual: replaceChemicalIndexManual,
        resetContextManual: resetChemicalIndexManual,
        getOriginalManual: getOriginalChemicalIndexManual,
      },
      mechanism: {
        key: "mechanism",
        label: "Mechanism of action",
        icon: "fa-solid:cogs",
        description: "Manage the mechanism of action taxonomy used across the index.",
        helperLabel: "Mechanism manual",
        helperDetail: "Controls the Mechanism of action tab layout plus related detail page ordering.",
        manual: mechanismIndexManual,
        replaceManual: replaceMechanismIndexManual,
        resetContextManual: resetMechanismIndexManual,
        getOriginalManual: getOriginalMechanismIndexManual,
      },
    }), [
      chemicalIndexManual,
      getOriginalChemicalIndexManual,
      getOriginalMechanismIndexManual,
      getOriginalPsychoactiveIndexManual,
      mechanismIndexManual,
      psychoactiveIndexManual,
      replaceChemicalIndexManual,
      replaceMechanismIndexManual,
      replacePsychoactiveIndexManual,
      resetChemicalIndexManual,
      resetMechanismIndexManual,
      resetPsychoactiveIndexManual,
    ],
  );

  const organizeManualEntries = useCallback(
    (dataset: ManualDatasetKey, manual: ManualIndexConfig): ManualIndexConfig => ({
      ...manual,
      categories: manual.categories.map((category) => ({
        ...category,
        drugs: sortSlugsForDataset(dataset, category.drugs),
        sections: sortSectionsForDataset(dataset, category.sections),
      })),
    }),
    [sortSectionsForDataset, sortSlugsForDataset],
  );

  const normalizeManualOrdering = useCallback(
    (dataset: ManualDatasetKey, manual: ManualIndexConfig): ManualIndexConfig => ({
      ...manual,
      categories: manual.categories.map((category) => ({
        ...category,
        drugs: sortSlugsForDataset(dataset, category.drugs),
        sections: category.sections.map((section) => ({
          ...section,
          drugs: sortSlugsForDataset(dataset, section.drugs),
        })),
      })),
    }),
    [sortSlugsForDataset],
  );

  const [activeDataset, setActiveDataset] = useState<ManualDatasetKey>("psychoactive");
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const {
    state,
    setRawJsonForDataset,
    clearJsonErrorForDataset,
    setJsonErrorForDataset,
    updateDraftManualForDataset,
    applyJsonForDataset,
    saveDataset,
    resetDraft,
    resetToOriginal,
    organizeEntries,
    setSaveNotice,
  } = useLayoutEditor({
    datasetOrder,
    datasetDefinitions,
    normalizeManualOrdering,
    organizeManualEntries,
    deepClone,
    areManualsEqual,
  });

  const activeDefinition = datasetDefinitions[activeDataset];
  const { normalizedCurrentManuals, draftManuals, rawJsonDrafts, jsonErrors, saveNotice } = state;
  const normalizedCurrentManual = normalizedCurrentManuals[activeDataset];
  const draftManual = draftManuals[activeDataset];
  const rawJsonDraft = rawJsonDrafts[activeDataset];
  const jsonError = jsonErrors[activeDataset];

  useEffect(() => {
    if (!saveNotice) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setSaveNotice(null);
    }, 3000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [saveNotice]);

  useEffect(() => {
    setSaveNotice(null);
  }, [activeDataset]);

  const hasUnsavedChanges = useMemo(
    () => !areManualsEqual(normalizedCurrentManual, draftManual),
    [draftManual, normalizedCurrentManual],
  );

  const updateDraftManualForActive = useCallback(
    (updater: (manual: ManualIndexConfig) => ManualIndexConfig) => {
      updateDraftManualForDataset(activeDataset, updater);
    },
    [activeDataset, updateDraftManualForDataset],
  );

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

  // Helper to get column for a category at current column count
  const getColumnForCategory = useCallback(
    (category: ManualCategoryDefinition, index: number): number => {
      // Check new columns object first
      if (category.columns && category.columns[String(columnCount)] !== undefined) {
        return category.columns[String(columnCount)] % columnCount;
      }
      // Fall back to legacy column property
      if (category.column !== undefined) {
        return category.column % columnCount;
      }
      // Default to round-robin based on category index
      return index % columnCount;
    },
    [columnCount],
  );

  // Group categories by their assigned column for explicit column layout
  const { columnGroups, columnById } = useMemo(() => {
    const columns: Map<number, { category: ManualCategoryDefinition; originalIndex: number }[]> = new Map();
    const columnLookup = new Map<string, number>();

    // Initialize all columns
    for (let i = 0; i < columnCount; i++) {
      columns.set(i, []);
    }

    draftManual.categories.forEach((category, index) => {
      const effectiveColumn = getColumnForCategory(category, index);
      columns.get(effectiveColumn)?.push({ category, originalIndex: index });
      columnLookup.set(category.key, effectiveColumn);
    });

    return { columnGroups: columns, columnById: columnLookup };
  }, [draftManual.categories, columnCount, getColumnForCategory]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const getEffectiveColumn = useCallback(
    (category: ManualCategoryDefinition, index: number) => {
      return getColumnForCategory(category, index);
    },
    [getColumnForCategory],
  );

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
        const activeColumn = getEffectiveColumn(activeCategory, fromIndex);

        let targetColumn = columnById.get(overId) ?? activeColumn;
        if (overId.startsWith("column-")) {
          const parsed = Number(overId.replace("column-", ""));
          if (Number.isInteger(parsed)) {
            targetColumn = parsed;
          }
        }

        const nextCategories = categories.slice();
        const [moved] = nextCategories.splice(fromIndex, 1);
        
        // Update the columns object for the current column count
        let nextMoved = moved;
        if (targetColumn !== activeColumn) {
          const existingColumns = moved.columns ?? {};
          nextMoved = {
            ...moved,
            columns: {
              ...existingColumns,
              [String(columnCount)]: targetColumn,
            },
          };
        }

        let insertIndex = toIndex;
        if (insertIndex < 0 || overId.startsWith("column-")) {
          let lastIndex = -1;
          nextCategories.forEach((category, index) => {
            if (getEffectiveColumn(category, index) === targetColumn) {
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
    [columnById, columnCount, getEffectiveColumn, updateDraftManualForActive],
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

        // Update the columns object for the current column count
        const existingColumns = category.columns ?? {};
        const nextColumns = {
          ...existingColumns,
          [String(columnCount)]: column,
        };

        const nextCategories = previous.categories.slice();
        nextCategories[index] = { ...category, columns: nextColumns };
        return {
          ...previous,
          categories: nextCategories,
        };
      });
    },
    [columnCount, updateDraftManualForActive],
  );

  const handleApplyJson = useCallback(() => {
    try {
      applyJsonForDataset(activeDataset, rawJsonDraft);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to parse JSON";
      setJsonErrorForDataset(activeDataset, reason);
    }
  }, [activeDataset, applyJsonForDataset, rawJsonDraft, setJsonErrorForDataset]);

  const handleSave = useCallback(() => {
    saveDataset(activeDataset);
  }, [activeDataset, saveDataset]);

  const handleResetDraft = useCallback(() => {
    resetDraft(activeDataset);
  }, [activeDataset, resetDraft]);

  const handleResetToOriginal = useCallback(() => {
    resetToOriginal(activeDataset);
  }, [activeDataset, resetToOriginal]);

  const handleOrganizeEntries = useCallback(() => {
    organizeEntries(activeDataset);
  }, [activeDataset, organizeEntries]);

  return (
    <div className="space-y-6">
      {commitPanel ? <div>{commitPanel}</div> : null}
      <DatasetTabs
        datasets={datasetOrder.map((datasetKey) => ({
          key: datasetKey,
          label: datasetDefinitions[datasetKey].label,
          icon: datasetDefinitions[datasetKey].icon,
        }))}
        activeKey={activeDataset}
        onChange={(key) => setActiveDataset(key as ManualDatasetKey)}
      />
      <LayoutToolbar
        hasUnsavedChanges={hasUnsavedChanges}
        saveNotice={saveNotice}
        showJsonEditor={showJsonEditor}
        onSave={handleSave}
        onOrganize={handleOrganizeEntries}
        onReset={handleResetDraft}
        onRestore={handleResetToOriginal}
        onToggleJson={() => setShowJsonEditor((previous) => !previous)}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
        <label className="text-[11px] uppercase tracking-[0.3em] text-white/40" htmlFor="layout-column-mode">
          Columns
        </label>
        <Select
          value={String(columnMode)}
          onValueChange={(value) => {
            if (value === "auto") {
              setColumnMode("auto");
              return;
            }
            const next = Number(value);
            if (next >= 1 && next <= MAX_COLUMNS) {
              setColumnMode(next as 1 | 2 | 3 | 4 | 5 | 6);
            }
          }}
        >
          <SelectTrigger id="layout-column-mode" selectSize="compact" className="w-auto min-w-[9rem] bg-slate-950/80">
            <SelectValue placeholder="Auto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="1">1 column</SelectItem>
            <SelectItem value="2">2 columns</SelectItem>
            <SelectItem value="3">3 columns</SelectItem>
            <SelectItem value="4">4 columns</SelectItem>
            <SelectItem value="5">5 columns</SelectItem>
            <SelectItem value="6">6 columns</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {jsonError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
          <Icon icon="lucide:alert-circle" className="h-4 w-4" size={16} />
          <span>{jsonError}</span>
        </div>
      )}

      {showJsonEditor ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm font-medium text-white/70">
            <span>{`${activeDefinition.label} JSON layout`}</span>
            <Button
              variant="glass"
              size="icon"
              onClick={handleApplyJson}
              className="bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30"
              aria-label="Apply JSON edits"
            >
              <Icon icon="lucide:check" className="h-4 w-4" size={16} />
            </Button>
          </div>
          <JsonEditor
            value={rawJsonDraft}
            onChange={(nextValue) => {
              setRawJsonForDataset(activeDataset, nextValue);
              clearJsonErrorForDataset(activeDataset);
            }}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="overflow-x-auto pb-2">
              <div className="flex w-max gap-5">
              {Array.from({ length: columnCount }).map((_, colIndex) => {
                const columnItems = columnGroups.get(colIndex) ?? [];
                return (
                  <SortableContext
                    key={colIndex}
                    items={columnItems.map(({ category }) => category.key)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ColumnDroppable
                      id={`column-${colIndex}`}
                      className="flex w-[320px] flex-col gap-4"
                    >
                      {columnItems.length === 0 && (
                        <div className="flex min-h-[120px] items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] text-xs uppercase tracking-widest text-white/20">
                          Column {colIndex + 1}
                        </div>
                      )}
                      {columnItems.map(({ category, originalIndex }) => (
                        <CategoryEditor
                          key={`${category.key}-${originalIndex}`}
                          category={category}
                          index={originalIndex}
                          total={draftManual.categories.length}
                          maxColumns={MAX_COLUMNS}
                          columnCount={columnCount}
                          sortableId={category.key}
                          onUpdateCategory={updateCategory}
                          onRemoveCategory={removeCategory}
                          onMoveCategory={moveCategory}
                          onSetColumn={setColumn}
                          onAddSection={addSection}
                          substanceOptions={substanceOptions}
                          datasetSlugSet={datasetSlugSet}
                          sortSlugsWithCommonPriority={sortSlugsWithCommonPriority}
                          resolveSlugStatus={resolveSlugStatus}
                        />
                      ))}
                      {colIndex === 0 && (
                        <Button
                          variant="addCard"
                          size="addCard"
                          onClick={addCategory}
                          aria-label="Add category"
                        >
                          <Icon icon="lucide:plus-circle" className="h-6 w-6" size={24} />
                          <span className="text-xs uppercase tracking-[0.3em]">New category</span>
                        </Button>
                      )}
                    </ColumnDroppable>
                  </SortableContext>
                );
              })}
              </div>
            </div>
          </DndContext>
        </div>
      )}
    </div>
  );
}

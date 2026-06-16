import { memo, useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { IconBadge } from "@/components/common/IconBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import type { ManualCategoryDefinition, ManualCategorySection, SubstanceOption, SlugStatus } from "./types";
import { AddSubstanceControl } from "./AddSubstanceControl";
import { CategoryEditorDetailsPanel } from "./CategoryEditorDetailsPanel";
import { SectionEditor } from "./SectionEditor";
import { SubstanceListItem } from "./SubstanceListItem";
import {
  addTopLevelCategoryDrug,
  buildCategorySlugStatuses,
  collectExistingCategorySlugs,
  collectNormalizedCategorySlugs,
  collectNormalizedSlugs,
  getCategorySectionId,
  moveCategorySection,
  removeCategorySection,
  removeTopLevelCategoryDrug,
  reorderCategorySections,
  replaceCategorySection,
  resolveCategoryColumn,
  updateCategoryField,
} from "./categoryEditorUtils";

interface CategoryEditorProps {
  category: ManualCategoryDefinition;
  index: number;
  total: number;
  maxColumns: number;
  columnCount: number;
  sortableId: string;
  onUpdateCategory: (
    index: number,
    updater: (current: ManualCategoryDefinition) => ManualCategoryDefinition,
  ) => void;
  onRemoveCategory: (index: number) => void;
  onMoveCategory: (index: number, direction: "up" | "down") => void;
  onSetColumn: (index: number, column: number) => void;
  onAddSection: (index: number) => void;
  substanceOptions: SubstanceOption[];
  datasetSlugSet: ReadonlySet<string>;
  sortSlugsWithCommonPriority: (slugs: readonly string[]) => string[];
  resolveSlugStatus: (slug: string, counts: Map<string, number>) => SlugStatus;
}

type EditableCategoryField = "label" | "key" | "iconKey" | "notes";

export const CategoryEditor = memo(
  ({
    category,
    index,
    total,
    maxColumns: _maxColumns,
    columnCount,
    sortableId,
    onUpdateCategory,
    onRemoveCategory,
    onMoveCategory,
    onSetColumn,
    onAddSection,
    substanceOptions,
    datasetSlugSet,
    sortSlugsWithCommonPriority,
    resolveSlugStatus,
  }: CategoryEditorProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: sortableId });
    const dragStyle = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const slugStatuses = useMemo(
      () => buildCategorySlugStatuses(category, resolveSlugStatus),
      [category, resolveSlugStatus],
    );
    const categoryIcon = useMemo(() => getCategoryIcon(category.iconKey), [category.iconKey]);
    const sortedPrimaryDrugs = useMemo(
      () => sortSlugsWithCommonPriority(category.drugs),
      [category.drugs, sortSlugsWithCommonPriority],
    );
    const currentColumn = useMemo(
      () => resolveCategoryColumn(category, columnCount, index),
      [category, columnCount, index],
    );
    const topLevelSlugSet = useMemo(
      () => collectNormalizedSlugs(category.drugs),
      [category.drugs],
    );
    const categorySlugSet = useMemo(
      () => collectNormalizedCategorySlugs(category),
      [category],
    );
    const existingSlugs = useMemo(
      () => collectExistingCategorySlugs(category),
      [category],
    );
    const sectionIds = useMemo(
      () => category.sections.map((section) => getCategorySectionId(category.key, section.key)),
      [category.key, category.sections],
    );

    const handleFieldChange = useCallback(
      (field: EditableCategoryField, value: string) => {
        onUpdateCategory(index, (current) => updateCategoryField(current, field, value));
      },
      [index, onUpdateCategory],
    );

    const handleTopLevelAdd = useCallback(
      (slug: string) => {
        onUpdateCategory(index, (current) =>
          addTopLevelCategoryDrug(current, slug, sortSlugsWithCommonPriority));
      },
      [index, onUpdateCategory, sortSlugsWithCommonPriority],
    );

    const handleTopLevelRemove = useCallback(
      (slug: string) => {
        onUpdateCategory(index, (current) =>
          removeTopLevelCategoryDrug(current, slug, sortSlugsWithCommonPriority));
      },
      [index, onUpdateCategory, sortSlugsWithCommonPriority],
    );

    const handleSectionUpdate = useCallback(
      (sectionIndex: number, nextSection: ManualCategorySection) => {
        onUpdateCategory(index, (current) =>
          replaceCategorySection(current, sectionIndex, nextSection));
      },
      [index, onUpdateCategory],
    );

    const handleSectionMove = useCallback(
      (sectionIndex: number, direction: "up" | "down") => {
        onUpdateCategory(index, (current) =>
          moveCategorySection(current, sectionIndex, direction));
      },
      [index, onUpdateCategory],
    );

    const handleSectionRemove = useCallback(
      (sectionIndex: number) => {
        onUpdateCategory(index, (current) => removeCategorySection(current, sectionIndex));
      },
      [index, onUpdateCategory],
    );

    const handleRemoveCategory = useCallback(() => {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(`Remove "${category.label}"? This cannot be undone.`);
        if (!confirmed) {
          return;
        }
      }
      onRemoveCategory(index);
    }, [category.label, index, onRemoveCategory]);

    const handleMoveCategory = useCallback(
      (direction: "up" | "down") => {
        onMoveCategory(index, direction);
      },
      [index, onMoveCategory],
    );

    const handleChangeColumn = useCallback(
      (value: string) => {
        const nextColumn = Number(value);
        if (!Number.isInteger(nextColumn)) {
          return;
        }
        onSetColumn(index, nextColumn);
      },
      [index, onSetColumn],
    );

    const handleAddSection = useCallback(() => {
      onAddSection(index);
    }, [index, onAddSection]);

    const handleSectionDragEnd = useCallback(
      ({ active, over }: DragEndEvent) => {
        if (!over) {
          return;
        }

        const activeId = String(active.id);
        const overId = String(over.id);
        if (activeId === overId) {
          return;
        }

        onUpdateCategory(index, (current) => reorderCategorySections(current, activeId, overId));
      },
      [index, onUpdateCategory],
    );

    const sectionSensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
      useSensor(KeyboardSensor),
    );

    const [detailsOpen, setDetailsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const totalPrimary = category.drugs.length;
    const sectionCount = category.sections.length;

    return (
      <article ref={setNodeRef} style={dragStyle} className="w-full">
        <div
          className={`group relative overflow-hidden rounded-2xl bg-[color-mix(in_srgb,#fff_5%,var(--theme-body-bg))] p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur backdrop-safe ${
            isDragging ? "opacity-60 ring-1 ring-fuchsia-400/40" : ""
          }`}
        >
          <div className="flex flex-col gap-3">
            <header className="flex flex-wrap items-center gap-3 text-white/90">
              <Button
                variant="glass"
                size="icon"
                className="mt-1 h-7 w-7 cursor-grab active:cursor-grabbing"
                aria-label="Drag category"
                {...attributes}
                {...listeners}
              >
                <Icon icon="lucide:grip-vertical" className="h-3.5 w-3.5" size={14} />
              </Button>
              <div className="mt-1">
                <IconBadge icon={categoryIcon} label={`${category.label} icon`} />
              </div>
              <div className="flex min-w-[140px] flex-1 flex-col gap-2">
                <Input
                  className="w-full text-[15px] font-semibold tracking-wide"
                  value={category.label}
                  onChange={(event) => handleFieldChange("label", event.target.value)}
                  placeholder="Category label"
                />
              </div>
              <div className="ml-auto mt-1 flex flex-wrap items-center gap-1.5 text-white/70">
                <Button
                  variant="glass"
                  size="icon"
                  onClick={() => handleMoveCategory("up")}
                  disabled={index === 0}
                  aria-label="Move category up"
                  className="h-7 w-7"
                >
                  <Icon icon="lucide:arrow-up" className="h-3.5 w-3.5" size={14} />
                </Button>
                <Button
                  variant="glass"
                  size="icon"
                  onClick={() => handleMoveCategory("down")}
                  disabled={index === total - 1}
                  aria-label="Move category down"
                  className="h-7 w-7"
                >
                  <Icon icon="lucide:arrow-down" className="h-3.5 w-3.5" size={14} />
                </Button>
                <Button
                  variant="glass"
                  size="icon"
                  onClick={() => setIsExpanded((previous) => !previous)}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Collapse category" : "Expand category"}
                  className="h-7 w-7"
                >
                  {isExpanded ? (
                    <Icon icon="lucide:chevron-down" className="h-3.5 w-3.5" size={14} />
                  ) : (
                    <Icon icon="lucide:chevron-right" className="h-3.5 w-3.5" size={14} />
                  )}
                </Button>
                <Button
                  variant="glass"
                  size="icon"
                  onClick={handleAddSection}
                  aria-label="Add section"
                  className="h-7 w-7"
                >
                  <Icon icon="lucide:plus-circle" className="h-3.5 w-3.5" size={14} />
                </Button>
                <Button
                  variant="glass"
                  size="icon"
                  onClick={() => setDetailsOpen((previous) => !previous)}
                  aria-expanded={detailsOpen}
                  aria-label="Toggle category details"
                  className={`h-7 w-7 ${detailsOpen ? "bg-[color-mix(in_srgb,#fff_15%,var(--theme-control-base))] text-white" : ""}`.trim()}
                >
                  <Icon icon="lucide:sliders-horizontal" className="h-3.5 w-3.5" size={14} />
                </Button>
                <Button
                  variant="glass"
                  size="icon"
                  onClick={handleRemoveCategory}
                  aria-label="Remove category"
                  className="h-7 w-7 hover:bg-[color-mix(in_srgb,#f43f5e_20%,var(--theme-control-base))] hover:text-rose-200 hover:ring-rose-400/40"
                >
                  <Icon icon="lucide:trash-2" className="h-3.5 w-3.5" size={14} />
                </Button>
              </div>
            </header>

            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-white/45">
              <span>
                {totalPrimary} primary item{totalPrimary === 1 ? "" : "s"}
              </span>
              <span className="text-white/30">•</span>
              <span>
                {sectionCount} section{sectionCount === 1 ? "" : "s"}
              </span>
              <span className="text-white/30">•</span>
              <div className="flex items-center gap-2">
                <Select value={String(currentColumn)} onValueChange={handleChangeColumn}>
                  <SelectTrigger selectSize="compact" className="min-w-[7rem] bg-[color-mix(in_srgb,#020617_80%,var(--theme-control-base))]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: columnCount }).map((_, columnIndex) => (
                      <SelectItem key={columnIndex} value={String(columnIndex)}>
                        {`Column ${columnIndex + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {detailsOpen && isExpanded ? (
              <CategoryEditorDetailsPanel
                category={category}
                onFieldChange={handleFieldChange}
              />
            ) : null}

            {isExpanded ? (
              <div className="space-y-5 text-sm text-white/80">
                <AddSubstanceControl
                  label="Add top level categoryless substance..."
                  existingSlugs={existingSlugs}
                  onAdd={handleTopLevelAdd}
                  options={substanceOptions}
                  filterContext={{
                    sectionSlugs: topLevelSlugSet,
                    categorySlugs: categorySlugSet,
                    datasetSlugs: datasetSlugSet,
                  }}
                />

                {totalPrimary > 0 ? (
                  <ul className="space-y-1">
                    {sortedPrimaryDrugs.map((slug) => (
                      <SubstanceListItem
                        key={slug}
                        status={slugStatuses.get(slug) ?? { slug, issues: [] }}
                        onRemove={() => handleTopLevelRemove(slug)}
                      />
                    ))}
                  </ul>
                ) : null}

                {sectionCount > 0 ? (
                  <DndContext
                    sensors={sectionSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleSectionDragEnd}
                  >
                    <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
                      {category.sections.map((section, sectionIndex) => (
                        <SectionEditor
                          key={`${section.key}-${sectionIndex}`}
                          sortableId={sectionIds[sectionIndex] ?? getCategorySectionId(category.key, section.key)}
                          section={section}
                          onUpdate={(next) => handleSectionUpdate(sectionIndex, next)}
                          onRemove={() => handleSectionRemove(sectionIndex)}
                          onMove={(direction) => handleSectionMove(sectionIndex, direction)}
                          isFirst={sectionIndex === 0}
                          isLast={sectionIndex === category.sections.length - 1}
                          showTopDivider={sectionIndex > 0 || totalPrimary > 0}
                          substanceOptions={substanceOptions}
                          slugStatuses={slugStatuses}
                          categorySlugSet={categorySlugSet}
                          datasetSlugSet={datasetSlugSet}
                          sortSlugsWithCommonPriority={sortSlugsWithCommonPriority}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : null}

                {totalPrimary === 0 && sectionCount === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/12 bg-[color-mix(in_srgb,#020617_45%,var(--theme-body-bg))] px-4 py-5 text-sm text-white/65 shadow-inner shadow-black/20">
                    No substances assigned yet. Use the plus icons to start building this category.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </article>
    );
  },
  (previous, next) =>
    previous.category === next.category
    && previous.index === next.index
    && previous.total === next.total
    && previous.maxColumns === next.maxColumns
    && previous.columnCount === next.columnCount
    && previous.sortableId === next.sortableId
    && previous.substanceOptions === next.substanceOptions
    && previous.datasetSlugSet === next.datasetSlugSet
    && previous.sortSlugsWithCommonPriority === next.sortSlugsWithCommonPriority
    && previous.resolveSlugStatus === next.resolveSlugStatus
    && previous.onAddSection === next.onAddSection
    && previous.onMoveCategory === next.onMoveCategory
    && previous.onSetColumn === next.onSetColumn
    && previous.onRemoveCategory === next.onRemoveCategory
    && previous.onUpdateCategory === next.onUpdateCategory,
);

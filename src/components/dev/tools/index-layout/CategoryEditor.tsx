import { memo, useCallback, useId, useMemo, useState } from "react";
import { Icon } from "../../../common/Icon";
import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { IconBadge } from "../../../common/IconBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCategoryIcon } from "../../../../data/config/categoryIcons";
import { slugify } from "../../../../utils/slug";
import type { ManualCategoryDefinition, ManualCategorySection, SubstanceOption, SlugStatus } from "./types";
import { AddSubstanceControl } from "./AddSubstanceControl";
import { SectionEditor } from "./SectionEditor";
import { SubstanceListItem } from "./SubstanceListItem";

const computeSlugCounts = (category: ManualCategoryDefinition): Map<string, number> => {
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

export const CategoryEditor = memo(
  ({
    category,
    index,
    total,
    maxColumns,
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
    const slugCounts = useMemo(() => computeSlugCounts(category), [category]);
    const slugStatuses = useMemo(() => {
      const map = new Map<string, SlugStatus>();
      category.drugs.forEach((slug) => {
        map.set(slug, resolveSlugStatus(slug, slugCounts));
      });
      category.sections.forEach((section) => {
        section.drugs.forEach((slug) => {
          map.set(slug, resolveSlugStatus(slug, slugCounts));
        });
      });
      return map;
    }, [category.drugs, category.sections, resolveSlugStatus, slugCounts]);

    const categoryIcon = useMemo(() => getCategoryIcon(category.iconKey), [category.iconKey]);
    const sortedPrimaryDrugs = useMemo(
      () => sortSlugsWithCommonPriority(category.drugs),
      [category.drugs, sortSlugsWithCommonPriority],
    );

    // Column assignment - check columns object first, fall back to legacy column, then round-robin
    const currentColumn = useMemo(() => {
      if (category.columns && category.columns[String(columnCount)] !== undefined) {
        return category.columns[String(columnCount)];
      }
      if (category.column !== undefined) {
        return category.column % columnCount;
      }
      return index % columnCount;
    }, [category.columns, category.column, columnCount, index]);

    const handleLabelChange = useCallback(
      (value: string) => {
        onUpdateCategory(index, (current) => ({ ...current, label: value }));
      },
      [index, onUpdateCategory],
    );

    const handleKeyChange = useCallback(
      (value: string) => {
        onUpdateCategory(index, (current) => ({ ...current, key: value }));
      },
      [index, onUpdateCategory],
    );

    const handleIconChange = useCallback(
      (value: string) => {
        onUpdateCategory(index, (current) => ({ ...current, iconKey: value }));
      },
      [index, onUpdateCategory],
    );

    const handleNotesChange = useCallback(
      (value: string) => {
        onUpdateCategory(index, (current) => ({ ...current, notes: value }));
      },
      [index, onUpdateCategory],
    );

    const handleTopLevelAdd = useCallback(
      (slug: string) => {
        onUpdateCategory(index, (current) => ({
          ...current,
          drugs: sortSlugsWithCommonPriority([...current.drugs, slug]),
        }));
      },
      [index, onUpdateCategory, sortSlugsWithCommonPriority],
    );

    const handleTopLevelRemove = useCallback(
      (slug: string) => {
        onUpdateCategory(index, (current) => ({
          ...current,
          drugs: sortSlugsWithCommonPriority(
            current.drugs.filter((entry) => entry !== slug),
          ),
        }));
      },
      [index, onUpdateCategory, sortSlugsWithCommonPriority],
    );

    const handleSectionUpdate = useCallback(
      (sectionIndex: number, nextSection: ManualCategorySection) => {
        onUpdateCategory(index, (current) => {
          if (sectionIndex < 0 || sectionIndex >= current.sections.length) {
            return current;
          }
          const currentSection = current.sections[sectionIndex];
          if (currentSection === nextSection) {
            return current;
          }
          const nextSections = current.sections.slice();
          nextSections[sectionIndex] = nextSection;
          return { ...current, sections: nextSections };
        });
      },
      [index, onUpdateCategory],
    );

    const handleSectionMove = useCallback(
      (sectionIndex: number, direction: "up" | "down") => {
        onUpdateCategory(index, (current) => {
          const targetIndex = direction === "up" ? sectionIndex - 1 : sectionIndex + 1;
          if (targetIndex < 0 || targetIndex >= current.sections.length) {
            return current;
          }
          const nextSections = current.sections.slice();
          const [moved] = nextSections.splice(sectionIndex, 1);
          nextSections.splice(targetIndex, 0, moved);
          return { ...current, sections: nextSections };
        });
      },
      [index, onUpdateCategory],
    );

    const handleSectionRemove = useCallback(
      (sectionIndex: number) => {
        onUpdateCategory(index, (current) => {
          if (sectionIndex < 0 || sectionIndex >= current.sections.length) {
            return current;
          }
          const nextSections = current.sections.filter((_, currentIndex) => currentIndex !== sectionIndex);
          if (nextSections.length === current.sections.length) {
            return current;
          }
          return { ...current, sections: nextSections };
        });
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

    const [detailsOpen, setDetailsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const totalPrimary = category.drugs.length;
    const sectionCount = category.sections.length;
    const categoryKeyId = useId();
    const categoryIconId = useId();
    const categoryNotesId = useId();

    const topLevelSlugSet = useMemo(() => new Set(category.drugs.map((slug) => slugify(slug))), [category.drugs]);
    const categorySlugSet = useMemo(() => {
      const set = new Set<string>();
      category.drugs.forEach((slug) => set.add(slugify(slug)));
      category.sections.forEach((section) => {
        section.drugs.forEach((slug) => set.add(slugify(slug)));
      });
      return set;
    }, [category]);

    const sectionSensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
      useSensor(KeyboardSensor),
    );

    const getSectionId = useCallback(
      (section: ManualCategorySection) => `${category.key}::${section.key}`,
      [category.key],
    );

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

        onUpdateCategory(index, (current) => {
          const fromIndex = current.sections.findIndex((section) => getSectionId(section) === activeId);
          const toIndex = current.sections.findIndex((section) => getSectionId(section) === overId);
          if (fromIndex < 0 || toIndex < 0) {
            return current;
          }
          return {
            ...current,
            sections: arrayMove(current.sections, fromIndex, toIndex),
          };
        });
      },
      [getSectionId, index, onUpdateCategory],
    );

    const detailsPanel = detailsOpen && isExpanded ? (
      <div className="mt-2 w-full max-w-[380px] rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm text-white/75 shadow-inner shadow-black/20">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={categoryKeyId} className="text-xs uppercase tracking-wide text-white/60">Category key</label>
            <Input
              id={categoryKeyId}
              className="w-full"
              value={category.key}
              onChange={(event) => handleKeyChange(event.target.value)}
              placeholder="Unique key"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={categoryIconId} className="text-xs uppercase tracking-wide text-white/60">Icon key</label>
            <Input
              id={categoryIconId}
              className="w-full"
              value={category.iconKey}
              onChange={(event) => handleIconChange(event.target.value)}
              placeholder="Icon identifier"
            />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <label htmlFor={categoryNotesId} className="text-xs uppercase tracking-wide text-white/60">Editor notes</label>
          <Textarea
            id={categoryNotesId}
            className="min-h-[90px] w-full"
            value={category.notes ?? ""}
            onChange={(event) => handleNotesChange(event.target.value)}
            placeholder="Optional editor notes for this category"
          />
        </div>
      </div>
    ) : null;

    return (
      <article ref={setNodeRef} style={dragStyle} className="w-full">
        <div
          className={`group relative overflow-hidden rounded-2xl bg-white/5 p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur backdrop-safe ${
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
                  onChange={(event) => handleLabelChange(event.target.value)}
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
                  {isExpanded ? <Icon icon="lucide:chevron-down" className="h-3.5 w-3.5" size={14} /> : <Icon icon="lucide:chevron-right" className="h-3.5 w-3.5" size={14} />}
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
                  className={`h-7 w-7 ${detailsOpen ? "bg-white/15 text-white" : ""}`.trim()}
                >
                  <Icon icon="lucide:sliders-horizontal" className="h-3.5 w-3.5" size={14} />
                </Button>
                <Button
                  variant="glass"
                  size="icon"
                  onClick={handleRemoveCategory}
                  aria-label="Remove category"
                  className="h-7 w-7 hover:bg-rose-500/20 hover:text-rose-200 hover:ring-rose-400/40"
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
                  <SelectTrigger selectSize="compact" className="min-w-[7rem] bg-slate-950/80">
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

            {detailsPanel}

            {isExpanded ? (
              <div className="space-y-5 text-sm text-white/80">
                <AddSubstanceControl
                  label="Add top level categoryless substance..."
                  existingSlugs={[
                    ...category.drugs,
                    ...category.sections.flatMap((section) => section.drugs),
                  ]}
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
                    <SortableContext
                      items={category.sections.map((section) => getSectionId(section))}
                      strategy={verticalListSortingStrategy}
                    >
                      {category.sections.map((section, sectionIndex) => (
                        <SectionEditor
                          key={`${section.key}-${sectionIndex}`}
                          sortableId={getSectionId(section)}
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
                  <p className="rounded-xl border border-dashed border-white/12 bg-slate-950/45 px-4 py-5 text-sm text-white/65 shadow-inner shadow-black/20">
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

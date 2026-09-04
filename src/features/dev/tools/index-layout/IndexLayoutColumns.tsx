import { type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import { EmptyStateSurface } from "@/components/ui/surface";
import { CategoryEditor, type CategoryExpansionSignal } from "./CategoryEditor";
import type {
  ManualCategoryDefinition,
  SlugStatus,
  SubstanceOption,
} from "./types";
import type { ColumnGroup } from "./useIndexLayoutCategoryController";

function ColumnDroppable({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} role="group" aria-label={label} className={className ?? "flex flex-1 flex-col gap-6"}>
      {children}
    </div>
  );
}

type IndexLayoutColumnsProps = {
  columnCount: number;
  columnGroups: ColumnGroup[];
  draftCategoryTotal: number;
  expansionSignal: CategoryExpansionSignal | null;
  handleDragEnd: (event: DragEndEvent) => void;
  updateCategory: (
    index: number,
    updater: (category: ManualCategoryDefinition) => ManualCategoryDefinition,
  ) => void;
  removeCategory: (index: number) => void;
  moveCategory: (index: number, direction: "up" | "down") => void;
  setColumn: (index: number, column: number) => void;
  addSection: (index: number) => void;
  addCategory: () => void;
  substanceOptions: SubstanceOption[];
  datasetSlugSet: ReadonlySet<string>;
  sortSlugsWithCommonPriority: (slugs: readonly string[]) => string[];
  resolveSlugStatus: (slug: string, counts: Map<string, number>) => SlugStatus;
};

export function IndexLayoutColumns({
  columnCount,
  columnGroups,
  draftCategoryTotal,
  expansionSignal,
  handleDragEnd,
  updateCategory,
  removeCategory,
  moveCategory,
  setColumn,
  addSection,
  addCategory,
  substanceOptions,
  datasetSlugSet,
  sortSlugsWithCommonPriority,
  resolveSlugStatus,
}: IndexLayoutColumnsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  return (
    <div className="space-y-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {/* Below the tablet step the columns stack full width; from md up they sit
            side by side at a fixed width inside a horizontal scroller. */}
        <div className="md:overflow-x-auto md:pb-2">
          <div className="grid grid-cols-1 gap-5 md:flex md:w-max">
            {columnGroups.map(({ index: colIndex, items }) => (
              <SortableContext
                key={colIndex}
                items={items.map(({ category }) => category.key)}
                strategy={verticalListSortingStrategy}
              >
                <ColumnDroppable
                  id={`column-${colIndex}`}
                  label={`Column ${colIndex + 1}`}
                  className="flex w-full flex-col gap-4 md:w-[320px]"
                >
                  {items.length === 0 && (
                    <EmptyStateSurface
                      radius="lg"
                      className="theme-text-faint flex min-h-[120px] items-center justify-center border-dashed text-xs uppercase tracking-widest"
                    >
                      Column {colIndex + 1}
                    </EmptyStateSurface>
                  )}
                  {items.map(({ category, originalIndex }) => (
                    <CategoryEditor
                      key={`${category.key}-${originalIndex}`}
                      category={category}
                      index={originalIndex}
                      total={draftCategoryTotal}
                      columnCount={columnCount}
                      sortableId={category.key}
                      expansionSignal={expansionSignal}
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
                      variant="outline"
                      size="auto"
                      className="theme-text-muted flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-dashed border-[var(--theme-frosted-panel-border)] bg-[var(--theme-frosted-control-bg)] px-6 py-10 transition hover:border-[var(--theme-frosted-control-hover-border)] hover:bg-[var(--theme-frosted-control-hover-bg)] hover:text-[var(--theme-accent-strong)]"
                      onClick={addCategory}
                      aria-label="Add category"
                    >
                      <Icon icon="lucide:plus-circle" className="h-6 w-6" size={24} />
                      <span className="text-xs uppercase tracking-[0.3em]">New category</span>
                    </Button>
                  )}
                </ColumnDroppable>
              </SortableContext>
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

import { type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
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
    useSensor(KeyboardSensor),
  );

  return (
    <div className="space-y-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto pb-2">
          <div className="flex w-max gap-5">
            {columnGroups.map(({ index: colIndex, items }) => (
              <SortableContext
                key={colIndex}
                items={items.map(({ category }) => category.key)}
                strategy={verticalListSortingStrategy}
              >
                <ColumnDroppable
                  id={`column-${colIndex}`}
                  className="flex w-[320px] flex-col gap-4"
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

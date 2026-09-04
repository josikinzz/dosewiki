import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

/**
 * Edge fades on the horizontal scroller, shown only while columns are hidden
 * beyond that edge. Applied as a mask (not an overlay) so the page's gradient
 * canvas shows through; the scrollbar stays visible underneath.
 */
const SCROLL_EDGE_CLASS =
  "data-scroll-start:[mask-image:linear-gradient(to_right,transparent,#000_2.25rem)]"
  + " data-scroll-end:[mask-image:linear-gradient(to_left,transparent,#000_2.25rem)]"
  + " data-scroll-start:data-scroll-end:[mask-image:linear-gradient(to_right,transparent,#000_2.25rem,#000_calc(100%-2.25rem),transparent)]";

/** Fixed column width once the chosen count no longer fits the board. */
const OVERFLOW_COLUMN_WIDTH_CLASS = "w-[320px]";

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
  /** How many columns the board's container can hold at its current width. */
  fitCount: number;
  columnGroups: ColumnGroup[];
  draftCategoryTotal: number;
  expansionSignal: CategoryExpansionSignal | null;
  handleDragEnd: (event: DragEndEvent) => void;
  updateCategory: (
    index: number,
    updater: (category: ManualCategoryDefinition) => ManualCategoryDefinition,
  ) => void;
  removeCategory: (index: number) => void;
  removeSection: (index: number, sectionIndex: number) => void;
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
  fitCount,
  columnGroups,
  draftCategoryTotal,
  expansionSignal,
  handleDragEnd,
  updateCategory,
  removeCategory,
  removeSection,
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

  // When the editor asks for more columns than fit, the board keeps each
  // column at a readable width and scrolls sideways inside its own box.
  // Otherwise the columns share the width, so the last one is never clipped.
  const overflows = columnCount > fitCount;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const syncEdges = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    const next = { start: scroller.scrollLeft > 4, end: scroller.scrollLeft < maxScroll - 4 };
    setEdges((previous) =>
      previous.start === next.start && previous.end === next.end ? previous : next);
  }, []);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    syncEdges();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncEdges);
      return () => window.removeEventListener("resize", syncEdges);
    }
    const observer = new ResizeObserver(syncEdges);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [overflows, columnCount, syncEdges]);

  return (
    <div className="space-y-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={overflows ? scrollerRef : undefined}
          onScroll={overflows ? syncEdges : undefined}
          data-scroll-start={overflows && edges.start ? "" : undefined}
          data-scroll-end={overflows && edges.end ? "" : undefined}
          className={overflows ? `overflow-x-auto pb-2 ${SCROLL_EDGE_CLASS}` : undefined}
        >
          <div
            className={overflows ? "flex w-max gap-5" : "grid gap-5"}
            style={overflows ? undefined : { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {columnGroups.map(({ index: colIndex, items }) => (
              <SortableContext
                key={colIndex}
                items={items.map(({ category }) => category.key)}
                strategy={verticalListSortingStrategy}
              >
                <ColumnDroppable
                  id={`column-${colIndex}`}
                  label={`Column ${colIndex + 1}`}
                  className={`flex min-w-0 flex-col gap-4 ${overflows ? OVERFLOW_COLUMN_WIDTH_CLASS : "w-full"}`}
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
                      onRemoveSection={removeSection}
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

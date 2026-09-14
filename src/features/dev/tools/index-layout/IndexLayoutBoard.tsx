"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMemo, useState, type ReactNode } from "react";
import { IndexPanelGrid, INDEX_PANEL_STACK_CLASS_NAME } from "@/components/common/IndexPanelLayout";
import { arrangeGroupsByLayout, type ColumnLayoutTable } from "@/features/article/components/sections/CategoryGrid";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import type { BoardCategory, BoardSection } from "./boardModel";
import { IndexLayoutCard } from "./IndexLayoutCard";
import type { BoardActions } from "./IndexLayoutCardMenus";
import { parseRowId } from "./LayoutDrugRow";
import type { LayoutSlot } from "./layoutOps";

/** One card of the grid, already resolved to the tab being shown. */
export type LayoutPanel = {
  key: string;
  category: BoardCategory;
  sections: readonly BoardSection[];
  title: string;
  hideIcon: boolean;
  chrome: "category" | "section";
  /** Panel-order siblings for a section panel's move affordance. */
  siblings?: readonly BoardSection[];
};

export interface IndexLayoutBoardProps {
  panels: readonly LayoutPanel[];
  /** The hand-authored column table when the view has one; round-robin otherwise. */
  columnLayout?: ColumnLayoutTable;
  actions: BoardActions;
  /** Every drop target of the current view, so a dropped row finds its list. */
  sections: readonly BoardSection[];
  /** Drop a dragged substance at `index` of `to`; `from` and `to` may be the same slot. */
  onDrop: (from: LayoutSlot, slug: string, to: LayoutSlot, index: number) => void;
  resolveName: (slug: string) => string;
  emptyMessage: string;
  /** The unplaced tray, inside the same drag context as the panels. */
  tray?: ReactNode;
}

/**
 * The panels arranged the way the page arranges them, in one drag context that
 * also spans the tray, so a substance can travel between sections, between
 * categories, and in or out of the index in a single gesture.
 */
export function IndexLayoutBoard({
  panels,
  columnLayout,
  actions,
  sections,
  onDrop,
  resolveName,
  emptyMessage,
  tray,
}: IndexLayoutBoardProps) {
  const { count: columnCount, gate, ref: panelRef } = useResponsiveColumnCount();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const columns = useMemo(() => {
    const arranged = columnLayout
      ? arrangeGroupsByLayout(panels, columnLayout, columnCount)
      : new Map(
          Array.from({ length: columnCount }, (_, column) => [
            column,
            panels.filter((_, index) => index % columnCount === column),
          ]),
        );
    return Array.from({ length: columnCount }, (_, index) => arranged.get(index) ?? []).filter(
      (stack) => stack.length > 0,
    );
  }, [columnCount, columnLayout, panels]);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLabel(null);
    const { active, over } = event;
    if (!over) return;
    const source = parseRowId(String(active.id));
    if (!source) return;

    const overRow = parseRowId(String(over.id));
    if (overRow) {
      const target = sections.find(
        (section) =>
          section.slot.categoryKey === overRow.slot.categoryKey &&
          section.slot.sectionKey === overRow.slot.sectionKey,
      );
      const index = target?.items.findIndex((item) => item.slug === overRow.slug) ?? -1;
      onDrop(source.slot, source.slug, overRow.slot, index < 0 ? 0 : index);
      return;
    }

    // Dropped on a list itself: an empty section, the tray, or below the last row.
    const target = sections.find((section) => section.id === String(over.id));
    if (target) {
      onDrop(source.slot, source.slug, target.slot, target.items.length);
      return;
    }

    const overSlot = parseRowId(`${String(over.id)}::`);
    if (overSlot) {
      onDrop(source.slot, source.slug, overSlot.slot, 0);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event: DragStartEvent) => {
        const row = parseRowId(String(event.active.id));
        setActiveLabel(row ? resolveName(row.slug) : null);
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLabel(null)}
    >
      {columns.length === 0 ? (
        <p className="theme-text-muted px-4 py-10 text-center text-sm">{emptyMessage}</p>
      ) : (
        <IndexPanelGrid ref={panelRef} columns={columns.length} gate={gate}>
          {columns.map((stack, columnIndex) => (
            <div key={columnIndex} className={INDEX_PANEL_STACK_CLASS_NAME}>
              {stack.map((panel) => (
                <IndexLayoutCard
                  key={panel.key}
                  category={panel.category}
                  sections={panel.sections}
                  title={panel.title}
                  hideIcon={panel.hideIcon}
                  chrome={panel.chrome}
                  siblings={panel.siblings}
                  actions={actions}
                />
              ))}
            </div>
          ))}
        </IndexPanelGrid>
      )}
      {tray ? <div className="mt-8">{tray}</div> : null}
      <DragOverlay dropAnimation={null}>
        {activeLabel ? (
          <div className="theme-index-card-link theme-overlay-shadow flex items-center gap-3 rounded-xl bg-dose-surface-muted px-3 py-2.5 text-[0.9375rem] ring-1 ring-dose-accent-strong">
            <span className="theme-index-card-bullet inline-block h-1.5 w-1.5 rounded-full" />
            <span className="theme-index-card-label">{activeLabel}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

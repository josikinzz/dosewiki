"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMemo, useState, type ReactNode } from "react";
import { IndexPanelGrid, INDEX_PANEL_STACK_CLASS_NAME } from "@/components/common/IndexPanelLayout";
import { arrangeGroupsByLayout, type ColumnLayoutTable } from "@/features/article/components/sections/CategoryGrid";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { UNPLACED_SLOT, type BoardCategory, type BoardSection } from "./boardModel";
import { IndexLayoutCard } from "./IndexLayoutCard";
import type { BoardActions } from "./IndexLayoutCardMenus";
import { parseRowId } from "./LayoutDrugRow";
import { slotsEqual, type LayoutSlot } from "./layoutOps";

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
  /** What the board says when the view has no panels. */
  emptyMessage: ReactNode;
  /**
   * The unplaced tray, inside the same drag context as the panels. It sits
   * above the board below `xl` and in a sticky column beside it from `xl`.
   */
  tray?: ReactNode;
}

const SCREEN_READER_INSTRUCTIONS =
  "To move a substance, press space or enter on its handle to pick it up, use the arrow keys to move it within and between lists, and press space or enter again to drop it. Escape puts it back. Each row's menu can do the same.";

/**
 * The panels arranged the way the page arranges them, in one drag context that
 * also spans the tray, so a substance can travel between sections, between
 * categories, and in or out of the index in a single gesture. A mouse drags at
 * once; a finger holds the handle for a moment first, so a swipe still scrolls.
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
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
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

  /** Where a drag is over, in words: a list name, "the unplaced tray", or a row's list and position. */
  const describeOver = (id: string | number | undefined): string | null => {
    if (id === undefined) return null;
    const row = parseRowId(String(id));
    if (row) {
      if (slotsEqual(row.slot, UNPLACED_SLOT)) return "the substances not in this index";
      const section = sections.find((entry) => slotsEqual(entry.slot, row.slot));
      const position = (section?.items.findIndex((item) => item.slug === row.slug) ?? -1) + 1;
      return `${actions.listName(row.slot)}${position > 0 ? `, position ${position}` : ""}`;
    }
    const section = sections.find((entry) => entry.id === String(id));
    if (section) return `the end of ${actions.listName(section.slot)}`;
    if (String(id) === `${UNPLACED_SLOT.categoryKey}::`) return "the substances not in this index";
    return null;
  };
  const nameOf = (id: string | number) => {
    const row = parseRowId(String(id));
    return row ? resolveName(row.slug) : "The substance";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const row = parseRowId(String(active.id));
      const from = row && !slotsEqual(row.slot, UNPLACED_SLOT) ? ` from ${actions.listName(row.slot)}` : "";
      return `Picked up ${nameOf(active.id)}${from}.`;
    },
    onDragOver: ({ active, over }) => {
      const where = describeOver(over?.id);
      return where ? `${nameOf(active.id)} is over ${where}.` : `${nameOf(active.id)} is not over a list.`;
    },
    onDragEnd: ({ active, over }) => {
      const where = describeOver(over?.id);
      return where ? `Dropped ${nameOf(active.id)} on ${where}.` : `Dropped ${nameOf(active.id)} where it was.`;
    },
    onDragCancel: ({ active }) => `Put ${nameOf(active.id)} back where it was.`,
  };

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

  const board = columns.length === 0 ? (
    <div className="px-4 py-10">{emptyMessage}</div>
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
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements, screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS } }}
      onDragStart={(event: DragStartEvent) => {
        const row = parseRowId(String(event.active.id));
        setActiveLabel(row ? resolveName(row.slug) : null);
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLabel(null)}
    >
      {tray ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start xl:gap-8">
          <div className="min-w-0 xl:col-start-2 xl:row-start-1 xl:sticky xl:top-24">{tray}</div>
          <div className="min-w-0 xl:col-start-1 xl:row-start-1">{board}</div>
        </div>
      ) : (
        board
      )}
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

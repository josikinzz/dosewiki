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
import { useMemo, useState } from "react";
import { IndexPanelGrid, INDEX_PANEL_STACK_CLASS_NAME } from "@/components/common/IndexPanelLayout";
import { SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT } from "@/components/pages/substanceIndexAllLayout";
import { arrangeGroupsByLayout } from "@/features/article/components/sections/CategoryGrid";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import type { BoardCategory } from "./boardModel";
import { IndexLayoutCard, type BoardActions } from "./IndexLayoutCard";
import { parseRowId } from "./LayoutDrugRow";
import type { LayoutSlot } from "./layoutOps";
import type { ManualDatasetKey } from "./types";

export interface IndexLayoutBoardProps {
  dataset: ManualDatasetKey;
  board: readonly BoardCategory[];
  /** "all" mirrors the public All tab; a category key mirrors that category's tab. */
  view: string;
  actions: BoardActions;
  /** Drop a dragged substance at `index` of `to`; `from` and `to` may be the same slot. */
  onDrop: (from: LayoutSlot, slug: string, to: LayoutSlot, index: number) => void;
}

/**
 * The panels arranged as the public page arranges them: the psychoactive All
 * tab follows the hand-authored column table, everything else round-robins
 * across the responsive column count, and a category tab splits into one
 * panel per section. One drag context spans every list, so a substance can be
 * dragged between sections and between categories.
 */
export function IndexLayoutBoard({ dataset, board, view, actions, onDrop }: IndexLayoutBoardProps) {
  const { count: columnCount, gate } = useResponsiveColumnCount();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const labelsByRow = useMemo(() => {
    const labels = new Map<string, string>();
    for (const category of board) {
      for (const section of category.sections) {
        for (const item of section.items) {
          labels.set(`${section.id}::${item.slug}`, item.name);
        }
      }
    }
    return labels;
  }, [board]);

  const columns = useMemo(() => {
    if (view !== "all") {
      const category = board.find((entry) => entry.key === view);
      if (!category) return [];
      const panels = category.sections.map((section) => ({ key: section.id, category, section }));
      const stacks = Array.from({ length: columnCount }, () => [] as typeof panels);
      panels.forEach((panel, index) => stacks[index % columnCount].push(panel));
      return stacks.filter((stack) => stack.length > 0);
    }
    const groups = board.map((category) => ({ key: category.key, category, section: null }));
    const arranged =
      dataset === "psychoactive"
        ? arrangeGroupsByLayout(groups, SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT, columnCount)
        : new Map(
            Array.from({ length: columnCount }, (_, column) => [
              column,
              groups.filter((_, index) => index % columnCount === column),
            ]),
          );
    return Array.from({ length: columnCount }, (_, index) => arranged.get(index) ?? []).filter(
      (stack) => stack.length > 0,
    );
  }, [board, columnCount, dataset, view]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveLabel(labelsByRow.get(String(event.active.id)) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLabel(null);
    const { active, over } = event;
    if (!over) return;
    const source = parseRowId(String(active.id));
    if (!source) return;
    const overRow = parseRowId(String(over.id));
    if (overRow) {
      const target = board
        .flatMap((category) => category.sections)
        .find((section) => section.slot.categoryKey === overRow.slot.categoryKey && section.slot.sectionKey === overRow.slot.sectionKey);
      const index = target?.items.findIndex((item) => item.slug === overRow.slug) ?? -1;
      if (index < 0) return;
      onDrop(source.slot, source.slug, overRow.slot, index);
      return;
    }
    // Dropped on a list itself (an empty section, or below the last row).
    const target = board.flatMap((category) => category.sections).find((section) => section.id === String(over.id));
    if (!target) return;
    onDrop(source.slot, source.slug, target.slot, target.items.length);
  };

  if (columns.length === 0) {
    return (
      <p className="theme-text-muted px-4 py-10 text-center text-sm">
        {view === "all" ? "This index has no categories yet. Add one from the toolbar." : "This category no longer exists in the draft."}
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLabel(null)}
    >
      <IndexPanelGrid columns={columns.length} gate={gate}>
        {columns.map((stack, columnIndex) => (
          <div key={columnIndex} className={INDEX_PANEL_STACK_CLASS_NAME}>
            {stack.map((panel) =>
              panel.section ? (
                <IndexLayoutCard
                  key={panel.key}
                  category={panel.category}
                  sections={[panel.section]}
                  title={panel.section.label ?? panel.category.label}
                  hideIcon
                  showSectionHeaders={false}
                  showCategoryTools={false}
                  actions={actions}
                />
              ) : (
                <IndexLayoutCard key={panel.key} category={panel.category} actions={actions} />
              ),
            )}
          </div>
        ))}
      </IndexPanelGrid>
      <DragOverlay dropAnimation={null}>
        {activeLabel ? (
          <div className="theme-index-card-link flex items-center gap-3 rounded-xl bg-dose-surface-muted px-3 py-2.5 text-[0.9375rem] shadow-[var(--theme-elevation-overlay)] ring-1 ring-dose-accent-strong">
            <span className="theme-index-card-bullet inline-block h-1.5 w-1.5 rounded-full" />
            <span className="theme-index-card-label">{activeLabel}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

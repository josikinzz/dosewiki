"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorStatusPill } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import type { BoardDestination, BoardItem } from "./boardModel";
import { slotId, slotsEqual, type LayoutSlot, type MoveDirection } from "./layoutOps";
import { slugIssueLabels, slugIssueTones } from "./types";

export function rowId(slot: LayoutSlot, slug: string): string {
  return `${slotId(slot)}::${slug}`;
}

export function parseRowId(id: string): { slot: LayoutSlot; slug: string } | null {
  const parts = id.split("::");
  if (parts.length !== 3) return null;
  return { slot: { categoryKey: parts[0], sectionKey: parts[1] === "" ? null : parts[1] }, slug: parts[2] };
}

/**
 * Icon buttons on a 28px box: dense enough to sit inside a 44px index row,
 * and the row itself is the coarse-pointer target.
 */
const ROW_CONTROL_CLASS = "h-7 w-7 rounded-lg p-0";

export interface LayoutDrugRowProps {
  slot: LayoutSlot;
  item: BoardItem;
  /** Position within the slot, for the bump affordances. */
  index: number;
  count: number;
  destinations: readonly BoardDestination[];
  onBump: (slot: LayoutSlot, slug: string, direction: MoveDirection) => void;
  onMove: (from: LayoutSlot, slug: string, to: LayoutSlot) => void;
  onRemove: (slot: LayoutSlot, slug: string) => void;
  /**
   * Tray rows have no order to bump and nothing to remove from: their only
   * actions are the destinations that put them into the index.
   */
  variant?: "list" | "tray";
}

/**
 * One substance line, drawn like the public index row (bullet, label) with the
 * editing handles a reader never sees: a grip to drag, bump arrows, and a menu
 * for moving elsewhere or removing. Handles stay quiet until the row is hovered
 * or focused; on coarse pointers they are always present.
 */
export const LayoutDrugRow = memo(function LayoutDrugRow({
  slot,
  item,
  index,
  count,
  destinations,
  onBump,
  onMove,
  onRemove,
  variant = "list",
}: LayoutDrugRowProps) {
  const id = rowId(slot, item.slug);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const isTray = variant === "tray";
  const canUp = !isTray && index > 0;
  const canDown = !isTray && index < count - 1;
  const grouped = new Map<string, BoardDestination[]>();
  for (const destination of destinations) {
    if (slotsEqual(destination.slot, slot)) continue;
    const list = grouped.get(destination.categoryLabel) ?? [];
    list.push(destination);
    grouped.set(destination.categoryLabel, list);
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "theme-index-card-link theme-text-secondary group/item relative mx-1 flex min-w-0 w-[calc(100%-1rem)] items-center gap-1 rounded-xl py-1 pl-1 pr-1 text-[0.9375rem] transition-[background-color,color,padding] duration-200 hover:bg-dose-surface-muted hover:text-dose-text focus-within:bg-dose-surface-muted focus-within:text-dose-text",
        isTray
          ? "group-hover/item:pr-9 focus-within:pr-9 [@media(pointer:coarse)]:pr-9"
          : "group-hover/item:pr-[5.5rem] focus-within:pr-[5.5rem] [@media(pointer:coarse)]:pr-[5.5rem]",
        isDragging && "z-10 opacity-40",
        item.hiddenOnSite && "opacity-70",
      )}
      data-slug={item.slug}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className={cn(
          "theme-focus-ring theme-text-faint flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md hover:text-dose-text active:cursor-grabbing",
          "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100",
        )}
        aria-label={`Drag ${item.name}`}
        {...attributes}
        {...listeners}
      >
        <Icon icon="lucide:grip-vertical" size={14} />
      </button>
      <span className="theme-index-card-bullet mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full" />
      <span className="theme-index-card-label min-w-0 flex-1 truncate py-1.5">{item.name}</span>
      {item.issues.map((issue) => (
        <EditorStatusPill key={issue} tone={slugIssueTones[issue]} className="min-w-0 shrink px-1.5 py-0 text-[10px]">
          {slugIssueLabels[issue]}
        </EditorStatusPill>
      ))}
      <span
        className={cn(
          "absolute right-1 top-1/2 flex -translate-y-1/2 items-center",
          "opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 [@media(pointer:coarse)]:opacity-100",
        )}
      >
        {isTray ? null : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="auto"
              className={ROW_CONTROL_CLASS}
              disabled={!canUp}
              aria-label={`Move ${item.name} up`}
              onClick={() => onBump(slot, item.slug, "up")}
            >
              <Icon icon="lucide:chevron-up" size={15} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="auto"
              className={ROW_CONTROL_CLASS}
              disabled={!canDown}
              aria-label={`Move ${item.name} down`}
              onClick={() => onBump(slot, item.slug, "down")}
            >
              <Icon icon="lucide:chevron-down" size={15} />
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="auto"
              className={ROW_CONTROL_CLASS}
              aria-label={isTray ? `Place ${item.name} in the index` : `More actions for ${item.name}`}
            >
              <Icon icon="lucide:ellipsis" size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Icon icon="lucide:corner-down-right" size={14} className="mr-2" />
                {isTray ? "Place in" : "Move to"}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-[60vh] min-w-[14rem] overflow-y-auto">
                  {[...grouped.entries()].map(([categoryLabel, entries], groupIndex) => (
                    <div key={categoryLabel}>
                      {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuLabel className="theme-text-faint text-[11px] uppercase tracking-[0.18em]">
                        {categoryLabel}
                      </DropdownMenuLabel>
                      {entries.map((destination) => (
                        <DropdownMenuItem
                          key={slotId(destination.slot)}
                          onSelect={() => onMove(slot, item.slug, destination.slot)}
                        >
                          {destination.sectionLabel ?? "Category list"}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            {isTray ? null : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-dose-danger focus:text-dose-danger"
                  onSelect={() => onRemove(slot, item.slug)}
                >
                  <Icon icon="lucide:x" size={14} className="mr-2" />
                  Remove from this list
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </li>
  );
});

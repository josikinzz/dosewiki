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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { EditorStatusPill } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import type { BoardItem } from "./boardModel";
import { slotId, type LayoutSlot, type MoveDirection } from "./layoutOps";
import type { LayoutMoveRequest } from "./LayoutMoveDialog";
import { slugIssueLabels, slugIssueNotes, slugIssueTones } from "./types";

export function rowId(slot: LayoutSlot, slug: string): string {
  return `${slotId(slot)}::${slug}`;
}

export function parseRowId(id: string): { slot: LayoutSlot; slug: string } | null {
  const parts = id.split("::");
  if (parts.length !== 3) return null;
  return { slot: { categoryKey: parts[0], sectionKey: parts[1] === "" ? null : parts[1] }, slug: parts[2] };
}

/**
 * Icon buttons on a 28px box with a 44px halo: dense enough to sit inside an
 * index row without stealing its name's width.
 */
const ROW_CONTROL_CLASS = cn("h-7 w-7 scroll-mb-28 scroll-mt-28 rounded-control p-0", TOUCH_HALO);

export type RowPlace = "top" | "end";

export interface LayoutDrugRowProps {
  slot: LayoutSlot;
  item: BoardItem;
  /** Position within the slot, for the move affordances. */
  index: number;
  count: number;
  /** The list's name ("Psychedelic, Common"), for the menu and the move dialog. */
  listLabel: string | null;
  onBump: (slot: LayoutSlot, slug: string, direction: MoveDirection) => void;
  onPlace?: (slot: LayoutSlot, slug: string, place: RowPlace) => void;
  onRequestMove: (request: LayoutMoveRequest) => void;
  onRemove: (slot: LayoutSlot, slug: string) => void;
  /** The working changes put this row here (moved, added or reordered): an unsaved dot after the name. */
  changed?: boolean;
  /**
   * Tray rows have no order to change and nothing to remove from: their one
   * action is the Place button that puts them into the index.
   */
  variant?: "list" | "tray";
}

/**
 * One substance line, drawn like the public index row (bullet, label) with the
 * editing handles a reader never sees: a grip to drag, and a menu that can do
 * everything the grip does (move up, down, to the top or end, to another list,
 * out of this list). On a fine pointer the grip and the up and down arrows
 * wake on hover or focus; on a touch screen the grip and the menu are always
 * there and the arrows live in the menu, so the name keeps its width.
 */
export const LayoutDrugRow = memo(function LayoutDrugRow({
  slot,
  item,
  index,
  count,
  listLabel,
  onBump,
  onPlace,
  onRequestMove,
  onRemove,
  changed = false,
  variant = "list",
}: LayoutDrugRowProps) {
  const id = rowId(slot, item.slug);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const isTray = variant === "tray";
  const first = index === 0;
  const last = index >= count - 1;
  const moveRequest: LayoutMoveRequest = { from: slot, slug: item.slug, name: item.name, fromLabel: isTray ? null : listLabel };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "theme-index-card-link theme-text-secondary group/item relative mx-1 flex min-w-0 w-[calc(100%-1rem)] items-center gap-1 rounded-xl py-1 pl-1 pr-1 text-[0.9375rem] transition-[background-color,color] duration-200 hover:bg-dose-surface-muted hover:text-dose-text focus-within:bg-dose-surface-muted focus-within:text-dose-text",
        isDragging && "z-10 opacity-40",
        item.hiddenOnSite && "opacity-70",
      )}
      data-row={id}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className={cn(
          "theme-focus-ring theme-text-faint flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-control hover:text-dose-text active:cursor-grabbing",
          "[@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover/item:opacity-100 [@media(pointer:fine)]:group-focus-within/item:opacity-100",
          TOUCH_HALO,
        )}
        aria-label={isTray ? `Drag ${item.name} into the index` : `Drag ${item.name}, ${index + 1} of ${count} in ${listLabel ?? "this list"}`}
        {...attributes}
        {...listeners}
      >
        <Icon icon="lucide:grip-vertical" size={14} />
      </button>
      <span aria-hidden className="theme-index-card-bullet mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full" />
      {/* Pills ride inline after the name, so a long name wraps at its words instead of being squeezed by them. */}
      <span className="theme-index-card-label min-w-0 flex-1 break-words py-1.5">
        {item.name}
        {changed ? (
          <>
            <span aria-hidden className="theme-dev-unsaved-dot ml-2 inline-block size-1.5 rounded-full align-middle" />
            <span className="sr-only">, changed</span>
          </>
        ) : null}
        {item.issues.map((issue) => (
          <EditorStatusPill key={issue} inline tone={slugIssueTones[issue]} className="ml-2 align-middle">
            <span className="sr-only">, </span>
            {slugIssueLabels[issue]}
          </EditorStatusPill>
        ))}
      </span>
      <span className="flex shrink-0 items-center">
        {isTray ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-7 px-2 text-xs"
            aria-label={`Place ${item.name} in the index`}
            onClick={() => onRequestMove(moveRequest)}
          >
            Place
          </Button>
        ) : (
          <>
            <span className="hidden items-center [@media(pointer:fine)]:flex [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:transition-opacity [@media(pointer:fine)]:group-hover/item:opacity-100 [@media(pointer:fine)]:group-focus-within/item:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="auto"
                className={ROW_CONTROL_CLASS}
                disabled={first}
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
                disabled={last}
                aria-label={`Move ${item.name} down`}
                onClick={() => onBump(slot, item.slug, "down")}
              >
                <Icon icon="lucide:chevron-down" size={15} />
              </Button>
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="auto"
                  data-control="menu"
                  className={cn(
                    ROW_CONTROL_CLASS,
                    "[@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:transition-opacity [@media(pointer:fine)]:group-hover/item:opacity-100 [@media(pointer:fine)]:group-focus-within/item:opacity-100 data-[state=open]:opacity-100",
                  )}
                  aria-label={`More actions for ${item.name}`}
                >
                  <Icon icon="lucide:ellipsis" size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
                <div className="px-2 space-y-0.5 py-2 font-normal">
                  <span className="theme-text-primary block text-sm font-medium">{item.name}</span>
                  <span className="theme-text-muted block text-xs">
                    {listLabel ? `${index + 1} of ${count} in ${listLabel}` : `${index + 1} of ${count}`}
                  </span>
                  {item.issues.map((issue) => (
                    <span key={issue} className="theme-warning-text block text-xs">{slugIssueNotes[issue]}</span>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={first} onSelect={() => onBump(slot, item.slug, "up")}>
                  <Icon icon="lucide:arrow-up" size={14} className="mr-2" />
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={last} onSelect={() => onBump(slot, item.slug, "down")}>
                  <Icon icon="lucide:arrow-down" size={14} className="mr-2" />
                  Move down
                </DropdownMenuItem>
                {onPlace ? (
                  <>
                    <DropdownMenuItem disabled={first} onSelect={() => onPlace(slot, item.slug, "top")}>
                      <Icon icon="lucide:arrow-up-to-line" size={14} className="mr-2" />
                      Move to the top
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={last} onSelect={() => onPlace(slot, item.slug, "end")}>
                      <Icon icon="lucide:arrow-down-to-line" size={14} className="mr-2" />
                      Move to the end
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onRequestMove(moveRequest)}>
                  <Icon icon="lucide:corner-down-right" size={14} className="mr-2" />
                  Move to another list
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-dose-danger focus:text-dose-danger"
                  onSelect={() => onRemove(slot, item.slug)}
                >
                  <Icon icon="lucide:x" size={14} className="mr-2" />
                  Remove from this list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </span>
    </li>
  );
});

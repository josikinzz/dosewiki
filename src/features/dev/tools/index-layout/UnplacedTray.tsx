"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorPanel, EditorPanelBody, EditorPanelHeader, EditorStatusPill } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { UNPLACED_SLOT, type BoardDestination, type BoardItem } from "./boardModel";
import { LayoutDrugRow, rowId } from "./LayoutDrugRow";
import type { LayoutSlot } from "./layoutOps";

/** Enough to scan; the filter is how you reach the rest of a long tail. */
const MAX_VISIBLE = 60;

export interface UnplacedTrayProps {
  /** Public substances the layout leaves out: every one of these is a gap. */
  items: readonly BoardItem[];
  /** Hidden and direct-URL-only substances, which the index is right to omit. */
  hiddenItems: readonly BoardItem[];
  destinations: readonly BoardDestination[];
  onMove: (from: LayoutSlot, slug: string, to: LayoutSlot) => void;
}

/**
 * The substances this index does not place. Public ones are gaps a reader would
 * notice, so they lead; hidden and direct-URL-only articles are absent on
 * purpose and stay behind a toggle. Drag a row into a panel to place it, or
 * drop a placed substance here to take it out of the index.
 */
export function UnplacedTray({ items, hiddenItems, destinations, onMove }: UnplacedTrayProps) {
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: `${UNPLACED_SLOT.categoryKey}::` });

  const pool = useMemo(
    () => (showHidden ? [...items, ...hiddenItems].sort((a, b) => a.name.localeCompare(b.name)) : items),
    [hiddenItems, items, showHidden],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pool;
    return pool.filter(
      (item) => item.name.toLowerCase().includes(needle) || item.slug.toLowerCase().includes(needle),
    );
  }, [pool, query]);

  const shown = matches.slice(0, MAX_VISIBLE);

  return (
    <EditorPanel variant="subtle">
      <EditorPanelHeader
        icon="lucide:inbox"
        title="Not in this index"
        description="Drag one into a panel to place it, or drop a placed substance here to take it out."
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <EditorStatusPill tone={items.length > 0 ? "warning" : "success"}>
              {items.length} public {items.length === 1 ? "substance" : "substances"} unplaced
            </EditorStatusPill>
            <Button
              type="button"
              variant={showHidden ? "pillActive" : "ghost"}
              size="sm"
              aria-pressed={showHidden}
              onClick={() => setShowHidden((previous) => !previous)}
            >
              {showHidden ? "Hide" : "Show"} {hiddenItems.length} hidden
            </Button>
          </span>
        }
      />
      <EditorPanelBody density="compact">
        {pool.length > MAX_VISIBLE ? (
          <div className="mb-2 max-w-xs">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              inputSize="sm"
              placeholder="Filter these substances"
              aria-label="Filter substances missing from this index"
            />
          </div>
        ) : null}
        <SortableContext
          id={`${UNPLACED_SLOT.categoryKey}::`}
          items={shown.map((item) => rowId(UNPLACED_SLOT, item.slug))}
          strategy={verticalListSortingStrategy}
        >
          <ul
            ref={setNodeRef}
            className={cn(
              "grid min-h-[3rem] gap-0.5 rounded-xl transition-colors sm:grid-cols-2 xl:grid-cols-3",
              isOver && "bg-dose-surface-muted ring-1 ring-dose-accent-strong",
            )}
            aria-label="Substances missing from this index"
          >
            {shown.length === 0 ? (
              <li className="theme-text-faint flex items-center gap-2 px-3 py-2 text-sm italic">
                <Icon icon="lucide:check" size={14} />
                {matches.length === pool.length
                  ? "Every public substance is placed."
                  : "No match in this list."}
              </li>
            ) : null}
            {shown.map((item) => (
              <LayoutDrugRow
                key={rowId(UNPLACED_SLOT, item.slug)}
                slot={UNPLACED_SLOT}
                item={item}
                index={0}
                count={1}
                destinations={destinations}
                onBump={() => undefined}
                onMove={onMove}
                onRemove={() => undefined}
                variant="tray"
              />
            ))}
          </ul>
        </SortableContext>
        {matches.length > shown.length ? (
          <p className="theme-text-faint mt-2 text-xs">{matches.length - shown.length} more in this list.</p>
        ) : null}
      </EditorPanelBody>
    </EditorPanel>
  );
}

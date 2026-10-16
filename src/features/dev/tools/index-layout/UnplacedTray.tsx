"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useId, useMemo, useState } from "react";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO, TOUCH_PILL } from "@/components/ui/touchTargets";
import { EditorPanel } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { UNPLACED_SLOT, type BoardItem } from "./boardModel";
import { LayoutDrugRow, rowId } from "./LayoutDrugRow";
import type { LayoutMoveRequest } from "./LayoutMoveDialog";
import { countNoun } from "./layoutModel";

const MAX_VISIBLE = 60;
const FILTER_FROM = 8;

export interface UnplacedTrayProps {
  items: readonly BoardItem[];
  hiddenItems: readonly BoardItem[];
  onRequestMove: (request: LayoutMoveRequest) => void;
  datasetLabel: string;
}

export function UnplacedTray({ items, hiddenItems, onRequestMove, datasetLabel }: UnplacedTrayProps) {
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const headingId = useId();
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
  const gaps = items.length;
  const summary = gaps === 0
    ? "Every public substance is placed."
    : `${countNoun(gaps, "public substance")} ${gaps === 1 ? "is" : "are"} missing from this index.`;
  const showFilter = items.length + hiddenItems.length > FILTER_FROM || query.length > 0;

  return (
    <EditorPanel
      variant="subtle"
      className={cn("overflow-visible transition-shadow", isOver && "ring-1 ring-dose-accent-strong")}
    >
      <section ref={setNodeRef} aria-labelledby={headingId} className="space-y-3 px-4 py-3.5">
        <h3 id={headingId} className="m-0">
          <span className="theme-text-primary hidden items-center gap-2 text-base font-semibold xl:flex">
            <Icon icon="lucide:inbox" size={16} className="theme-text-faint shrink-0" />
            Not in this index
            <span className="sr-only">{`, ${datasetLabel}`}</span>
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((value) => !value)}
            className={cn("theme-focus-ring theme-text-primary flex w-full items-center gap-2 rounded-control text-left text-base font-semibold xl:hidden", TOUCH_PILL)}
          >
            <Icon icon="lucide:inbox" size={16} className="theme-text-faint shrink-0" />
            <span className="min-w-0 flex-1">
              Not in this index
              <span className="theme-text-muted ml-2 text-sm font-normal tabular-nums">
                <span className="sr-only">, </span>
                {gaps === 0 ? "none missing" : `${gaps} missing`}
              </span>
            </span>
            <ExpandIndicator isExpanded={open} />
          </button>
        </h3>

        <p className={cn("flex items-start gap-2 text-sm", gaps > 0 ? "theme-text-primary" : "theme-text-muted")}>
          <Icon
            icon={gaps > 0 ? "lucide:circle-dashed" : "lucide:check"}
            size={14}
            className={cn("mt-0.5 shrink-0", gaps > 0 ? "text-dose-warning" : "text-dose-success")}
          />
          <span>{summary}</span>
        </p>

        <div id={bodyId} className={cn("space-y-3", open ? "block" : "hidden", "xl:block")}>
          <p className="theme-text-muted text-xs">
            <span className="[@media(pointer:coarse)]:hidden">Drag one onto a list, or use Place. Drop a placed substance here to take it out.</span>
            <span className="hidden [@media(pointer:coarse)]:inline">Tap Place to put one in a list, or hold a handle and drag.</span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {hiddenItems.length > 0 ? (
              <Button
                type="button"
                variant={showHidden ? "pillActive" : "outline"}
                size="sm"
                aria-pressed={showHidden}
                onClick={() => setShowHidden((previous) => !previous)}
              >
                {showHidden ? "Hide" : "Show"} {hiddenItems.length} hidden
              </Button>
            ) : null}
          </div>

          {showFilter ? (
            <div className="relative">
              <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    setQuery("");
                  }
                }}
                inputSize="sm"
                className="pl-9"
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
              className={cn(
                "grid min-h-[3rem] content-start gap-0.5 rounded-xl transition-colors sm:grid-cols-2 xl:max-h-[calc(100dvh-22rem)] xl:grid-cols-1 xl:overflow-y-auto",
                isOver && "bg-dose-surface-muted",
              )}
              aria-label="Substances missing from this index"
            >
              {shown.length === 0 ? (
                <li className="theme-text-muted flex items-center gap-2 px-3 py-2 text-sm">
                  <Icon icon="lucide:check" size={14} />
                  {matches.length === pool.length ? "Every public substance is placed." : "No match in this list."}
                  {matches.length !== pool.length ? (
                    <Button type="button" variant="link" size="auto" className={cn("text-sm", TOUCH_HALO)} onClick={() => setQuery("")}>
                      Clear the filter
                    </Button>
                  ) : null}
                </li>
              ) : null}
              {shown.map((item) => (
                <LayoutDrugRow
                  key={rowId(UNPLACED_SLOT, item.slug)}
                  slot={UNPLACED_SLOT}
                  item={item}
                  index={0}
                  count={1}
                  listLabel={null}
                  onBump={() => undefined}
                  onRequestMove={onRequestMove}
                  onRemove={() => undefined}
                  variant="tray"
                />
              ))}
            </ul>
          </SortableContext>
          {matches.length > shown.length ? (
            <p className="theme-text-faint text-xs">{`${matches.length - shown.length} more. Filter to find them.`}</p>
          ) : null}
        </div>
      </section>
    </EditorPanel>
  );
}

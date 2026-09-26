"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type Announcements,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorSection,
  Notice,
  type EditorActionStatusState,
  type NoticeMessage,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";

import {
  applyOrderDrag,
  curateSlug,
  moveCuratedSlug,
  ordersEqual,
  splitByOrder,
  uncurateSlug,
} from "./contributorsModel";

/**
 * Drop target for the auto-ordered section, so an item can be un-curated by
 * dragging it below the divider onto empty space and not only onto another row.
 * `applyOrderDrag` treats any `over` id that is not a curated slug as
 * "un-curate", which this id satisfies without a special case.
 */
const AUTO_ZONE_ID = "contributor-order-auto-zone";

/** Compact icon control that still reaches 44px under a coarse pointer. */
const ICON_BUTTON_CLASS = `h-8 w-8 ${TOUCH_ICON}`;

export type OrderablePanelItem = {
  slug: string;
  title: string;
  meta: string;
};

/**
 * What this panel's in/out decision is called.
 *
 * The panel is reused for two different decisions (what a surface publishes,
 * and what a reusable list contains), and calling both of them "curate" makes
 * the second one read like a publish, which is exactly the confusion a playlist
 * is meant to remove.
 */
type OrderingPanelVerbs = {
  add: string;
  remove: string;
  addIcon: string;
  removeIcon: string;
  /** Labels the line between the chosen head and the rest. */
  divider: string;
  /** Shown when nothing is above the line yet. */
  headEmpty: string;
};

const CURATION_VERBS: OrderingPanelVerbs = {
  add: "Curate",
  remove: "Un-curate",
  addIcon: "lucide:pin",
  removeIcon: "lucide:pin-off",
  divider: "Default order",
  headEmpty: "Nothing curated yet. Everything below renders in the default order.",
};

type Move = "up" | "down" | "top" | "end";

type OrderingPanelProps = {
  icon: string;
  title: string;
  description: string;
  /** Already in the surface's default sort; the panel partitions, never re-sorts. */
  items: readonly OrderablePanelItem[];
  order: readonly string[];
  savedOrder: readonly string[];
  emptyLabel: string;
  saveState: EditorActionStatusState | "idle";
  /** The save button's label; name the list when several panels share one page. */
  saveLabel?: string;
  /** Defaults to the curation verbs; a reusable list overrides them with add/remove. */
  verbs?: OrderingPanelVerbs;
  /** Heading tag; `h3` by default. */
  headingLevel?: "h2" | "h3" | "h4" | "h5";
  /** The result of the last save of this list, drawn beside its Save. */
  notice?: NoticeMessage | null;
  onDismissNotice?: () => void;
  /** A sentence beside Save saying when the order lands ("Saves on its own, live at once."). */
  saveNote?: string;
  /** Read only: rows show their order, and nothing moves or saves. */
  readOnly?: boolean;
  /** Fold the default-order rows past this many behind Show all. Unset shows every row. */
  autoCap?: number;
  onOrderChange: (next: string[]) => void;
  onSave: () => void;
  onReset: () => void;
};

function SortableRow({
  item,
  curated,
  index,
  curatedCount,
  verbs,
  readOnly,
  onMove,
  onToggleCurate,
}: {
  item: OrderablePanelItem;
  curated: boolean;
  index: number;
  curatedCount: number;
  verbs: OrderingPanelVerbs;
  readOnly: boolean;
  onMove: (slug: string, how: Move) => void;
  onToggleCurate: (slug: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.slug,
    disabled: readOnly,
  });
  const first = index === 0;
  const last = index === curatedCount - 1;
  const toggleLabel = `${curated ? verbs.remove : verbs.add} ${item.title}`;

  return (
    <li
      ref={setNodeRef}
      data-order-row={item.slug}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex list-none items-center gap-2 border-b border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg)] py-1.5 last:border-b-0 sm:gap-3",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      {readOnly ? (
        <span className="theme-text-faint w-8 shrink-0 text-right text-sm tabular-nums">{curated ? index + 1 : ""}</span>
      ) : (
        <button
          type="button"
          data-control="handle"
          aria-label={curated ? `Drag ${item.title}, position ${index + 1} of ${curatedCount}` : `Drag ${item.title}`}
          className="theme-focus-ring theme-text-faint hover:theme-text-primary flex h-10 w-11 shrink-0 cursor-grab touch-none items-center justify-center gap-0.5 rounded-control text-sm tabular-nums transition-colors active:cursor-grabbing [@media(pointer:coarse)]:h-11"
          {...attributes}
          {...listeners}
        >
          <Icon icon="lucide:grip-vertical" size={14} className="shrink-0" />
          <span className="min-w-[1.25rem] text-left">{curated ? index + 1 : ""}</span>
        </button>
      )}

      <span className="min-w-0 flex-1">
        <span className="theme-text-primary line-clamp-2 break-words text-sm font-medium">{item.title}</span>
        <span className="theme-text-faint mt-0.5 block truncate text-xs">
          <span className="sr-only">, </span>
          {item.meta ? `${item.meta} · ${item.slug}` : item.slug}
        </span>
      </span>

      {readOnly ? null : (
        <span className="flex shrink-0 items-center gap-0.5">
          {curated ? (
            <span className="hidden items-center gap-0.5 sm:flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-control="up"
                className={ICON_BUTTON_CLASS}
                disabled={first}
                aria-label={`Move ${item.title} up`}
                onClick={() => onMove(item.slug, "up")}
              >
                <Icon icon="lucide:arrow-up" size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-control="down"
                className={ICON_BUTTON_CLASS}
                disabled={last}
                aria-label={`Move ${item.title} down`}
                onClick={() => onMove(item.slug, "down")}
              >
                <Icon icon="lucide:arrow-down" size={14} />
              </Button>
            </span>
          ) : null}
          <Button
            type="button"
            variant={curated ? "ghost" : "outline"}
            size="sm"
            data-control="toggle"
            className="shrink-0 max-sm:w-11 max-sm:px-0"
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={() => onToggleCurate(item.slug)}
          >
            <Icon icon={curated ? verbs.removeIcon : verbs.addIcon} size={14} />
            <span className="max-sm:sr-only">{curated ? verbs.remove : verbs.add}</span>
          </Button>
          {curated && curatedCount > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-control="menu"
                  className={ICON_BUTTON_CLASS}
                  aria-label={`More for ${item.title}`}
                >
                  <Icon icon="lucide:ellipsis" size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                {/* Up and down sit on the row from sm up; on a phone they live here. */}
                <DropdownMenuItem className="sm:hidden" disabled={first} onSelect={() => onMove(item.slug, "up")}>
                  <Icon icon="lucide:arrow-up" size={14} className="mr-2" />
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" disabled={last} onSelect={() => onMove(item.slug, "down")}>
                  <Icon icon="lucide:arrow-down" size={14} className="mr-2" />
                  Move down
                </DropdownMenuItem>
                <DropdownMenuItem disabled={first} onSelect={() => onMove(item.slug, "top")}>
                  <Icon icon="lucide:arrow-up-to-line" size={14} className="mr-2" />
                  Move to the top
                </DropdownMenuItem>
                <DropdownMenuItem disabled={last} onSelect={() => onMove(item.slug, "end")}>
                  <Icon icon="lucide:arrow-down-to-line" size={14} className="mr-2" />
                  Move to the end
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
      )}
    </li>
  );
}

/**
 * One reorder panel: the curated head above a divider, the default-sorted tail
 * below it.
 *
 * The divider is the point of the layout. A contributor's page shows the pinned
 * items first and then falls back to its own sort, so a flat list would
 * misrepresent the stored state: it would imply every position is a decision,
 * when only the ones above the line are. Dragging across the line is therefore
 * the same gesture as the in/out buttons, which exist because a drag is not
 * reachable from every hand. Every move is announced, and focus stays on the
 * row that moved.
 */
export function OrderingPanel({
  icon,
  title,
  description,
  items,
  order,
  savedOrder,
  emptyLabel,
  saveState,
  saveLabel = "Save order",
  verbs = CURATION_VERBS,
  headingLevel = "h3",
  notice = null,
  onDismissNotice,
  saveNote,
  readOnly = false,
  autoCap,
  onOrderChange,
  onSave,
  onReset,
}: OrderingPanelProps) {
  const split = useMemo(() => splitByOrder(items, order), [items, order]);
  const curatedSlugs = useMemo(() => split.curated.map((item) => item.slug), [split.curated]);
  const [showAllAuto, setShowAllAuto] = useState(false);
  const autoHidden = autoCap !== undefined && !showAllAuto ? Math.max(0, split.auto.length - autoCap) : 0;
  const visibleAuto = autoHidden > 0 ? split.auto.slice(0, autoCap) : split.auto;
  const autoSlugs = useMemo(() => visibleAuto.map((item) => item.slug), [visibleAuto]);
  const isDirty = !ordersEqual(order, savedOrder);
  const saving = saveState === "saving";
  const [announcement, setAnnouncement] = useState("");
  const [pendingFocus, setPendingFocus] = useState<{ slug: string; control: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoListId = useId();

  const titleOf = useCallback((slug: string) => items.find((item) => item.slug === slug)?.title ?? slug, [items]);

  useEffect(() => {
    if (!pendingFocus) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-order-row="${globalThis.CSS.escape(pendingFocus.slug)}"]`);
    const control = row?.querySelector<HTMLElement>(`[data-control="${pendingFocus.control}"]:not([disabled])`)
      ?? row?.querySelector<HTMLElement>('[data-control="handle"]');
    control?.focus({ preventScroll: false });
    setPendingFocus(null);
  }, [pendingFocus, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { setNodeRef: setAutoZoneRef, isOver: isOverAutoZone } = useDroppable({
    id: AUTO_ZONE_ID,
  });

  const positionWord = (slug: string) => {
    const at = curatedSlugs.indexOf(slug);
    return at >= 0 ? `position ${at + 1} of ${curatedSlugs.length}` : verbs.divider.toLowerCase();
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(String(active.id))}, ${positionWord(String(active.id))}.`,
    onDragOver: ({ active, over }) =>
      over ? `${titleOf(String(active.id))} is over ${over.id === AUTO_ZONE_ID ? verbs.divider.toLowerCase() : titleOf(String(over.id))}.` : `${titleOf(String(active.id))} is outside the list.`,
    onDragEnd: ({ active, over }) =>
      over ? `Dropped ${titleOf(String(active.id))}.` : `Dropped ${titleOf(String(active.id))} where it was.`,
    onDragCancel: ({ active }) => `Put ${titleOf(String(active.id))} back.`,
  };

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || readOnly) {
        return;
      }

      const next = applyOrderDrag({
        order,
        activeSlug: String(active.id),
        overSlug: String(over.id),
        curatedSlugs,
      });
      onOrderChange(next);
      const slug = String(active.id);
      const at = next.indexOf(slug);
      setAnnouncement(at >= 0 ? `${titleOf(slug)} is at position ${at + 1} of ${next.length}.` : `${titleOf(slug)} is back in the ${verbs.divider.toLowerCase()}.`);
    },
    [curatedSlugs, onOrderChange, order, readOnly, titleOf, verbs.divider],
  );

  const handleMove = useCallback(
    (slug: string, how: Move) => {
      const from = order.indexOf(slug);
      if (from < 0) return;
      let next = [...order];
      if (how === "up" || how === "down") next = moveCuratedSlug(order, slug, how);
      else next = curateSlug(order, slug, how === "top" ? 0 : order.length);
      onOrderChange(next);
      setAnnouncement(`Moved ${titleOf(slug)} to position ${next.indexOf(slug) + 1} of ${next.length}.`);
      setPendingFocus({ slug, control: how === "up" || how === "down" ? how : "handle" });
    },
    [onOrderChange, order, titleOf],
  );

  const handleToggleCurate = useCallback(
    (slug: string) => {
      const curated = curatedSlugs.includes(slug);
      const next = curated ? uncurateSlug(order, slug) : curateSlug(order, slug);
      onOrderChange(next);
      setAnnouncement(
        curated
          ? `${verbs.remove.replace(/^./, (letter) => letter.toUpperCase())}d ${titleOf(slug)}. It follows the ${verbs.divider.toLowerCase()} now.`
          : `${titleOf(slug)} is at position ${next.indexOf(slug) + 1} of ${next.length}.`,
      );
      setPendingFocus({ slug, control: "toggle" });
    },
    [curatedSlugs, onOrderChange, order, titleOf, verbs.divider, verbs.remove],
  );

  const clearCuration = () => {
    onOrderChange([]);
    setAnnouncement(`Cleared. Every item follows the ${verbs.divider.toLowerCase()}.`);
  };

  return (
    <EditorSection
      headingLevel={headingLevel}
      icon={icon}
      title={title}
      description={description}
      animate={false}
      actions={
        <p className="theme-text-muted text-sm tabular-nums">
          {`${split.curated.length} ${verbs.add === CURATION_VERBS.add ? "curated" : "chosen"} of ${items.length}`}
        </p>
      }
    >
      {items.length === 0 ? (
        <p className="theme-text-muted flex items-start gap-2 border-y border-[color:var(--editor-panel-border)] py-4 text-sm">
          <Icon icon="lucide:inbox" size={16} className="theme-text-faint mt-0.5 shrink-0" />
          <span>{emptyLabel}</span>
        </p>
      ) : (
        <DndContext
          sensors={readOnly ? [] : sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                "To reorder, press space or enter to pick this item up, the arrow keys to move it, and space or enter again to drop it. Dropping it below the line takes it out of the curated order. Escape puts it back.",
            },
          }}
        >
          <div ref={listRef} className="space-y-1">
            <SortableContext items={curatedSlugs} strategy={verticalListSortingStrategy}>
              <ol aria-label={`${title}: ${verbs.add === CURATION_VERBS.add ? "curated" : "chosen"}, in order`} className="border-y border-[color:var(--editor-panel-border)] empty:hidden">
                {split.curated.map((item, index) => (
                  <SortableRow
                    key={item.slug}
                    item={item}
                    curated
                    index={index}
                    curatedCount={split.curated.length}
                    verbs={verbs}
                    readOnly={readOnly}
                    onMove={handleMove}
                    onToggleCurate={handleToggleCurate}
                  />
                ))}
              </ol>
            </SortableContext>

            {split.curated.length === 0 ? (
              <p className="theme-text-faint py-1 text-xs">{verbs.headEmpty}</p>
            ) : null}

            <div
              ref={setAutoZoneRef}
              className={cn(
                "flex items-center gap-3 rounded-control px-1 py-2 transition-colors",
                isOverAutoZone && "bg-[var(--editor-panel-bg-subtle)]",
              )}
            >
              <div className="theme-gradient-divider h-px flex-1" />
              <span className="type-meta-label theme-text-faint">{verbs.divider}</span>
              <div className="theme-gradient-divider h-px flex-1" />
            </div>

            <SortableContext items={autoSlugs} strategy={verticalListSortingStrategy}>
              <ul id={autoListId} aria-label={`${title}: ${verbs.divider.toLowerCase()}`} className="border-y border-[color:var(--editor-panel-border)] empty:hidden">
                {visibleAuto.map((item) => (
                  <SortableRow
                    key={item.slug}
                    item={item}
                    curated={false}
                    index={0}
                    curatedCount={0}
                    verbs={verbs}
                    readOnly={readOnly}
                    onMove={handleMove}
                    onToggleCurate={handleToggleCurate}
                  />
                ))}
              </ul>
            </SortableContext>
            {autoCap !== undefined && split.auto.length > autoCap ? (
              <div className="flex justify-center pt-1">
                <ExpandButton
                  isExpanded={showAllAuto}
                  onToggle={() => setShowAllAuto((value) => !value)}
                  variant="count"
                  count={split.auto.length - autoCap}
                  label={showAllAuto ? "Show fewer" : "Show all"}
                  ariaControls={autoListId}
                  ariaLabel={showAllAuto ? `Show only the first ${autoCap}` : `Show all ${split.auto.length} in the ${verbs.divider.toLowerCase()}`}
                />
              </div>
            ) : null}
          </div>
        </DndContext>
      )}
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {split.danglingSlugs.length > 0 ? (
        <p className="flex items-start gap-2 text-xs text-dose-warning">
          <Icon icon="lucide:triangle-alert" size={13} className="mt-0.5 shrink-0" />
          <span>{`Curated but missing: ${split.danglingSlugs.join(", ")}. Saving drops ${split.danglingSlugs.length === 1 ? "this position" : "these positions"}.`}</span>
        </p>
      ) : null}

      {readOnly || (items.length === 0 && order.length === 0 && savedOrder.length === 0 && !notice) ? null : (
        <div className="space-y-2.5">
          {notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={!isDirty || saving}
              aria-busy={saving || undefined}
              onClick={onSave}
            >
              {saving ? "Saving" : saveLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!isDirty || saving}
              onClick={onReset}
            >
              Discard changes
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={order.length === 0 || saving}
              onClick={clearCuration}
            >
              Clear curation
            </Button>
            <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", isDirty ? "theme-text-secondary" : "theme-text-faint")}>
              {saving ? (
                "Saving the order"
              ) : isDirty ? (
                <>
                  <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
                  Unsaved order
                </>
              ) : saveState === "saved" ? (
                "Order saved"
              ) : (
                "No changes yet"
              )}
            </p>
            {saveNote ? <p className="theme-text-faint min-w-0 text-xs sm:ml-auto">{saveNote}</p> : null}
          </div>
        </div>
      )}
    </EditorSection>
  );
}

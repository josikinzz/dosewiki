"use client";

import { useCallback, useMemo } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface, InteractiveContentCard } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorActionStatus,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  type EditorActionStatusState,
} from "@/features/dev/components";

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

/** Compact icon control; the Button `icon` size is always 44px. */
const ICON_BUTTON_CLASS = `h-7 w-7 ${TOUCH_ICON}`;

export type OrderablePanelItem = {
  slug: string;
  title: string;
  meta: string;
};

/**
 * What this panel's in/out decision is called.
 *
 * The panel is reused for two different decisions — what a surface publishes,
 * and what a reusable list contains — and calling both of them "curate" makes
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
}

const CURATION_VERBS: OrderingPanelVerbs = {
  add: "Curate",
  remove: "Un-curate",
  addIcon: "lucide:pin",
  removeIcon: "lucide:pin-off",
  divider: "Default order",
  headEmpty: "Nothing curated yet. Everything below renders in the default order.",
};

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
  onMove,
  onToggleCurate,
}: {
  item: OrderablePanelItem;
  curated: boolean;
  index: number;
  curatedCount: number;
  verbs: OrderingPanelVerbs;
  onMove: (slug: string, direction: "up" | "down") => void;
  onToggleCurate: (slug: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.slug,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="list-none"
    >
      <InteractiveContentCard
        variant="public"
        padding="sm"
        radius="lg"
        className={isDragging ? "opacity-60 ring-1 ring-dose-accent-strong" : undefined}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="glass"
            size="icon"
            className={`${ICON_BUTTON_CLASS} shrink-0 cursor-grab touch-none active:cursor-grabbing`}
            aria-label={`Drag ${item.title}`}
            {...attributes}
            {...listeners}
          >
            <Icon icon="lucide:grip-vertical" size={14} />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="theme-text-primary truncate text-sm font-medium">{item.title}</p>
            <p className="theme-text-faint truncate text-xs">
              {item.meta ? `${item.slug} · ${item.meta}` : item.slug}
            </p>
          </div>

          {curated ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="glass"
                size="icon"
                className={ICON_BUTTON_CLASS}
                disabled={index === 0}
                aria-label={`Move ${item.title} up`}
                onClick={() => onMove(item.slug, "up")}
              >
                <Icon icon="lucide:arrow-up" size={14} />
              </Button>
              <Button
                variant="glass"
                size="icon"
                className={ICON_BUTTON_CLASS}
                disabled={index === curatedCount - 1}
                aria-label={`Move ${item.title} down`}
                onClick={() => onMove(item.slug, "down")}
              >
                <Icon icon="lucide:arrow-down" size={14} />
              </Button>
            </div>
          ) : null}

          <Button
            variant={curated ? "ghost" : "secondary"}
            size="sm"
            className="shrink-0"
            aria-label={`${curated ? verbs.remove : verbs.add} ${item.title}`}
            onClick={() => onToggleCurate(item.slug)}
          >
            <Icon icon={curated ? verbs.removeIcon : verbs.addIcon} size={14} />
            {curated ? verbs.remove : verbs.add}
          </Button>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

/**
 * One reorder panel: the curated head above a divider, the default-sorted tail
 * below it.
 *
 * The divider is the point of the layout. A contributor's page shows the pinned
 * items first and then falls back to its own sort, so a flat list would
 * misrepresent the stored state — it would imply every position is a decision,
 * when only the ones above the line are. Dragging across the line is therefore
 * the same gesture as the two in/out buttons, which exist because a
 * drag is not reachable from a keyboard alone.
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
  onOrderChange,
  onSave,
  onReset,
}: OrderingPanelProps) {
  const split = useMemo(() => splitByOrder(items, order), [items, order]);
  const curatedSlugs = useMemo(() => split.curated.map((item) => item.slug), [split.curated]);
  const autoSlugs = useMemo(() => split.auto.map((item) => item.slug), [split.auto]);
  const isDirty = !ordersEqual(order, savedOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const { setNodeRef: setAutoZoneRef, isOver: isOverAutoZone } = useDroppable({
    id: AUTO_ZONE_ID,
  });

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) {
        return;
      }

      onOrderChange(
        applyOrderDrag({
          order,
          activeSlug: String(active.id),
          overSlug: String(over.id),
          curatedSlugs,
        }),
      );
    },
    [curatedSlugs, onOrderChange, order],
  );

  const handleMove = useCallback(
    (slug: string, direction: "up" | "down") => {
      onOrderChange(moveCuratedSlug(order, slug, direction));
    },
    [onOrderChange, order],
  );

  const handleToggleCurate = useCallback(
    (slug: string) => {
      onOrderChange(
        curatedSlugs.includes(slug) ? uncurateSlug(order, slug) : curateSlug(order, slug),
      );
    },
    [curatedSlugs, onOrderChange, order],
  );

  return (
    <EditorSection
      headingLevel="h3"
      icon={icon}
      title={title}
      description={description}
      actions={
        <EditorStatusPill tone="neutral">
          {`${split.curated.length} curated · ${items.length} total`}
        </EditorStatusPill>
      }
    >
      {items.length === 0 ? (
        <EmptyStateSurface padding="sm" radius="lg" className="theme-text-muted text-sm">
          {emptyLabel}
        </EmptyStateSurface>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="space-y-2">
            <SortableContext items={curatedSlugs} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {split.curated.map((item, index) => (
                  <SortableRow
                    key={item.slug}
                    item={item}
                    curated
                    index={index}
                    curatedCount={split.curated.length}
                    verbs={verbs}
                    onMove={handleMove}
                    onToggleCurate={handleToggleCurate}
                  />
                ))}
              </ul>
            </SortableContext>

            {split.curated.length === 0 ? (
              <p className="theme-text-faint text-xs">{verbs.headEmpty}</p>
            ) : null}

            <div
              ref={setAutoZoneRef}
              className={`flex items-center gap-3 rounded-lg px-1 py-2 transition ${
                isOverAutoZone ? "bg-[var(--editor-panel-bg-subtle)]" : ""
              }`.trim()}
            >
              <div className="theme-gradient-divider h-px flex-1" />
              <span className="theme-text-faint text-[11px] uppercase tracking-[0.3em]">
                {verbs.divider}
              </span>
              <div className="theme-gradient-divider h-px flex-1" />
            </div>

            <SortableContext items={autoSlugs} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {split.auto.map((item) => (
                  <SortableRow
                    key={item.slug}
                    item={item}
                    curated={false}
                    index={0}
                    curatedCount={0}
                    verbs={verbs}
                    onMove={handleMove}
                    onToggleCurate={handleToggleCurate}
                  />
                ))}
              </ul>
            </SortableContext>
          </div>
        </DndContext>
      )}

      {split.danglingSlugs.length > 0 ? (
        <p className="theme-text-faint text-xs">
          {`Curated but missing: ${split.danglingSlugs.join(", ")}. Saving drops these positions.`}
        </p>
      ) : null}

      <EditorToolbar variant="split">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!isDirty || saveState === "saving"}
            onClick={onSave}
          >
            <Icon icon="lucide:save" size={15} />
            {saveLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!isDirty || saveState === "saving"}
            onClick={onReset}
          >
            <Icon icon="lucide:rotate-ccw" size={15} />
            Discard changes
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={order.length === 0 || saveState === "saving"}
            onClick={() => onOrderChange([])}
          >
            <Icon icon="lucide:list-restart" size={15} />
            Clear curation
          </Button>
        </div>
        {saveState === "idle" ? (
          <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
            {isDirty ? "Unsaved order" : "Order saved"}
          </EditorStatusPill>
        ) : (
          <EditorActionStatus status={saveState} />
        )}
      </EditorToolbar>
    </EditorSection>
  );
}

"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import type { ReplicationViewerMediaItem } from "../viewerModel";

export function reorderViewerSlugs(
  slugs: readonly string[],
  activeId: string,
  overId: string | null,
): string[] | null {
  if (overId === null || activeId === overId) return null;
  const from = slugs.indexOf(activeId);
  const to = slugs.indexOf(overId);
  if (from < 0 || to < 0) return null;
  return arrayMove([...slugs], from, to);
}

function SortableRailItem({
  item,
  index,
  active,
  disabled,
  onActivate,
}: {
  item: ReplicationViewerMediaItem;
  index: number;
  active: boolean;
  disabled: boolean;
  onActivate: (slug: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.replication.slug, disabled });
  const thumbnail =
    item.replication.thumbnail_url ?? item.replication.preview_url ?? item.replication.url;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative w-20 shrink-0 snap-start",
        isDragging && "z-20 opacity-60",
      )}
    >
      <span className="absolute left-1 top-1 z-10 grid min-w-5 place-items-center rounded-full bg-black/80 px-1 text-[10px] font-semibold theme-media-tile-creator">
        {index + 1}
      </span>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        aria-label={`View ${item.replication.title}`}
        onClick={() => onActivate(item.replication.slug)}
        className={cn(
          "theme-media-thumbnail-border grid size-20 place-items-center overflow-hidden rounded-lg border bg-black/45 p-1 transition",
          active && "theme-media-thumbnail-selected",
        )}
      >
        {thumbnail ? (
          <AppImage
            src={thumbnail}
            alt=""
            width={80}
            height={80}
            className="h-full w-full object-contain"
          />
        ) : (
          <Icon icon="lucide:image-off" className="size-4 theme-media-tile-creator" aria-hidden />
        )}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={`Reorder ${item.replication.title}`}
        title="Drag to reorder"
        className={`absolute -bottom-2 left-1/2 z-10 size-8 -translate-x-1/2 cursor-grab rounded-full border theme-media-thumbnail-border bg-black/90 theme-media-tile-creator active:cursor-grabbing ${TOUCH_ICON}`}
        {...attributes}
        {...listeners}
      >
        <Icon icon="lucide:grip-horizontal" className="size-4" aria-hidden />
      </Button>
    </li>
  );
}

export function SortableViewerRail({
  items,
  activeSlug,
  disabled,
  onActivate,
  onReorder,
}: {
  items: readonly ReplicationViewerMediaItem[];
  activeSlug: string;
  disabled: boolean;
  onActivate: (slug: string) => void;
  onReorder: (slugs: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const slugs = items.map((item) => item.replication.slug);

  const handleDragEnd = (event: DragEndEvent) => {
    const next = reorderViewerSlugs(
      slugs,
      String(event.active.id),
      event.over ? String(event.over.id) : null,
    );
    if (next) onReorder(next);
  };

  return (
    <nav
      aria-label="Reorder carousel thumbnails"
      className="theme-media-thumbnail-border absolute inset-x-3 bottom-3 z-20 rounded-xl border bg-black/80 px-3 pb-5 pt-3 theme-overlay-surface backdrop-blur-md motion-reduce:backdrop-blur-none sm:inset-x-6 sm:bottom-5"
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-xs theme-media-tile-creator">
        <span className="font-semibold uppercase tracking-[0.18em] theme-accent-emphasis">
          Reordering
        </span>
        <span>Drag handles or use Space + arrow keys</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slugs} strategy={horizontalListSortingStrategy}>
          <ul className="flex snap-x gap-3 overflow-x-auto px-1 pb-3 pt-1">
            {items.map((item, index) => (
              <SortableRailItem
                key={item.replication.slug}
                item={item}
                index={index}
                active={item.replication.slug === activeSlug}
                disabled={disabled}
                onActivate={onActivate}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </nav>
  );
}

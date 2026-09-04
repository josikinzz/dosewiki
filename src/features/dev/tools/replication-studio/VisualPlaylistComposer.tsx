"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorActionStatus,
  EditorStatusPill,
  EditorToolbar,
  type EditorActionStatusState,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioRow } from "./replicationStudioModel";

const CANDIDATE_BATCH_SIZE = 24;

/** Compact icon control; the Button `icon` size is always 44px. */
const ICON_BUTTON_CLASS = `h-8 w-8 ${TOUCH_ICON}`;

export type VisualPlaylistComposerProps = {
  allRows: readonly StudioRow[];
  filteredRows: readonly StudioRow[];
  order: readonly string[];
  isDirty: boolean;
  disabled: boolean;
  saveState: EditorActionStatusState | "idle";
  onOrderChange: (next: string[]) => void;
  onSave: () => void;
  onReset: () => void;
};

function MediaDetails({ row }: { row: StudioRow }) {
  return (
    <div className="min-w-0">
      <p className="theme-text-primary truncate text-sm font-medium">{row.title || "Untitled"}</p>
      <p className="theme-text-faint truncate text-xs">{row.artist || "Unknown artist"}</p>
      <p className="theme-text-muted truncate text-xs">
        {row.effect_name ?? "No effect"} · {row.type}
      </p>
    </div>
  );
}

function SortablePlaylistRow({
  row,
  index,
  count,
  onMove,
  disabled,
  onRemove,
}: {
  row: StudioRow;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (slug: string, direction: "up" | "down") => void;
  onRemove: (slug: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.slug,
    disabled,
  });

  return (
    <li
      data-playlist-slug={row.slug}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid grid-cols-[auto_4rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-[color:var(--editor-panel-border)] py-2 last:border-b-0",
        isDragging && "opacity-60",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(ICON_BUTTON_CLASS, "cursor-grab touch-none active:cursor-grabbing")}
        disabled={disabled}
        aria-label={`Drag ${row.title}`}
        {...attributes}
        {...listeners}
      >
        <Icon icon="lucide:grip-vertical" size={15} />
      </Button>
      <ReplicationThumb row={row} className="aspect-square" enableVideoPreview />
      <MediaDetails row={row} />
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={ICON_BUTTON_CLASS}
          disabled={disabled || index === 0}
          aria-label={`Move ${row.title} up`}
          onClick={() => onMove(row.slug, "up")}
        >
          <Icon icon="lucide:arrow-up" size={14} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={ICON_BUTTON_CLASS}
          disabled={disabled || index === count - 1}
          aria-label={`Move ${row.title} down`}
          onClick={() => onMove(row.slug, "down")}
        >
          <Icon icon="lucide:arrow-down" size={14} />
        </Button>
        <Button
          type="button"
          variant="ghostDestructive"
          size="icon"
          className={ICON_BUTTON_CLASS}
          disabled={disabled}
          aria-label={`Remove ${row.title} from playlist`}
          onClick={() => onRemove(row.slug)}
        >
          <Icon icon="lucide:x" size={14} />
        </Button>
      </div>
    </li>
  );
}

function CandidateCard({
  row,
  disabled,
  onAdd,
}: {
  row: StudioRow;
  disabled: boolean;
  onAdd: (slug: string) => void;
}) {
  return (
    <li className="min-w-0 border-b border-[color:var(--editor-panel-border)] pb-3">
      <ReplicationThumb row={row} className="aspect-[4/3]" enableVideoPreview />
      <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <MediaDetails row={row} />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          aria-label={`Add ${row.title} to playlist`}
          onClick={() => onAdd(row.slug)}
        >
          <Icon icon="lucide:plus" size={14} />
          Add
        </Button>
      </div>
    </li>
  );
}

/** A bounded, media-first playlist builder: one persistent sequence and one filtered candidate pool. */
export function VisualPlaylistComposer({
  allRows,
  filteredRows,
  order,
  isDirty,
  disabled: disabledProp,
  saveState,
  onOrderChange,
  onSave,
  onReset,
}: VisualPlaylistComposerProps) {
  const [visibleCandidateCount, setVisibleCandidateCount] = useState(CANDIDATE_BATCH_SIZE);
  const [pendingFocusSlug, setPendingFocusSlug] = useState<string | null>(null);
  const bySlug = useMemo(() => new Map(allRows.map((row) => [row.slug, row])), [allRows]);
  const selectedRows = useMemo(
    () => order.map((slug) => bySlug.get(slug)).filter((row): row is StudioRow => Boolean(row)),
    [bySlug, order],
  );
  const selected = useMemo(() => new Set(order), [order]);
  const filteredSlugSet = useMemo(
    () => new Set(filteredRows.map((row) => row.slug)),
    [filteredRows],
  );
  const hiddenSelectedCount = order.filter((slug) => !filteredSlugSet.has(slug)).length;
  const candidateRows = useMemo(
    () => filteredRows.filter((row) => !row.showcase_excluded && !selected.has(row.slug)),
    [filteredRows, selected],
  );
  const visibleCandidates = candidateRows.slice(0, visibleCandidateCount);
  const danglingSlugs = order.filter((slug) => !bySlug.has(slug));

  useEffect(() => {
    setVisibleCandidateCount(CANDIDATE_BATCH_SIZE);
  }, [filteredRows]);

  useEffect(() => {
    if (!pendingFocusSlug) return;
    if (pendingFocusSlug === "__candidates__") {
      document.getElementById("playlist-candidates-heading")?.focus();
    } else {
      document
        .querySelector<HTMLButtonElement>(`[data-playlist-slug="${pendingFocusSlug}"] button`)
        ?.focus();
    }
    setPendingFocusSlug(null);
  }, [pendingFocusSlug, selectedRows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = useCallback(
    (slug: string, direction: "up" | "down") => {
      if (disabledProp) return;
      const from = order.indexOf(slug);
      const to = direction === "up" ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= order.length) return;
      onOrderChange(arrayMove([...order], from, to));
    },
    [disabledProp, onOrderChange, order],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (disabledProp) return;
      if (!over || active.id === over.id) return;
      const from = order.indexOf(String(active.id));
      const to = order.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      onOrderChange(arrayMove([...order], from, to));
    },
    [disabledProp, onOrderChange, order],
  );

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(0,1.5fr)]">
        <section aria-labelledby="playlist-selected-heading" className="space-y-2 xl:sticky xl:top-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h4 id="playlist-selected-heading" className="theme-text-primary font-display text-base font-semibold">
                In playlist
              </h4>
              <p className="theme-text-muted text-xs">Drag to order, or use the arrow buttons.</p>
            </div>
            <EditorStatusPill tone={order.length > 0 ? "info" : "neutral"}>
              {order.length} {order.length === 1 ? "work" : "works"}
            </EditorStatusPill>
          </div>

          <div className="max-h-[min(58vh,36rem)] overflow-y-auto border-y border-[color:var(--editor-panel-border)] px-1">
            {selectedRows.length === 0 ? (
              <EmptyStateSurface padding="sm" radius="lg" className="my-2 space-y-1 text-sm">
                <p className="theme-text-primary font-medium">This playlist is empty.</p>
                <p className="theme-text-muted">Add media from the filtered results.</p>
              </EmptyStateSurface>
            ) : (
              <DndContext sensors={disabledProp ? [] : sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={selectedRows.map((row) => row.slug)} strategy={verticalListSortingStrategy}>
                  <ol>
                    {selectedRows.map((row, index) => (
                      <SortablePlaylistRow
                        key={row.slug}
                        row={row}
                        index={index}
                        disabled={disabledProp}
                        count={selectedRows.length}
                        onMove={move}
                        onRemove={(slug) => {
                          if (disabledProp) return;
                          const index = order.indexOf(slug);
                          setPendingFocusSlug(
                            order[index + 1] ?? order[index - 1] ?? "__candidates__",
                          );
                          onOrderChange(order.filter((entry) => entry !== slug));
                        }}
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {hiddenSelectedCount > 0 ? (
            <p className="theme-text-faint text-xs">
              {hiddenSelectedCount} selected {hiddenSelectedCount === 1 ? "work is" : "works are"} hidden by current filter, but {hiddenSelectedCount === 1 ? "it remains" : "they remain"} in playlist.
            </p>
          ) : null}
          {danglingSlugs.length > 0 ? (
            <p className="theme-text-faint text-xs">
              Missing from the corpus: {danglingSlugs.join(", ")}. Saving removes these entries.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="playlist-candidates-heading" className="min-w-0 space-y-3">
          <header className="sticky top-0 z-10 flex flex-wrap items-end justify-between gap-2 border-b border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg)]/95 py-2 backdrop-blur">
            <div>
              <h4
                id="playlist-candidates-heading"
                tabIndex={-1}
                className="theme-text-primary font-display text-base font-semibold"
              >
                Add from filtered results
              </h4>
              <p className="theme-text-muted text-xs">Search and filters in the rail apply only to this candidate list.</p>
            </div>
            <p className="theme-text-faint font-mono text-xs" aria-live="polite">
              {candidateRows.length} available · {filteredRows.length} filter matches · {allRows.length} total
            </p>
          </header>

          {candidateRows.length === 0 ? (
            <EmptyStateSurface padding="sm" radius="lg" className="space-y-1 text-sm">
              <p className="theme-text-primary font-medium">No media available under the current filter.</p>
              <p className="theme-text-muted">Clear or change a search filter to find more.</p>
            </EmptyStateSurface>
          ) : (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {visibleCandidates.map((row) => (
                  <CandidateCard
                    key={row.slug}
                    row={row}
                    disabled={disabledProp}
                    onAdd={(slug) => {
                      if (!disabledProp) onOrderChange([...order, slug]);
                    }}
                  />
                ))}
              </ul>
              {visibleCandidateCount < candidateRows.length ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setVisibleCandidateCount((count) => count + CANDIDATE_BATCH_SIZE)}
                  >
                    Show {Math.min(CANDIDATE_BATCH_SIZE, candidateRows.length - visibleCandidateCount)} more
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      <EditorToolbar variant="split">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="accent" size="sm" disabled={disabledProp || !isDirty} onClick={onSave}>
            <Icon icon="lucide:save" size={15} />
            Save playlist
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={disabledProp || !isDirty} onClick={onReset}>
            <Icon icon="lucide:rotate-ccw" size={15} />
            Discard changes
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabledProp || order.length === 0}
            onClick={() => {
              if (!disabledProp) onOrderChange([]);
            }}
          >
            <Icon icon="lucide:list-restart" size={15} />
            Clear playlist
          </Button>
        </div>
        {saveState === "idle" ? (
          <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
            {isDirty ? "Unsaved playlist" : "Playlist saved"}
          </EditorStatusPill>
        ) : (
          <EditorActionStatus status={saveState} />
        )}
      </EditorToolbar>
    </div>
  );
}

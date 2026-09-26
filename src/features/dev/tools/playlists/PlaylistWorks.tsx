"use client";

/**
 * The works on an open playlist and the way to add more: the ordered list
 * (drag by the handle, the arrows, or the row menu; each change announced and
 * focus kept on the moved row) and "Add works" (a thumbnail search, with a
 * pasted slug folded behind "Paste a slug instead").
 *
 * The Playlists tab's pane renders this; the public viewer's contextual editor
 * keeps `PlaylistEditor`.
 */

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type Announcements,
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
import { CSS as DndCSS } from "@dnd-kit/utilities";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField } from "@/features/dev/components";
import { ReplicationThumb } from "@/features/dev/tools/replication-studio/ReplicationThumb";
import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";
import { cn } from "@/lib/utils";

import { countNoun } from "../home/homeModel";
import { CANDIDATE_QUERY_MAX, CANDIDATE_SEARCH_LIMIT, fetchCandidateSearch, type PlaylistCandidate } from "./playlistCandidates";
import type { WorkCards } from "./useWorkCards";

/**
 * Rows shown before the list folds behind "Show all". A long playlist then
 * stays about one screen tall instead of pushing the rest of the pane away.
 */
export const COLLAPSED_ROWS = 20;

/** Pause after the last keystroke before the search read goes out. */
const SEARCH_DEBOUNCE_MS = 250;

const ICON_BUTTON = `h-8 w-8 ${TOUCH_ICON}`;

type Move = "up" | "down" | "top" | "bottom";

/** Where a move lands, or `null` when it would not move. */
function targetIndex(index: number, count: number, move: Move): number | null {
  const to = move === "up" ? index - 1 : move === "down" ? index + 1 : move === "top" ? 0 : count - 1;
  return to === index || to < 0 || to >= count ? null : to;
}

export type PlaylistWorksProps = {
  slugs: readonly string[];
  workCards: WorkCards;
  /** Read only: the list shows, nothing moves, and Add works is left out. */
  readOnly: boolean;
  busy: boolean;
  onChange: (slugs: string[]) => void;
  /** The work search, so `/` can focus it. */
  searchRef: RefObject<HTMLInputElement | null>;
};

export function PlaylistWorks({ slugs, workCards, readOnly, busy, onChange, searchRef }: PlaylistWorksProps) {
  const [showAll, setShowAll] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  /** The row (and which of its controls) that takes focus once the list re-renders. */
  const [pendingFocus, setPendingFocus] = useState<{ slug: string; control: "handle" | Move | "menu" } | null>(null);
  const listId = useId();
  const headingId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const disabled = busy || readOnly;

  const labelOf = useCallback((slug: string) => workCards.get(slug)?.title || slug, [workCards]);
  const hiddenCount = showAll ? 0 : Math.max(0, slugs.length - COLLAPSED_ROWS);
  const visibleSlugs = hiddenCount > 0 ? slugs.slice(0, COLLAPSED_ROWS) : [...slugs];
  const unavailable = slugs.filter((slug) => workCards.unavailable.has(slug));

  useEffect(() => {
    if (!pendingFocus) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-playlist-entry="${CSS.escape(pendingFocus.slug)}"]`);
    const control = row?.querySelector<HTMLElement>(`[data-control="${pendingFocus.control}"]:not([disabled])`)
      ?? row?.querySelector<HTMLElement>('[data-control="handle"]');
    control?.focus({ preventScroll: false });
    setPendingFocus(null);
  }, [pendingFocus, slugs]);

  /** Applies a list change; a row that lands in the folded tail unfolds it so the edit stays visible. */
  const apply = (next: string[], touchedIndex: number) => {
    if (!showAll && touchedIndex >= COLLAPSED_ROWS) setShowAll(true);
    onChange(next);
  };

  const move = (slug: string, how: Move) => {
    const index = slugs.indexOf(slug);
    const to = targetIndex(index, slugs.length, how);
    if (disabled || index < 0 || to === null) return;
    apply(arrayMove([...slugs], index, to), to);
    setAnnouncement(`Moved ${labelOf(slug)} to position ${to + 1} of ${slugs.length}.`);
    // Arrow presses keep focus on the same arrow so a run of moves needs no hunting;
    // at an edge the arrow disables, so the handle takes it instead.
    setPendingFocus({ slug, control: how === "up" || how === "down" ? how : "handle" });
  };

  const remove = (slug: string) => {
    if (disabled) return;
    const index = slugs.indexOf(slug);
    const next = slugs.filter((entry) => entry !== slug);
    onChange(next);
    setAnnouncement(`Removed ${labelOf(slug)}. ${countNoun(next.length, "work")} left.`);
    const neighbour = next[index] ?? next[index - 1];
    if (neighbour) setPendingFocus({ slug: neighbour, control: "handle" });
    else requestAnimationFrame(() => searchRef.current?.focus());
  };

  const removeUnavailable = () => {
    if (disabled || unavailable.length === 0) return;
    onChange(slugs.filter((slug) => !workCards.unavailable.has(slug)));
    setAnnouncement(`Removed ${countNoun(unavailable.length, "entry", "entries")} that saving would leave out.`);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const position = (id: string | number) => slugs.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(String(active.id))}, position ${position(active.id)} of ${slugs.length}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(String(active.id))} is over position ${position(over.id)}.` : `${labelOf(String(active.id))} is outside the list.`),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${labelOf(String(active.id))} at position ${position(over.id)}.` : `Dropped ${labelOf(String(active.id))} where it was.`),
    onDragCancel: ({ active }) => `Put ${labelOf(String(active.id))} back at position ${position(active.id)}.`,
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (disabled || !over || active.id === over.id) return;
    const from = slugs.indexOf(String(active.id));
    const to = slugs.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    apply(arrayMove([...slugs], from, to), to);
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby={headingId} className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h4 id={headingId} className="theme-text-primary text-base font-semibold">
            Works, in order
          </h4>
          <p className="theme-text-muted text-sm tabular-nums">{countNoun(slugs.length, "work")}</p>
        </div>
        {!readOnly && slugs.length > 1 ? (
          <p className="theme-text-faint -mt-2 text-xs">
            Drag a row by its handle, or use the arrows. The first work leads the gallery it is applied to.
          </p>
        ) : null}

        {unavailable.length > 0 ? (
          <div role="status" className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm text-dose-warning">
            <Icon icon="lucide:triangle-alert" size={15} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              {unavailable.length === 1 ? "1 entry is" : `${unavailable.length} entries are`} not a published work a playlist can hold, so saving leaves {unavailable.length === 1 ? "it" : "them"} out.
            </span>
            {!readOnly ? (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" disabled={disabled} onClick={removeUnavailable}>
                Remove {unavailable.length === 1 ? "it" : "them"} now
              </Button>
            ) : null}
          </div>
        ) : null}
        {workCards.error ? (
          <p role="status" className="theme-text-muted flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
            <Icon icon="lucide:image-off" size={15} className="theme-text-faint mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">Thumbnails could not load: {workCards.error}</span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={workCards.retry}>
              Try again
            </Button>
          </p>
        ) : null}

        {slugs.length === 0 ? (
          <p className="theme-text-muted flex items-start gap-2 border-y border-[color:var(--editor-panel-border)] py-4 text-sm">
            <Icon icon="lucide:images" size={16} className="theme-text-faint mt-0.5 shrink-0" />
            <span>{readOnly ? "This playlist holds no works." : "No works yet. Search below to add the first one."}</span>
          </p>
        ) : (
          <DndContext
            sensors={disabled ? [] : sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{ announcements, screenReaderInstructions: { draggable: "To reorder, press space or enter to pick this work up, the arrow keys to move it, and space or enter again to drop it. Escape puts it back." } }}
          >
            <SortableContext items={visibleSlugs} strategy={verticalListSortingStrategy}>
              <ol ref={listRef} id={listId} aria-label="Playlist order" className="border-y border-[color:var(--editor-panel-border)]">
                {visibleSlugs.map((slug, index) => (
                  <WorkRow
                    key={slug}
                    slug={slug}
                    index={index}
                    count={slugs.length}
                    card={workCards.get(slug)}
                    label={labelOf(slug)}
                    readOnly={readOnly}
                    disabled={disabled}
                    onMove={(how) => move(slug, how)}
                    onRemove={() => remove(slug)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        {slugs.length > COLLAPSED_ROWS ? (
          <div className="flex justify-center pt-1">
            <ExpandButton
              isExpanded={showAll}
              onToggle={() => setShowAll((value) => !value)}
              variant="count"
              count={slugs.length - COLLAPSED_ROWS}
              label={showAll ? "Show fewer" : "Show all"}
              ariaControls={listId}
              ariaLabel={showAll ? `Show only the first ${COLLAPSED_ROWS} works` : `Show all ${slugs.length} works`}
            />
          </div>
        ) : null}
        <p aria-live="polite" className="sr-only">{announcement}</p>
      </section>

      {readOnly ? null : (
        <AddWorks
          busy={busy}
          onList={slugs}
          workCards={workCards}
          searchRef={searchRef}
          onAdd={(slug, title) => {
            apply([...slugs, slug], slugs.length);
            setAnnouncement(`Added ${title}. ${countNoun(slugs.length + 1, "work")} now.`);
          }}
          onAddMany={(cards) => {
            apply([...slugs, ...cards.map((card) => card.slug)], slugs.length + cards.length - 1);
            setAnnouncement(`Added ${countNoun(cards.length, "work")}. ${countNoun(slugs.length + cards.length, "work")} now.`);
          }}
        />
      )}
    </div>
  );
}

function WorkRow({
  slug,
  index,
  count,
  card,
  label,
  readOnly,
  disabled,
  onMove,
  onRemove,
}: {
  slug: string;
  index: number;
  count: number;
  card: PlaylistCandidate | null | undefined;
  label: string;
  readOnly: boolean;
  disabled: boolean;
  onMove: (how: Move) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slug, disabled });
  const first = index === 0;
  const last = index === count - 1;
  const missing = card === null;

  return (
    <li
      ref={setNodeRef}
      data-playlist-entry={slug}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex items-center gap-2.5 border-b border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg)] py-2 last:border-b-0 sm:gap-3",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      {readOnly ? (
        <span className="theme-text-faint w-7 shrink-0 text-right text-sm tabular-nums">{index + 1}</span>
      ) : (
        <button
          type="button"
          data-control="handle"
          disabled={disabled}
          aria-label={`Drag ${label}, position ${index + 1} of ${count}`}
          className={cn(
            "theme-focus-ring theme-text-faint hover:theme-text-primary flex h-10 w-11 shrink-0 cursor-grab touch-none items-center justify-center gap-0.5 rounded-control text-sm tabular-nums transition-colors active:cursor-grabbing disabled:cursor-default disabled:opacity-50 [@media(pointer:coarse)]:h-11",
          )}
          {...attributes}
          {...listeners}
        >
          <Icon icon="lucide:grip-vertical" size={14} className="shrink-0" />
          <span className="min-w-[1.25rem] text-left">{index + 1}</span>
        </button>
      )}
      {card ? (
        <ReplicationThumb row={card} compact showGlyph={false} className="aspect-square w-12 shrink-0 sm:w-14" />
      ) : (
        <span
          aria-hidden="true"
          className="theme-replication-media-well theme-text-faint flex aspect-square w-12 shrink-0 items-center justify-center rounded-lg sm:w-14"
        >
          <Icon icon={missing ? "lucide:image-off" : "lucide:image"} size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("theme-text-primary line-clamp-2 break-words text-sm font-medium", missing && "font-mono text-xs")}>{label}</span>
        <span className={cn("mt-0.5 flex min-w-0 items-center gap-1 text-xs", missing ? "text-dose-warning" : "theme-text-faint")}>
          <span className="sr-only">, </span>
          {missing ? (
            <>
              <Icon icon="lucide:triangle-alert" size={12} className="shrink-0" />
              <span>Not a published work. Saving leaves it out.</span>
            </>
          ) : (
            <span className="truncate">{card ? card.artist : "Details not loaded yet"}</span>
          )}
        </span>
      </span>
      {readOnly ? null : (
        <span className="flex shrink-0 items-center gap-0.5">
          <span className="hidden items-center gap-0.5 sm:flex">
            <Button type="button" variant="ghost" size="icon" data-control="up" className={ICON_BUTTON} disabled={disabled || first} aria-label={`Move ${label} up`} onClick={() => onMove("up")}>
              <Icon icon="lucide:arrow-up" size={14} />
            </Button>
            <Button type="button" variant="ghost" size="icon" data-control="down" className={ICON_BUTTON} disabled={disabled || last} aria-label={`Move ${label} down`} onClick={() => onMove("down")}>
              <Icon icon="lucide:arrow-down" size={14} />
            </Button>
            <Button type="button" variant="ghostDestructive" size="icon" className={ICON_BUTTON} disabled={disabled} aria-label={`Remove ${label}`} onClick={onRemove}>
              <Icon icon="lucide:x" size={14} />
            </Button>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" data-control="menu" className={ICON_BUTTON} disabled={disabled} aria-label={`More for ${label}`}>
                <Icon icon="lucide:ellipsis" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              {/* Up, down and remove sit on the row from sm up; on a phone they live here. */}
              <DropdownMenuItem className="sm:hidden" disabled={first} onSelect={() => onMove("up")}>
                <Icon icon="lucide:arrow-up" size={14} className="mr-2" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem className="sm:hidden" disabled={last} onSelect={() => onMove("down")}>
                <Icon icon="lucide:arrow-down" size={14} className="mr-2" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem disabled={first} onSelect={() => onMove("top")}>
                <Icon icon="lucide:arrow-up-to-line" size={14} className="mr-2" />
                Move to the top
              </DropdownMenuItem>
              <DropdownMenuItem disabled={last} onSelect={() => onMove("bottom")}>
                <Icon icon="lucide:arrow-down-to-line" size={14} className="mr-2" />
                Move to the end
              </DropdownMenuItem>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem className="text-dose-danger sm:hidden" onSelect={onRemove}>
                <Icon icon="lucide:x" size={14} className="mr-2" />
                Remove from playlist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
    </li>
  );
}

/**
 * Finds works by title, artist or slug and adds one with a tap. The read is
 * bounded on the server, so this shows at most one page of matches and asks
 * for more words rather than paging through the corpus. A pasted slug is the
 * fallback, folded until asked for, and is checked against the published
 * corpus the moment it is added.
 */
function AddWorks({
  busy,
  onList,
  workCards,
  searchRef,
  onAdd,
  onAddMany,
}: {
  busy: boolean;
  onList: readonly string[];
  workCards: WorkCards;
  searchRef: RefObject<HTMLInputElement | null>;
  onAdd: (slug: string, title: string) => void;
  onAddMany: (cards: readonly PlaylistCandidate[]) => void;
}) {
  const headingId = useId();
  const searchId = useId();
  const pasteId = useId();
  const resultsRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaylistCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const remember = workCards.remember;

  useEffect(() => {
    const words = query.trim();
    if (!words) {
      setResults(null);
      setError(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      fetchCandidateSearch(words)
        .then((found) => {
          if (cancelled) return;
          setError(null);
          setResults(found);
          remember(found);
        })
        .catch((failure: unknown) => {
          if (cancelled) return;
          setError(failure instanceof Error ? failure.message : "Unable to search right now.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, remember, attempt]);

  const listed = new Set(onList);
  const offered = results?.filter((card) => !listed.has(card.slug)) ?? [];

  /** Adding a result removes its card, so focus moves to the next card's Add, or back to the search. */
  const addCard = (card: PlaylistCandidate, index: number) => {
    onAdd(card.slug, card.title);
    requestAnimationFrame(() => {
      const buttons = resultsRef.current?.querySelectorAll<HTMLButtonElement>("button[data-add]");
      const next = buttons?.[index] ?? buttons?.[index - 1];
      (next ?? searchRef.current)?.focus({ preventScroll: true });
    });
  };

  const addSlug = async () => {
    const slug = newSlug.trim().toLowerCase();
    if (!isValidReplicationSlug(slug)) {
      setSlugError("A replication slug is lowercase words joined by hyphens.");
      return;
    }
    if (onList.includes(slug)) {
      setSlugError(`"${slug}" is already on this playlist.`);
      return;
    }
    setCheckingSlug(true);
    try {
      const card = await workCards.resolve(slug);
      if (!card) {
        setSlugError(`No published work a playlist can hold has the slug "${slug}". Check the address, or find the work by searching.`);
        return;
      }
      setSlugError(null);
      setNewSlug("");
      onAdd(slug, card.title);
    } catch (failure) {
      setSlugError(failure instanceof Error ? failure.message : "Unable to check that slug right now.");
    } finally {
      setCheckingSlug(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t border-[color:var(--editor-panel-border)] pt-5">
      <h4 id={headingId} className="theme-text-primary text-base font-semibold">
        Add works
      </h4>
      <EditorField label="Search works" htmlFor={searchId} description="By title, artist or slug. Only published works a playlist can hold appear.">
        <div className="relative">
          <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            maxLength={CANDIDATE_QUERY_MAX}
            placeholder="fractal tunnel"
            aria-keyshortcuts="/"
            enterKeyHint="search"
            className="pl-9 pr-10 text-[16px] md:text-sm"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
          />
          {query ? null : (
            <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden">
              <kbd className="theme-dev-kbd">/</kbd>
            </span>
          )}
        </div>
      </EditorField>

      <div aria-live="polite" className="text-sm">
        {error ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-dose-danger">
            <span>Search failed: {error}</span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setAttempt((count) => count + 1)}>
              Try again
            </Button>
          </p>
        ) : searching && results === null ? (
          <p className="theme-text-muted flex items-center gap-2">
            <Icon icon="lucide:loader-circle" size={14} className="motion-safe:animate-spin" />
            Searching
          </p>
        ) : results === null ? null : offered.length === 0 ? (
          <p className="theme-text-muted">
            {results.length === 0 ? "No published work matches. Try fewer or different words." : "Every match is already on this playlist."}
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="theme-text-muted tabular-nums">
              {results.length >= CANDIDATE_SEARCH_LIMIT
                ? `Showing the first ${CANDIDATE_SEARCH_LIMIT} matches. Add words to narrow the search.`
                : `${countNoun(offered.length, "match", "matches")} not on the playlist yet.`}
            </p>
            {offered.length > 1 ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onAddMany(offered)}>
                <Icon icon="lucide:list-plus" size={14} />
                Add all {offered.length}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {offered.length > 0 ? (
        <ul ref={resultsRef} className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 xl:grid-cols-4" aria-label="Search results">
          {offered.map((card, index) => (
            <li key={card.slug} className="flex min-w-0 flex-col gap-2">
              <ReplicationThumb row={card} className="aspect-[4/3]" />
              <span className="min-w-0 flex-1">
                <span className="theme-text-primary line-clamp-2 break-words text-sm font-medium">{card.title}</span>
                <span className="theme-text-faint block truncate text-xs">{card.artist}</span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-add=""
                className="w-full"
                disabled={busy}
                aria-label={`Add ${card.title}`}
                onClick={() => addCard(card, index)}
              >
                <Icon icon="lucide:plus" size={14} />
                Add
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-3 pt-1">
        <ExpandButton
          isExpanded={pasteOpen}
          onToggle={() => setPasteOpen((open) => !open)}
          variant="inline"
          label="Paste a slug instead"
          ariaLabel="Paste a slug instead"
          ariaControls={pasteId}
          className="theme-text-muted inline-flex min-h-8 items-center gap-1.5 rounded-control text-sm font-medium"
        />
        {pasteOpen ? (
          <div id={pasteId} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <EditorField
              className="min-w-0 flex-1"
              label="Add a work"
              description="The slug from a replication's address, for example glowing-fractal-tunnel. It is checked at once and goes to the end of the list."
              error={slugError}
              errorLive
            >
              {(control) => (
                <Input
                  {...control}
                  value={newSlug}
                  placeholder="replication-slug"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  className="font-mono text-[16px] md:text-sm"
                  onChange={(event) => {
                    setNewSlug(event.target.value);
                    if (slugError) setSlugError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void addSlug();
                    }
                  }}
                />
              )}
            </EditorField>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sm:mt-7"
              disabled={busy || checkingSlug || newSlug.trim().length === 0}
              aria-busy={checkingSlug || undefined}
              onClick={() => void addSlug()}
            >
              <Icon icon={checkingSlug ? "lucide:loader-circle" : "lucide:plus"} size={14} className={cn(checkingSlug && "motion-safe:animate-spin")} />
              {checkingSlug ? "Checking" : "Add"}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

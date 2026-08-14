"use client";

/**
 * Substance Galleries curation portal — `/dev` → Replications → Substances,
 * deep-linked at `/dev/replications/<substance-slug>`.
 *
 * The three-temperature surface from prototype P3: a curated head in exact
 * stored order, the untouched matches in default corpus order below a divider,
 * and a collapsed excluded shelf. Curate pins to the tail of the head, Exclude
 * suppresses, Restore returns to natural order, ↑↓ (and a drag) reorder the
 * head. The preview strip is the effective public order. Saving submits both
 * full arrays and adopts the server's pruned echo verbatim — zero optimism.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyStateSurface, InteractiveContentCard } from "@/components/ui/surface";
import {
  ActionNotice,
  EditorActionStatus,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  type ActionNoticeTone,
  type EditorActionStatusState,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";

import type { StudioRow } from "./replicationStudioModel";
import {
  applyCuratedDrag,
  curateSlug,
  curationStateOf,
  curationStatesEqual,
  effectiveGalleryOrder,
  excludeSlug,
  moveCuratedSlug,
  restoreSlug,
  splitGallery,
  summarizeProvenance,
  uncurateSlug,
  type GalleryCandidate,
  type GalleryCurationState,
  type GalleryDetail,
  type GalleryMatch,
} from "./substanceGalleryPortalModel";

const SUBSTANCES_API = "/api/dev/replications/substances";

/**
 * Drop target for the default-order section: `applyCuratedDrag` treats any
 * `over` id that is not a curated slug as "un-curate", so dropping onto the
 * divider's empty space works without a special case.
 */
const AUTO_ZONE_ID = "substance-gallery-auto-zone";

/** How many rail-filtered corpus rows the add-from-corpus region previews. */
const ADD_PREVIEW_CAP = 12;

/** Thumbnails the public-order preview strip shows before summarizing the rest. */
const PREVIEW_STRIP_CAP = 24;

/**
 * The picker list survives leaving and re-entering the sub-view, like the
 * studio's own corpus cache: the batched read walks the whole article table
 * and must not rerun on every visit.
 */
let cachedCandidates: GalleryCandidate[] | null = null;

/** Short token labels; the sentence-length copy stays in the public credit block. */
const RIGHTS_TOKEN_LABELS: Record<string, string> = {
  "creator-retained": "creator retained",
  "explicit-license": "licensed",
  "permission-granted": "permission granted",
  "public-domain": "public domain",
  unknown: "rights unknown",
};

type Feedback = { tone: ActionNoticeTone; message: string };

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: GalleryDetail };

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** The 56px media cell: thumbnail when resolved, media-kind glyph otherwise. */
function MediaThumb({ match }: { match: GalleryMatch }) {
  const { replication } = match;
  const src = replication.thumbnail_url ?? (replication.type === "image" ? replication.url : null);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className="h-14 w-14 shrink-0 rounded-lg border border-[color:var(--editor-chip-border)] object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[color:var(--editor-chip-border)] bg-[var(--editor-panel-bg-subtle)]"
    >
      <Icon icon={replication.type === "video" ? "lucide:film" : "lucide:image"} size={18} className="theme-text-faint" />
    </span>
  );
}

/**
 * The owning-effect chip with its match provenance behind a click/Enter
 * popover rather than a hover title, so the explanation is reachable from a
 * keyboard — the chip is the only place the slug-vs-tag distinction surfaces.
 */
function ProvenanceChip({ match }: { match: GalleryMatch }) {
  const { provenance } = match;
  const viaTags = provenance.matchedVia === "effect_tags";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="auto"
          aria-label={`${provenance.effectName}: matched via ${provenance.matchedVia}`}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-[color:var(--editor-chip-border)] bg-[var(--editor-chip-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--editor-chip-text)]"
        >
          <Icon icon={viaTags ? "lucide:tags" : "lucide:link"} size={11} className="shrink-0" />
          <span className="min-w-0 truncate">{provenance.effectName}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-xs" align="start">
        <p className="theme-text-primary font-medium">Matched via {provenance.matchedVia}</p>
        <p className="theme-text-muted mt-1">
          {viaTags
            ? `This row is tagged with ${provenance.effectSlug} (effect_tags); its owning effect is ${match.replication.effect_name ?? "none"}.`
            : `This row's owning effect (effect_slug) is ${provenance.effectSlug}, one of this substance's visual effects.`}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function RightsToken({ match }: { match: GalleryMatch }) {
  const status = match.replication.rights_status ?? "creator-retained";
  const unknown = status === "unknown";
  return (
    <EditorStatusPill
      tone={unknown ? "warning" : "neutral"}
      className="shrink-0"
      title={unknown ? "Reuse terms are unknown; check before featuring this prominently." : undefined}
    >
      {RIGHTS_TOKEN_LABELS[status] ?? status}
    </EditorStatusPill>
  );
}

/** Title + artist + effect/provenance + rights: the identity block of every row. */
function MatchRowBody({ match }: { match: GalleryMatch }) {
  return (
    <>
      <MediaThumb match={match} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="theme-text-primary truncate text-sm font-medium">{match.replication.title}</p>
        <p className="theme-text-faint truncate text-xs">
          {match.replication.artist} · {match.replication.type}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <ProvenanceChip match={match} />
          <RightsToken match={match} />
        </div>
      </div>
    </>
  );
}

function SortableCuratedRow({
  match,
  index,
  curatedCount,
  onMove,
  onUncurate,
  onExclude,
}: {
  match: GalleryMatch;
  index: number;
  curatedCount: number;
  onMove: (slug: string, direction: "up" | "down") => void;
  onUncurate: (slug: string) => void;
  onExclude: (slug: string) => void;
}) {
  const slug = match.replication.slug;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slug,
  });

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="list-none">
      <InteractiveContentCard
        variant="public"
        padding="sm"
        radius="lg"
        className={isDragging ? "opacity-60 ring-1 ring-dose-accent-strong" : undefined}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="glass"
            size="icon"
            className="h-8 w-8 shrink-0 cursor-grab active:cursor-grabbing"
            aria-label={`Drag ${match.replication.title}`}
            {...attributes}
            {...listeners}
          >
            <Icon icon="lucide:grip-vertical" size={14} />
          </Button>
          <MatchRowBody match={match} />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="glass"
              size="icon"
              className="h-8 w-8"
              disabled={index === 0}
              aria-label={`Move ${match.replication.title} up`}
              onClick={() => onMove(slug, "up")}
            >
              <Icon icon="lucide:arrow-up" size={14} />
            </Button>
            <Button
              variant="glass"
              size="icon"
              className="h-8 w-8"
              disabled={index === curatedCount - 1}
              aria-label={`Move ${match.replication.title} down`}
              onClick={() => onMove(slug, "down")}
            >
              <Icon icon="lucide:arrow-down" size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Un-curate ${match.replication.title}`}
              onClick={() => onUncurate(slug)}
            >
              <Icon icon="lucide:pin-off" size={14} />
              Un-curate
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Exclude ${match.replication.title} from this gallery`}
              onClick={() => onExclude(slug)}
            >
              <Icon icon="lucide:eye-off" size={14} />
            </Button>
          </div>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

function AutoRow({
  match,
  onCurate,
  onExclude,
}: {
  match: GalleryMatch;
  onCurate: (slug: string) => void;
  onExclude: (slug: string) => void;
}) {
  const slug = match.replication.slug;
  return (
    <li className="list-none">
      <InteractiveContentCard variant="public" padding="sm" radius="lg">
        <div className="flex items-center gap-3">
          <MatchRowBody match={match} />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Curate ${match.replication.title}`}
              onClick={() => onCurate(slug)}
            >
              <Icon icon="lucide:pin" size={14} />
              Curate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Exclude ${match.replication.title} from this gallery`}
              onClick={() => onExclude(slug)}
            >
              <Icon icon="lucide:eye-off" size={14} />
              Exclude
            </Button>
          </div>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

function ExcludedRow({ match, onRestore }: { match: GalleryMatch; onRestore: (slug: string) => void }) {
  return (
    <li className="list-none">
      <InteractiveContentCard variant="public" padding="sm" radius="lg" className="opacity-70">
        <div className="flex items-center gap-3">
          <MatchRowBody match={match} />
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            aria-label={`Restore ${match.replication.title} to the default order`}
            onClick={() => onRestore(match.replication.slug)}
          >
            <Icon icon="lucide:undo-2" size={14} />
            Restore
          </Button>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

function SectionDivider({ label, dropRef, isOver }: {
  label: string;
  dropRef?: (node: HTMLElement | null) => void;
  isOver?: boolean;
}) {
  return (
    <div
      ref={dropRef}
      className={cn(
        "flex items-center gap-3 rounded-lg px-1 py-2 transition",
        isOver ? "bg-[var(--editor-panel-bg-subtle)]" : undefined,
      )}
    >
      <div className="theme-gradient-divider h-px flex-1" />
      <span className="theme-text-faint text-[11px] uppercase tracking-[0.3em]">{label}</span>
      <div className="theme-gradient-divider h-px flex-1" />
    </div>
  );
}

/**
 * Combobox in the ReviewSubstancePicker's mold: current substance as the
 * trigger, a searchable flat list behind it, per-substance match counts and a
 * curated dot on every row. Selection navigates — the tab owns the URL.
 */
function SubstanceGalleryPicker({
  candidates,
  currentSlug,
  onSelect,
}: {
  candidates: readonly GalleryCandidate[];
  currentSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const current = candidates.find((candidate) => candidate.slug === currentSlug) ?? null;
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? candidates.filter(
        (candidate) =>
          candidate.title.toLowerCase().includes(needle) || candidate.slug.toLowerCase().includes(needle),
      )
    : candidates;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="glass"
          size="auto"
          role="combobox"
          aria-expanded={open}
          aria-label={
            current
              ? `Current substance: ${current.title}. Open the substance list`
              : "Open the substance list"
          }
          className="min-w-[10rem] max-w-[18rem] gap-2 px-2.5 py-1.5"
        >
          {current ? (
            <span
              aria-hidden
              title={current.curated ? "Curation stored" : "Never curated"}
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                current.curated ? "bg-dose-accent-strong" : "bg-[var(--editor-chip-border)]",
              )}
            />
          ) : null}
          <span className="theme-text-primary font-display min-w-[6ch] flex-1 truncate text-left text-base font-semibold leading-none">
            {current?.title ?? "Choose a substance"}
          </span>
          <Icon icon="lucide:chevrons-up-down" size={14} className="theme-text-faint shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-1rem)] p-0 sm:w-[24rem]" align="start" collisionPadding={8}>
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search by name or slug…" />
          <CommandList className="max-h-[min(24rem,60vh)]">
            {visible.length === 0 ? (
              <div className="theme-text-muted py-6 text-center text-sm">No substances found</div>
            ) : (
              <div className="p-1">
                {visible.map((candidate) => (
                  <CommandItem
                    key={candidate.slug}
                    value={candidate.slug}
                    onSelect={() => {
                      onSelect(candidate.slug);
                      setOpen(false);
                    }}
                    className={cn(candidate.slug === currentSlug && "theme-text-primary font-semibold")}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        candidate.curated
                          ? "bg-dose-accent-strong"
                          : "bg-[var(--editor-chip-border)]",
                      )}
                    />
                    <span className="truncate font-medium">{candidate.title}</span>
                    <span className="theme-text-faint ml-1 hidden shrink-0 text-xs sm:inline">
                      {candidate.slug}
                    </span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 text-xs tabular-nums",
                        candidate.match_count > 0 ? "theme-text-muted" : "theme-text-faint",
                      )}
                    >
                      {candidate.match_count > 0
                        ? `${candidate.match_count} match${candidate.match_count === 1 ? "" : "es"}`
                        : "no matches"}
                      {candidate.curated ? ` · ${candidate.curated_count} curated` : ""}
                    </span>
                  </CommandItem>
                ))}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export type SubstanceGalleryPanelProps = {
  /** The `/dev/replications/<slug>` deep-link target currently open, if any. */
  substanceSlug: string | null;
  /** Navigate to another substance's portal address; the tab owns the router. */
  onNavigateToSubstance: (slug: string) => void;
  /** The studio grid's rail-filtered rows, feeding the add-from-corpus region. */
  visibleRows: readonly StudioRow[];
  /** Whether the rail currently narrows the corpus (search or facets active). */
  railNarrowed: boolean;
};

export function SubstanceGalleryPanel({
  substanceSlug,
  onNavigateToSubstance,
  visibleRows,
  railNarrowed,
}: SubstanceGalleryPanelProps) {
  const [candidates, setCandidates] = useState<GalleryCandidate[]>(() => cachedCandidates ?? []);
  const [candidatesLoaded, setCandidatesLoaded] = useState(cachedCandidates !== null);
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle" });
  const [curation, setCuration] = useState<GalleryCurationState>({ curated: [], removed: [] });
  const [savedCuration, setSavedCuration] = useState<GalleryCurationState>({ curated: [], removed: [] });
  const [saveState, setSaveState] = useState<EditorActionStatusState | "idle">("idle");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const isDirty = !curationStatesEqual(curation, savedCuration);
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  /* ---------------------------------------------------------------- loads */

  useEffect(() => {
    if (cachedCandidates) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(SUBSTANCES_API);
        if (!response.ok) {
          if (!cancelled) {
            setFeedback({
              tone: "danger",
              message: await readError(response, "Failed to load the substance list."),
            });
          }
          return;
        }
        const payload = (await response.json()) as { substances: GalleryCandidate[] };
        cachedCandidates = payload.substances;
        if (!cancelled) {
          setCandidates(payload.substances);
          setCandidatesLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setFeedback({ tone: "danger", message: "Failed to reach the substance list endpoint." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!substanceSlug) {
      setDetailState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setDetailState({ status: "loading" });
    setSaveState("idle");
    setFeedback(null);
    setExcludedOpen(false);
    setUnmatchedOpen(false);
    (async () => {
      try {
        const response = await fetch(`${SUBSTANCES_API}/${encodeURIComponent(substanceSlug)}`);
        if (!response.ok) {
          if (!cancelled) {
            setDetailState({
              status: "error",
              message: await readError(response, "Failed to load that substance's gallery."),
            });
          }
          return;
        }
        const detail = (await response.json()) as GalleryDetail;
        if (cancelled) {
          return;
        }
        const stored = curationStateOf(detail.curation);
        setDetailState({ status: "ready", detail });
        setCuration(stored);
        setSavedCuration(curationStateOf(detail.curation));
      } catch {
        if (!cancelled) {
          setDetailState({ status: "error", message: "Failed to reach the gallery endpoint." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [substanceSlug]);

  /* -------------------------------------------------------------- actions */

  const detail = detailState.status === "ready" ? detailState.detail : null;
  const matches = useMemo(() => detail?.matches ?? [], [detail]);
  const split = useMemo(() => splitGallery(matches, curation), [matches, curation]);
  const effectiveOrder = useMemo(() => effectiveGalleryOrder(matches, curation), [matches, curation]);
  const provenance = useMemo(() => summarizeProvenance(matches), [matches]);
  const matchSlugs = useMemo(() => new Set(matches.map((match) => match.replication.slug)), [matches]);
  const titleOf = useCallback(
    (slug: string) => matches.find((match) => match.replication.slug === slug)?.replication.title ?? slug,
    [matches],
  );

  const applyCuration = useCallback((next: GalleryCurationState, message: string) => {
    setCuration(next);
    setSaveState("idle");
    setAnnouncement(message);
  }, []);

  const handleCurate = useCallback(
    (slug: string) => {
      const next = curateSlug(curation, slug);
      applyCuration(next, `${titleOf(slug)} curated to position ${next.curated.length}.`);
    },
    [applyCuration, curation, titleOf],
  );

  const handleUncurate = useCallback(
    (slug: string) => {
      applyCuration(uncurateSlug(curation, slug), `${titleOf(slug)} returned to the default order.`);
    },
    [applyCuration, curation, titleOf],
  );

  const handleExclude = useCallback(
    (slug: string) => {
      const next = excludeSlug(curation, slug);
      applyCuration(
        next,
        `${titleOf(slug)} excluded — ${next.removed.length} on the excluded shelf.`,
      );
    },
    [applyCuration, curation, titleOf],
  );

  const handleRestore = useCallback(
    (slug: string) => {
      applyCuration(restoreSlug(curation, slug), `${titleOf(slug)} restored to the default order.`);
    },
    [applyCuration, curation, titleOf],
  );

  const handleMove = useCallback(
    (slug: string, direction: "up" | "down") => {
      const next = moveCuratedSlug(curation, slug, direction);
      if (next === curation) {
        return;
      }
      applyCuration(
        next,
        `Moved ${titleOf(slug)} to position ${next.curated.indexOf(slug) + 1} of ${next.curated.length}.`,
      );
    },
    [applyCuration, curation, titleOf],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const { setNodeRef: setAutoZoneRef, isOver: isOverAutoZone } = useDroppable({ id: AUTO_ZONE_ID });

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) {
        return;
      }
      const activeSlug = String(active.id);
      const next = applyCuratedDrag(curation, activeSlug, String(over.id));
      if (next === curation) {
        return;
      }
      const position = next.curated.indexOf(activeSlug);
      applyCuration(
        next,
        position === -1
          ? `${titleOf(activeSlug)} returned to the default order.`
          : `Moved ${titleOf(activeSlug)} to position ${position + 1} of ${next.curated.length}.`,
      );
    },
    [applyCuration, curation, titleOf],
  );

  const handleSelectSubstance = useCallback(
    (slug: string) => {
      if (slug === substanceSlug) {
        return;
      }
      if (
        dirtyRef.current &&
        !window.confirm("This gallery has unsaved changes. Discard them and switch substances?")
      ) {
        return;
      }
      onNavigateToSubstance(slug);
    },
    [onNavigateToSubstance, substanceSlug],
  );

  const handleSave = useCallback(async () => {
    if (!substanceSlug) {
      return;
    }
    setSaveState("saving");
    setFeedback(null);
    try {
      const response = await fetch(`${SUBSTANCES_API}/${encodeURIComponent(substanceSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curatedSlugs: curation.curated, removedSlugs: curation.removed }),
      });
      if (!response.ok) {
        setSaveState("error");
        setFeedback({
          tone: "danger",
          message: await readError(response, "Saving the gallery failed."),
        });
        return;
      }
      const echo = (await response.json()) as {
        curated_slugs: string[];
        removed_slugs: string[];
        pruned_curated: string[];
        pruned_removed: string[];
      };
      const adopted: GalleryCurationState = { curated: echo.curated_slugs, removed: echo.removed_slugs };
      setCuration(adopted);
      setSavedCuration({ curated: [...echo.curated_slugs], removed: [...echo.removed_slugs] });
      setSaveState("saved");
      setCandidates((current) => {
        const next = current.map((candidate) =>
          candidate.slug === substanceSlug
            ? {
                ...candidate,
                curated: true,
                curated_count: echo.curated_slugs.length,
                removed_count: echo.removed_slugs.length,
              }
            : candidate,
        );
        cachedCandidates = next;
        return next;
      });
      const pruned = [...echo.pruned_curated, ...echo.pruned_removed];
      setAnnouncement(
        `Saved the gallery: ${echo.curated_slugs.length} curated, ${echo.removed_slugs.length} excluded.`,
      );
      setFeedback({
        tone: pruned.length > 0 ? "warning" : "success",
        message:
          pruned.length > 0
            ? `Saved. The server dropped ${pruned.length} slug(s) that no longer match: ${pruned.join(", ")}.`
            : `Saved ${echo.curated_slugs.length} curated and ${echo.removed_slugs.length} excluded replications.`,
      });
    } catch {
      setSaveState("error");
      setFeedback({ tone: "danger", message: "Saving failed: the gallery endpoint is unreachable." });
    }
  }, [curation, substanceSlug]);

  const handleDiscard = useCallback(() => {
    setCuration({ curated: [...savedCuration.curated], removed: [...savedCuration.removed] });
    setSaveState("idle");
    setAnnouncement("Changes discarded.");
  }, [savedCuration]);

  /* --------------------------------------------------------- add-from-corpus */

  /**
   * The rail's current search and filters, narrowed to what this gallery can
   * actually take: publishable image/video replications. Matched rows offer
   * Curate; unmatched publishable rows stay visible with the tagging hint, so
   * the region teaches the effect_tags backfill instead of silently hiding
   * work that is one tag away.
   */
  const addCandidates = useMemo(() => {
    const curatedSet = new Set(curation.curated);
    return visibleRows
      .filter((row) => row.role === "replication" && (row.type === "image" || row.type === "video"))
      .filter((row) => !curatedSet.has(row.slug))
      .slice(0, ADD_PREVIEW_CAP);
  }, [curation.curated, visibleRows]);

  /* ------------------------------------------------------------------ view */

  const curatedSlugList = useMemo(
    () => split.curated.map((match) => match.replication.slug),
    [split.curated],
  );

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:images"
      title="Substance Replication Showcases"
      description="Each substance article's Visual group ends with its matched replications. Curated rows play first in this exact order; everything else follows the corpus default; excluded rows never surface on that article."
      actions={
        detail ? (
          <EditorStatusPill tone="neutral">
            {`${split.curated.length} curated · ${matches.length} matched`}
          </EditorStatusPill>
        ) : undefined
      }
    >
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {candidatesLoaded ? (
          <SubstanceGalleryPicker
            candidates={candidates}
            currentSlug={substanceSlug}
            onSelect={handleSelectSubstance}
          />
        ) : (
          <p className="theme-text-muted text-sm">Loading the substance list…</p>
        )}
        {detail ? (
          <div className="min-w-0">
            <p className="theme-text-muted font-mono text-xs">
              {provenance.matched} matched from {provenance.effectCount} visual effect
              {provenance.effectCount === 1 ? "" : "s"} · {provenance.viaEffectSlug} via effect_slug ·{" "}
              {provenance.viaEffectTags} via effect_tags
            </p>
            {detail.unmatchedEffectNames.length > 0 ? (
              <Button
                type="button"
                variant="textLink"
                size="auto"
                className="text-xs"
                aria-expanded={unmatchedOpen}
                onClick={() => setUnmatchedOpen((open) => !open)}
              >
                {detail.unmatchedEffectNames.length} visual effect
                {detail.unmatchedEffectNames.length === 1 ? "" : "s"} with nothing to show
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {feedback ? (
        <ActionNotice tone={feedback.tone} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </ActionNotice>
      ) : null}

      {detail && unmatchedOpen ? (
        <EmptyStateSurface padding="sm" radius="lg" className="space-y-1.5 text-sm">
          <p className="theme-text-primary font-medium">
            No publishable replication matches these visual effects yet:
          </p>
          <p className="theme-text-muted">{detail.unmatchedEffectNames.join(" · ")}</p>
          <p className="theme-text-faint text-xs">
            Tag a corpus row with the effect in the studio (effect_tags) — or set it as the row's
            owning effect — and it will surface here and on the article.
          </p>
        </EmptyStateSurface>
      ) : null}

      {!substanceSlug ? (
        <EmptyStateSurface padding="sm" radius="lg" className="theme-text-muted text-sm">
          Pick a substance to curate its Replication Showcase. The dot marks substances with a stored
          curation; the count is how many corpus rows currently match.
        </EmptyStateSurface>
      ) : detailState.status === "loading" ? (
        <p className="theme-text-muted text-sm">Loading the gallery…</p>
      ) : detailState.status === "error" ? (
        <EmptyStateSurface padding="sm" radius="lg" className="space-y-2 text-sm">
          <p className="theme-text-primary">{detailState.message}</p>
        </EmptyStateSurface>
      ) : detail && matches.length === 0 ? (
        <EmptyStateSurface padding="sm" radius="lg" className="space-y-1.5 text-sm">
          <p className="theme-text-primary font-medium">
            Nothing in the corpus matches {detail.substance.title} yet.
          </p>
          {detail.unmatchedEffectNames.length > 0 ? (
            <>
              <p className="theme-text-muted">
                Its visual effects: {detail.unmatchedEffectNames.join(" · ")}
              </p>
              <p className="theme-text-faint text-xs">
                Tag a corpus row with one of these effects in the studio (effect_tags) — or set it as
                the row's owning effect — and it will appear here and on the article.
              </p>
            </>
          ) : (
            <p className="theme-text-muted">
              The article lists no visual effects, so its showcase stays empty.
            </p>
          )}
        </EmptyStateSurface>
      ) : detail ? (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="space-y-2">
              <SortableContext items={curatedSlugList} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {split.curated.map((match, index) => (
                    <SortableCuratedRow
                      key={match.replication.slug}
                      match={match}
                      index={index}
                      curatedCount={split.curated.length}
                      onMove={handleMove}
                      onUncurate={handleUncurate}
                      onExclude={handleExclude}
                    />
                  ))}
                </ul>
              </SortableContext>

              {split.curated.length === 0 ? (
                <p className="theme-text-faint text-xs">
                  Nothing curated yet. Everything below plays in the default order.
                </p>
              ) : null}

              <SectionDivider label="Default order" dropRef={setAutoZoneRef} isOver={isOverAutoZone} />

              <ul className="space-y-2">
                {split.auto.map((match) => (
                  <AutoRow
                    key={match.replication.slug}
                    match={match}
                    onCurate={handleCurate}
                    onExclude={handleExclude}
                  />
                ))}
              </ul>
              {split.auto.length === 0 ? (
                <p className="theme-text-faint text-xs">Every match is curated or excluded.</p>
              ) : null}
            </div>
          </DndContext>

          {split.excluded.length > 0 ? (
            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={excludedOpen}
                onClick={() => setExcludedOpen((open) => !open)}
              >
                <Icon icon={excludedOpen ? "lucide:chevron-down" : "lucide:chevron-right"} size={14} />
                Excluded from this gallery ({split.excluded.length})
              </Button>
              {excludedOpen ? (
                <ul className="space-y-2">
                  {split.excluded.map((match) => (
                    <ExcludedRow key={match.replication.slug} match={match} onRestore={handleRestore} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <SectionDivider label="Add from the studio library" />
          <p className="theme-text-faint text-xs">
            {railNarrowed
              ? "Following the studio's current search and filters."
              : "Narrow the studio's search or filters on the left to find a row."}{" "}
            Only publishable image and video replications can join a showcase; adding curates to the
            tail of the head.
          </p>
          <ul className="space-y-2">
            {addCandidates.map((row) => {
              const matched = matchSlugs.has(row.slug);
              const excluded = curation.removed.includes(row.slug);
              return (
                <li key={row.id} className="list-none">
                  <InteractiveContentCard variant="public" padding="sm" radius="lg">
                    <div className="flex items-center gap-3">
                      {row.thumbnail_url ?? (row.type === "image" ? row.url : null) ? (
                        <img
                          src={(row.thumbnail_url ?? row.url)!}
                          alt=""
                          loading="lazy"
                          className="h-14 w-14 shrink-0 rounded-lg border border-[color:var(--editor-chip-border)] object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[color:var(--editor-chip-border)] bg-[var(--editor-panel-bg-subtle)]"
                        >
                          <Icon
                            icon={row.type === "video" ? "lucide:film" : "lucide:image"}
                            size={18}
                            className="theme-text-faint"
                          />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="theme-text-primary truncate text-sm font-medium">{row.title}</p>
                        <p className="theme-text-faint truncate text-xs">
                          {row.artist} · {row.effect_name ?? "no effect"} · {row.type}
                        </p>
                      </div>
                      {matched ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                          aria-label={`Curate ${row.title}`}
                          onClick={() => handleCurate(row.slug)}
                        >
                          <Icon icon="lucide:pin" size={14} />
                          {excluded ? "Restore & curate" : "Curate"}
                        </Button>
                      ) : (
                        <span className="theme-text-faint shrink-0 text-xs">
                          not matched — tag it with one of this substance's effects
                        </span>
                      )}
                    </div>
                  </InteractiveContentCard>
                </li>
              );
            })}
          </ul>
          {addCandidates.length === 0 ? (
            <p className="theme-text-faint text-xs">The current search and filters show nothing addable.</p>
          ) : null}

          <div className="space-y-1.5">
            <p className="theme-text-faint text-[11px] uppercase tracking-[0.3em]">Public order preview</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {effectiveOrder.slice(0, PREVIEW_STRIP_CAP).map((match, index) => (
                <span
                  key={match.replication.slug}
                  title={`${index + 1}. ${match.replication.title}`}
                  className={cn(
                    "block h-9 w-9 overflow-hidden rounded-md border border-[color:var(--editor-chip-border)]",
                    index === 0 && "ring-2 ring-dose-accent-strong ring-offset-1",
                  )}
                >
                  {match.replication.thumbnail_url ??
                  (match.replication.type === "image" ? match.replication.url : null) ? (
                    <img
                      src={(match.replication.thumbnail_url ?? match.replication.url)!}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-[var(--editor-panel-bg-subtle)]">
                      <Icon icon="lucide:film" size={12} className="theme-text-faint" />
                    </span>
                  )}
                </span>
              ))}
              {effectiveOrder.length > PREVIEW_STRIP_CAP ? (
                <span className="theme-text-faint text-xs">
                  +{effectiveOrder.length - PREVIEW_STRIP_CAP} more in default order
                </span>
              ) : null}
              {effectiveOrder.length === 0 ? (
                <span className="theme-text-faint text-xs">Nothing will show on the article.</span>
              ) : null}
            </div>
          </div>

          <EditorToolbar variant="split">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={!isDirty || saveState === "saving"}
                onClick={() => void handleSave()}
              >
                <Icon icon="lucide:save" size={15} />
                Save gallery
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!isDirty || saveState === "saving"}
                onClick={handleDiscard}
              >
                <Icon icon="lucide:rotate-ccw" size={15} />
                Discard changes
              </Button>
              {detail.curation ? (
                <span className="theme-text-faint text-xs">
                  Last saved {detail.curation.updated_at.slice(0, 10)} by {detail.curation.updated_by}
                </span>
              ) : (
                <span className="theme-text-faint text-xs">Never curated — the article runs on the default order.</span>
              )}
            </div>
            {saveState === "idle" || saveState === "saved" ? (
              <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
                {isDirty ? "Unsaved changes" : "Gallery saved"}
              </EditorStatusPill>
            ) : (
              <EditorActionStatus status={saveState} />
            )}
          </EditorToolbar>
        </>
      ) : null}
    </EditorSection>
  );
}

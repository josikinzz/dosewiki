/**
 * Pure state logic for the Substance Galleries curation portal
 * (`/dev` → Replications → Substances).
 *
 * The portal edits one substance's curation as two slug lists — the curated
 * head in its exact order and the excluded shelf — against the server-derived
 * match list. Every transition here mirrors the P3 prototype's verdict:
 * exclude is only meaningful for matches, curated∩removed is impossible by
 * construction, and a save submits both full arrays and adopts the server's
 * pruned echo verbatim.
 */

import type { StudioMediaType } from "./replicationStudioModel";

/** One picker row of the batched `/api/dev/replications/substances` read. */
export type GalleryCandidate = {
  slug: string;
  title: string;
  match_count: number;
  curated: boolean;
  curated_count: number;
  removed_count: number;
};

export type GalleryMatchProvenance = {
  matchedVia: "effect_slug" | "effect_tags";
  effectSlug: string;
  effectName: string;
};

/** The media fields the panel rows draw, resolved server-side. */
export type GalleryMatchReplication = {
  id: string;
  slug: string;
  title: string;
  artist: string;
  type: StudioMediaType;
  effect_slug: string | null;
  effect_name: string | null;
  effect_tags: string[];
  credit_line: string | null;
  rights_status: string | null;
  url: string | null;
  thumbnail_url: string | null;
  format: string;
};

export type GalleryMatch = {
  replication: GalleryMatchReplication;
  provenance: GalleryMatchProvenance;
};

export type GalleryCurationRow = {
  curated_slugs: string[];
  removed_slugs: string[];
  updated_at: string;
  updated_by: string;
};

/** The per-substance `/api/dev/replications/substances/<slug>` payload. */
export type GalleryDetail = {
  substance: { slug: string; title: string };
  matches: GalleryMatch[];
  curation: GalleryCurationRow | null;
  unmatchedEffectNames: string[];
  /**
   * The article's visual effects, for tagging an untagged corpus row into the
   * match set: the only `effect_slug` values that can make a row match here.
   */
  effectOptions: { slug: string; name: string }[];
};

/** The editable state: the two lists `substanceGalleries:upsert` stores. */
export type GalleryCurationState = {
  curated: string[];
  removed: string[];
};

export function curationStateOf(curation: GalleryCurationRow | null): GalleryCurationState {
  return {
    curated: [...(curation?.curated_slugs ?? [])],
    removed: [...(curation?.removed_slugs ?? [])],
  };
}

export function curationStatesEqual(a: GalleryCurationState, b: GalleryCurationState): boolean {
  return (
    a.curated.length === b.curated.length &&
    a.removed.length === b.removed.length &&
    a.curated.every((slug, index) => b.curated[index] === slug) &&
    a.removed.every((slug, index) => b.removed[index] === slug)
  );
}

/**
 * Pin a match to the tail of the curated head. Also lifts it off the excluded
 * shelf: a slug can never sit in both lists.
 */
export function curateSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (state.curated.includes(slug)) {
    return state;
  }
  return {
    curated: [...state.curated, slug],
    removed: state.removed.filter((entry) => entry !== slug),
  };
}

/** Return a curated match to the default order. */
export function uncurateSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (!state.curated.includes(slug)) {
    return state;
  }
  return { ...state, curated: state.curated.filter((entry) => entry !== slug) };
}

/**
 * Suppress a match onto the excluded shelf. Also un-curates it: exclusion and
 * a pinned position cannot coexist.
 */
export function excludeSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (state.removed.includes(slug)) {
    return state;
  }
  return {
    curated: state.curated.filter((entry) => entry !== slug),
    removed: [...state.removed, slug],
  };
}

/** Lift a match off the excluded shelf, back into the default order. */
export function restoreSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (!state.removed.includes(slug)) {
    return state;
  }
  return { ...state, removed: state.removed.filter((entry) => entry !== slug) };
}

/** Move one curated slug a step up or down the head; no-op at the edges. */
export function moveCuratedSlug(
  state: GalleryCurationState,
  slug: string,
  direction: "up" | "down",
): GalleryCurationState {
  const index = state.curated.indexOf(slug);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= state.curated.length) {
    return state;
  }
  const curated = [...state.curated];
  curated[index] = curated[target];
  curated[target] = slug;
  return { ...state, curated };
}

/**
 * Insert a slug at an exact position in the curated head. Out-of-range indices
 * clamp instead of throwing so a drop past the last row means "last", and an
 * already-curated slug moves rather than duplicating. Lifts the slug off the
 * excluded shelf for the same reason `curateSlug` does.
 */
export function curateSlugAt(
  state: GalleryCurationState,
  slug: string,
  index: number,
): GalleryCurationState {
  const from = state.curated.indexOf(slug);
  // A move re-inserts into a head one shorter than it is now; an insert appends.
  const limit = from === -1 ? state.curated.length : state.curated.length - 1;
  const target = Math.min(Math.max(Math.trunc(index), 0), limit);
  if (from === target && !state.removed.includes(slug)) {
    return state;
  }
  const curated = [...state.curated];
  if (from !== -1) {
    curated.splice(from, 1);
  }
  curated.splice(target, 0, slug);
  return { curated, removed: state.removed.filter((entry) => entry !== slug) };
}

/**
 * Jump a curated slug to the top or bottom of the head — the keyboard and
 * overflow-menu equivalent of dragging it the whole way.
 */
export function moveCuratedSlugToEdge(
  state: GalleryCurationState,
  slug: string,
  edge: "top" | "bottom",
): GalleryCurationState {
  const index = state.curated.indexOf(slug);
  if (index === -1) {
    return state;
  }
  const target = edge === "top" ? 0 : state.curated.length - 1;
  if (index === target) {
    return state;
  }
  const curated = [...state.curated];
  curated.splice(index, 1);
  curated.splice(target, 0, slug);
  return { ...state, curated };
}

/**
 * Apply a board drag, in terms of the order the editor can actually see.
 *
 * The stored curation is a *prefix*: an ordered head, then whatever the matcher
 * derives. So a position in the derived tail has no representation of its own —
 * to put a row at absolute position N, every position before N must be pinned
 * too. That is why a drop into the tail pins the rows above it: without that the
 * drop is unexpressible, and the older implementation silently discarded it.
 *
 * Rows past the drop stay derived, so the head only grows as far as the editor
 * actually reordered. Dropping on anything that is not a row (the un-curate
 * zone) still returns the active row to the default order.
 */
export function applyBoardDrag(
  state: GalleryCurationState,
  board: GalleryBoard,
  activeSlug: string,
  overId: string,
): GalleryCurationState {
  if (activeSlug === overId) {
    return state;
  }
  const order = board.rows.map((row) => row.match.replication.slug);
  const from = order.indexOf(activeSlug);
  const to = order.indexOf(overId);
  if (from === -1 || to === -1) {
    return uncurateSlug(state, activeSlug);
  }
  // dnd-kit's sortable semantic: the dragged row takes the slot it was dropped
  // on, and everything between shuffles up or down to close the gap.
  const moved = [...order];
  moved.splice(from, 1);
  moved.splice(to, 0, activeSlug);
  /*
   * Pin far enough to express the drop, and never drop a row that was already
   * pinned: promoting from the tail pushes the existing head down by one, so
   * the cut has to follow the last stored slug to wherever it now sits.
   */
  const lastStored = state.curated.reduce((deepest, slug) => Math.max(deepest, moved.indexOf(slug)), -1);
  const prefix = Math.max(to + 1, lastStored + 1);
  return { curated: moved.slice(0, prefix), removed: state.removed };
}

/** Which band a board row sits in: the pinned head or the default tail. */
export type GalleryBand = "curated" | "auto";

export type GalleryBoardRow = {
  match: GalleryMatch;
  /** 1-based position in the effective public order. */
  position: number;
  /** True when position <= cap: the article's stage renders this row. */
  onStage: boolean;
  band: GalleryBand;
};

export type GalleryBoard = {
  /** Curated head then auto tail, numbered continuously from 1. */
  rows: GalleryBoardRow[];
  excluded: GalleryMatch[];
  /** min(rows.length, cap) — how many of the cap public slots are filled. */
  filledSlots: number;
  /** max(0, cap - rows.length) — rendered as ghost frames. */
  emptySlots: number;
  /** Count of rows in the curated band. */
  curatedCount: number;
  cap: number;
};

/**
 * Order the matches exactly as the public stage will: curated head in stored
 * order, then everything else in corpus order, excluded slugs dropped. Curated
 * or removed slugs that match nothing simply vanish — the same read-time
 * tolerance as the public merge, so numbering never leaves a hole; the save
 * prunes them permanently and the echo makes the pruning visible.
 */
function orderGallery(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
): { curated: GalleryMatch[]; auto: GalleryMatch[]; excluded: GalleryMatch[] } {
  const bySlug = new Map(matches.map((match) => [match.replication.slug, match]));
  const removed = new Set(state.removed);
  const curated = state.curated
    .map((slug) => (removed.has(slug) ? undefined : bySlug.get(slug)))
    .filter((match): match is GalleryMatch => match !== undefined);

  const pinned = new Set(curated.map((match) => match.replication.slug));
  const auto: GalleryMatch[] = [];
  const excluded: GalleryMatch[] = [];
  for (const match of matches) {
    const slug = match.replication.slug;
    if (removed.has(slug)) {
      excluded.push(match);
    } else if (!pinned.has(slug)) {
      auto.push(match);
    }
  }

  return { curated, auto, excluded };
}

/**
 * The board the portal draws: one continuously numbered list across both
 * bands, plus the slot arithmetic that makes the article's hard cap visible —
 * the whole point of the surface is knowing which rows fall off the stage.
 */
export function buildGalleryBoard(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
  cap: number,
): GalleryBoard {
  const { curated, auto, excluded } = orderGallery(matches, state);
  const rows: GalleryBoardRow[] = [];
  for (const match of curated) {
    const position = rows.length + 1;
    rows.push({ match, position, onStage: position <= cap, band: "curated" });
  }
  for (const match of auto) {
    const position = rows.length + 1;
    rows.push({ match, position, onStage: position <= cap, band: "auto" });
  }
  return {
    rows,
    excluded,
    filledSlots: Math.min(rows.length, cap),
    emptySlots: Math.max(0, cap - rows.length),
    curatedCount: curated.length,
    cap,
  };
}

/** The effective public order: curated head, then the auto tail. */
export function effectiveGalleryOrder(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
): GalleryMatch[] {
  const { curated, auto } = orderGallery(matches, state);
  return [...curated, ...auto];
}

/**
 * Undo stack for the working curation. Curation is a long sequence of tiny
 * reorders, so an accidental drag must be reversible without a refetch that
 * would discard every other unsaved edit.
 */
export type CurationHistory = {
  past: readonly GalleryCurationState[];
  present: GalleryCurationState;
  future: readonly GalleryCurationState[];
};

/** Deep enough for a whole curation session, shallow enough to stay cheap. */
export const HISTORY_LIMIT = 50;

export function historyOf(state: GalleryCurationState): CurationHistory {
  return { past: [], present: state, future: [] };
}

/**
 * Record a new present. Mutators return the same reference on a no-op, so
 * reference equality is exactly the right test for "nothing happened" — an
 * edge-of-list drag must not push an undo step that appears to do nothing.
 */
export function pushHistory(
  history: CurationHistory,
  next: GalleryCurationState,
): CurationHistory {
  if (next === history.present) {
    return history;
  }
  const past = [...history.past, history.present];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: [],
  };
}

export function undoHistory(history: CurationHistory): CurationHistory {
  if (history.past.length === 0) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: CurationHistory): CurationHistory {
  if (history.future.length === 0) {
    return history;
  }
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}

export function canUndo(history: CurationHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: CurationHistory): boolean {
  return history.future.length > 0;
}

/**
 * The server's row when a save is rejected as stale. Carried back to the panel
 * so a conflict can show what the other editor did rather than just failing.
 */
export type GalleryConflict = {
  curated_slugs: string[];
  removed_slugs: string[];
  updated_at: string;
  updated_by: string | null;
};

export type GalleryProvenanceSummary = {
  matched: number;
  effectCount: number;
  viaEffectSlug: number;
  viaEffectTags: number;
};

/** Counts behind "N matched from M visual effects · X via effect_slug · Y via effect_tags". */
export function summarizeProvenance(matches: readonly GalleryMatch[]): GalleryProvenanceSummary {
  const effectSlugs = new Set<string>();
  let viaEffectSlug = 0;
  for (const match of matches) {
    effectSlugs.add(match.provenance.effectSlug);
    if (match.provenance.matchedVia === "effect_slug") {
      viaEffectSlug += 1;
    }
  }
  return {
    matched: matches.length,
    effectCount: effectSlugs.size,
    viaEffectSlug,
    viaEffectTags: matches.length - viaEffectSlug,
  };
}

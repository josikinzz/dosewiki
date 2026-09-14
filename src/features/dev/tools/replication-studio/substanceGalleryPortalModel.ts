/**
 * Pure state logic for the Substance Galleries ordering and exclusion portal.
 *
 * Automatic drug/class assignments publish without an editor gate. The stored
 * lists are deltas: `curated_slugs` orders priority rows within their placement
 * tier, while `removed_slugs` suppresses a row on one article. Direct manual
 * associations remain possible through `curated_slugs`.
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

type GalleryMatchProvenance = | {
    matchedVia: "specific_drug";
    effectSlug: string;
    effectName: string;
    substanceSlug: string;
  }
| {
    matchedVia: "drug_class";
    effectSlug: string;
    effectName: string;
    drugClass: "dissociatives" | "deliriants";
  }
| {
    matchedVia: "visual_disconnection";
    effectSlug: "visual-disconnection";
    effectName: string;
    drugClass: "dissociatives";
  }
| {
    matchedVia: "curated";
    effectSlug: string;
    effectName: string;
  }

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
};

/** The editable ordering and per-article exclusion delta. */
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

/** Prioritize a row within its automatic tier, or add a direct association. */
export function curateSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (state.curated.includes(slug)) {
    return state;
  }
  return {
    curated: [...state.curated, slug],
    removed: state.removed.filter((entry) => entry !== slug),
  };
}

/** Remove stored priority; an automatic match remains published in its tier. */
export function uncurateSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (!state.curated.includes(slug)) {
    return state;
  }
  return { ...state, curated: state.curated.filter((entry) => entry !== slug) };
}

/** Suppress a row on this article. Also removes stored priority. */
export function excludeSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (state.removed.includes(slug)) {
    return state;
  }
  return {
    curated: state.curated.filter((entry) => entry !== slug),
    removed: [...state.removed, slug],
  };
}

/** Lift a row off the excluded shelf and back into automatic placement. */
export function restoreSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (!state.removed.includes(slug)) {
    return state;
  }
  return { ...state, removed: state.removed.filter((entry) => entry !== slug) };
}

/** Move one curated slug a step up or down the published order; no-op at the edges. */
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
 * Insert a slug at an exact position in the curated list. Out-of-range indices
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
  // A move re-inserts into a list one shorter than it is now; an insert appends.
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
 * Jump a curated slug to the first or last published position — the keyboard
 * and overflow-menu equivalent of dragging it the whole way.
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
 * Only the curated list is published, so it is the only thing a drag can
 * express. Dropping onto a curated row takes that row's index — promoting a
 * candidate into the article, or reordering the article. Any other drop id
 * (the un-curate zone, a candidate row, nothing) takes the active row off the
 * article.
 *
 * The old prefix-pinning rule is gone with the published tail: there is no
 * longer an absolute position below the curated list for a drop to mean, so
 * nothing has to be pinned to express one.
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
  // Read the order off the board, not off `state.curated`: the board has
  // already dropped slugs that match nothing, so indices mean what the editor
  // sees and a phantom position cannot shift the drop.
  const curated = board.rows
    .filter((row) => row.band === "curated")
    .map((row) => row.match.replication.slug);
  const to = curated.indexOf(overId);
  if (to === -1) {
    return uncurateSlug(state, activeSlug);
  }
  // dnd-kit's sortable semantic: the dragged row takes the slot it was dropped
  // on, and everything between shuffles up or down to close the gap.
  const from = curated.indexOf(activeSlug);
  if (from !== -1) {
    curated.splice(from, 1);
  }
  curated.splice(Math.min(to, curated.length), 0, activeSlug);
  return { curated, removed: state.removed.filter((slug) => slug !== activeSlug) };
}

/** Which ordering band a row occupies: stored priority or automatic placement. */
type GalleryBand = "curated" | "auto"

export type GalleryBoardRow = {
  match: GalleryMatch;
  /** 1-based position in the effective article collection. */
  position: number;
  /** True when the effective position is within the inline stage cap. */
  onStage: boolean;
  band: GalleryBand;
};

export type GalleryBoard = {
  /** Priority and automatic rows, each retaining effective article order. */
  rows: GalleryBoardRow[];
  excluded: GalleryMatch[];
  filledSlots: number;
  emptySlots: number;
  /** Rows carrying a stored priority/direct-association entry. */
  curatedCount: number;
  /** Automatically placed rows without a stored priority entry. */
  candidateCount: number;
  /** Every non-excluded row in effective article order. */
  publishedCount: number;
  cap: number;
};

function galleryTier(match: GalleryMatch): number {
  if (match.provenance.matchedVia === "visual_disconnection") return 5;
  if (match.provenance.matchedVia === "curated") return 4;
  if (match.provenance.matchedVia === "specific_drug") {
    return match.replication.type === "video" ? 0 : 1;
  }
  return match.replication.type === "video" ? 2 : 3;
}

/**
 * Apply the public ordering contract: specific videos, specific images,
 * permitted class videos, permitted class images, direct associations, then
 * Visual Disconnection still-image fallbacks. Stored order only breaks ties
 * inside a tier.
 */
function orderGallery(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
): { published: GalleryMatch[]; curated: GalleryMatch[]; auto: GalleryMatch[]; excluded: GalleryMatch[] } {
  const removed = new Set(state.removed);
  const curatedOrder = new Map(state.curated.map((slug, index) => [slug, index]));
  const published = matches.filter((match) => !removed.has(match.replication.slug));
  published.sort((left, right) => {
    const tierDifference = galleryTier(left) - galleryTier(right);
    if (tierDifference !== 0) return tierDifference;
    const leftOrder = curatedOrder.get(left.replication.slug);
    const rightOrder = curatedOrder.get(right.replication.slug);
    if (leftOrder === undefined && rightOrder !== undefined) return 1;
    if (leftOrder !== undefined && rightOrder === undefined) return -1;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }
    return 0;
  });

  const curated: GalleryMatch[] = [];
  const auto: GalleryMatch[] = [];
  for (const match of published) {
    (curatedOrder.has(match.replication.slug) ? curated : auto).push(match);
  }
  const excluded = matches.filter((match) => removed.has(match.replication.slug));
  return { published, curated, auto, excluded };
}

/** Build the priority editor bands while preserving each row's true article position. */
export function buildGalleryBoard(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
  cap: number,
): GalleryBoard {
  const { published, curated, auto, excluded } = orderGallery(matches, state);
  const positionBySlug = new Map(
    published.map((match, index) => [match.replication.slug, index + 1]),
  );
  const toBoardRow = (match: GalleryMatch, band: GalleryBand): GalleryBoardRow => {
    const position = positionBySlug.get(match.replication.slug) ?? published.length + 1;
    return { match, position, onStage: position <= cap, band };
  };
  return {
    rows: [
      ...curated.map((match) => toBoardRow(match, "curated")),
      ...auto.map((match) => toBoardRow(match, "auto")),
    ],
    excluded,
    filledSlots: Math.min(published.length, cap),
    emptySlots: Math.max(0, cap - published.length),
    curatedCount: curated.length,
    candidateCount: auto.length,
    publishedCount: published.length,
    cap,
  };
}

/** The exact collection the article and the portal preview publish. */
export function effectiveGalleryOrder(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
): GalleryMatch[] {
  return orderGallery(matches, state).published;
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
  specificDrug: number;
  generalClass: number;
  visualDisconnection: number;
  manual: number;
};

/** Count each automatic provenance tier and direct manual placements. */
export function summarizeProvenance(matches: readonly GalleryMatch[]): GalleryProvenanceSummary {
  let specificDrug = 0;
  let generalClass = 0;
  let visualDisconnection = 0;
  let manual = 0;
  for (const match of matches) {
    if (match.provenance.matchedVia === "specific_drug") specificDrug += 1;
    else if (match.provenance.matchedVia === "drug_class") generalClass += 1;
    else if (match.provenance.matchedVia === "visual_disconnection") visualDisconnection += 1;
    else manual += 1;
  }
  return {
    matched: matches.length,
    specificDrug,
    generalClass,
    visualDisconnection,
    manual,
  };
}

/**
 * Pure state logic for the Substance Galleries curation portal
 * (`/dev` → Replications → Substances).
 *
 * The portal edits one substance's curation as two slug lists — the curated
 * list, in its exact published order, and the excluded shelf — against the
 * server-derived match list. Curation is a publish gate: a match that is
 * neither curated nor excluded is a *candidate*, visible here and nowhere
 * else. Every transition mirrors the P3 prototype's verdict: exclude is only
 * meaningful for matches, curated∩removed is impossible by construction, and
 * a save submits both full arrays and adopts the server's pruned echo
 * verbatim.
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
 * Publish a candidate: append it to the end of the curated list. Also lifts it
 * off the excluded shelf, since a slug can never sit in both lists.
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

/** Unpublish a curated match: it drops back into the candidate pool. */
export function uncurateSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (!state.curated.includes(slug)) {
    return state;
  }
  return { ...state, curated: state.curated.filter((entry) => entry !== slug) };
}

/**
 * Suppress a match onto the excluded shelf. Also un-curates it: exclusion and
 * a published position cannot coexist.
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

/** Lift a match off the excluded shelf, back into the candidate pool. */
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

/** Which band a board row sits in: on the article, or in the candidate pool. */
export type GalleryBand = "curated" | "auto";

export type GalleryBoardRow = {
  match: GalleryMatch;
  /**
   * 1-based position on the article. Null for a candidate: it is not
   * published, so it has no position to claim.
   */
  position: number | null;
  /** True when the row is curated and its position is within the stage cap. */
  onStage: boolean;
  band: GalleryBand;
};

export type GalleryBoard = {
  /** Curated rows first, numbered from 1; then the unordered candidate pool. */
  rows: GalleryBoardRow[];
  excluded: GalleryMatch[];
  /** min(curatedCount, cap) — how many of the cap public slots are filled. */
  filledSlots: number;
  /** max(0, cap - curatedCount) — rendered as ghost frames. */
  emptySlots: number;
  /** Rows the article publishes (before the cap). */
  curatedCount: number;
  /** Matched works that are neither curated nor excluded: the candidate pool. */
  candidateCount: number;
  cap: number;
};

/**
 * Split the matches three ways: what the article publishes (the curated list
 * in stored order, minus exclusions), the candidate pool the matcher proposes,
 * and the excluded shelf. Curated or removed slugs that match nothing simply
 * vanish — the same read-time tolerance as the public merge, so numbering
 * never leaves a hole; the save prunes them permanently and the echo makes the
 * pruning visible.
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
 * The board the portal draws: the curated rows the article publishes, numbered
 * against the stage cap, followed by the candidate pool the matcher proposes.
 * Candidates carry no number because they appear nowhere — the slot arithmetic
 * counts the curated rows alone, which is what makes "3 of 12 curated" an
 * honest progress signal instead of a promise the article does not keep.
 */
export function buildGalleryBoard(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
  cap: number,
): GalleryBoard {
  const { curated, auto, excluded } = orderGallery(matches, state);
  const rows: GalleryBoardRow[] = curated.map((match, index) => ({
    match,
    position: index + 1,
    onStage: index + 1 <= cap,
    band: "curated",
  }));
  for (const match of auto) {
    rows.push({ match, position: null, onStage: false, band: "auto" });
  }
  return {
    rows,
    excluded,
    filledSlots: Math.min(curated.length, cap),
    emptySlots: Math.max(0, cap - curated.length),
    curatedCount: curated.length,
    candidateCount: auto.length,
    cap,
  };
}

/**
 * What the article publishes: the curated works in stored order, exclusions
 * dropped, and nothing else. This feeds the portal's article preview, so it
 * must stay in lockstep with `mergeCuratedGallery` in
 * `src/data/substanceReplicationGallery` — the public gate. Any divergence is
 * a preview that lies about what a reader will see.
 */
export function effectiveGalleryOrder(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
): GalleryMatch[] {
  return orderGallery(matches, state).curated;
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

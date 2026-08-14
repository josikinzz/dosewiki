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
 * Apply a drag within (or out of) the curated head: dropping onto another
 * curated slug takes its position; dropping anywhere else un-curates, which is
 * what lets the divider's drop zone work without a special case.
 */
export function applyCuratedDrag(
  state: GalleryCurationState,
  activeSlug: string,
  overSlug: string,
): GalleryCurationState {
  const from = state.curated.indexOf(activeSlug);
  if (from === -1 || activeSlug === overSlug) {
    return state;
  }
  const to = state.curated.indexOf(overSlug);
  if (to === -1) {
    return uncurateSlug(state, activeSlug);
  }
  const curated = [...state.curated];
  curated.splice(from, 1);
  curated.splice(to, 0, activeSlug);
  return { ...state, curated };
}

export type GallerySplit = {
  /** Matches pinned to the head, in the curated order. */
  curated: GalleryMatch[];
  /** Unpinned, unsuppressed matches in the default corpus order. */
  auto: GalleryMatch[];
  /** Suppressed matches, in shelf order. */
  excluded: GalleryMatch[];
};

/**
 * Partition the server's default-ordered match list into the three
 * temperatures. Curated or removed slugs that match nothing simply do not
 * appear — the same read-time tolerance as the public merge; the save prunes
 * them permanently and the echo makes the pruning visible.
 */
export function splitGallery(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
): GallerySplit {
  const bySlug = new Map(matches.map((match) => [match.replication.slug, match]));
  const curated = state.curated
    .map((slug) => bySlug.get(slug))
    .filter((match): match is GalleryMatch => match !== undefined);
  const excluded = state.removed
    .map((slug) => bySlug.get(slug))
    .filter((match): match is GalleryMatch => match !== undefined);

  const pinnedOrRemoved = new Set([...state.curated, ...state.removed]);
  const auto = matches.filter((match) => !pinnedOrRemoved.has(match.replication.slug));

  return { curated, auto, excluded };
}

/** The effective public order: curated head, then the auto tail. */
export function effectiveGalleryOrder(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
): GalleryMatch[] {
  const split = splitGallery(matches, state);
  return [...split.curated, ...split.auto];
}

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

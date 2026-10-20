import type { StudioMediaType } from "./replicationStudioModel";

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

export type GalleryDetail = {
  substance: { slug: string; title: string };
  matches: GalleryMatch[];
  curation: GalleryCurationRow | null;
};

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

export function curateSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (state.curated.includes(slug)) {
    return state;
  }
  return {
    curated: [...state.curated, slug],
    removed: state.removed.filter((entry) => entry !== slug),
  };
}

export function uncurateSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (!state.curated.includes(slug)) {
    return state;
  }
  return { ...state, curated: state.curated.filter((entry) => entry !== slug) };
}

export function excludeSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (state.removed.includes(slug)) {
    return state;
  }
  return {
    curated: state.curated.filter((entry) => entry !== slug),
    removed: [...state.removed, slug],
  };
}

export function restoreSlug(state: GalleryCurationState, slug: string): GalleryCurationState {
  if (!state.removed.includes(slug)) {
    return state;
  }
  return { ...state, removed: state.removed.filter((entry) => entry !== slug) };
}

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

export function applyBoardDrag(
  state: GalleryCurationState,
  board: GalleryBoard,
  activeSlug: string,
  overId: string,
): GalleryCurationState {
  if (activeSlug === overId) {
    return state;
  }
  const curated = board.rows
    .filter((row) => row.band === "curated")
    .map((row) => row.match.replication.slug);
  const to = curated.indexOf(overId);
  if (to === -1) {
    return uncurateSlug(state, activeSlug);
  }
  const from = curated.indexOf(activeSlug);
  if (from !== -1) {
    curated.splice(from, 1);
  }
  curated.splice(Math.min(to, curated.length), 0, activeSlug);
  return { curated, removed: state.removed.filter((slug) => slug !== activeSlug) };
}

type GalleryBand = "curated" | "auto"

export type GalleryBoardRow = {
  match: GalleryMatch;
  position: number;
  onStage: boolean;
  band: GalleryBand;
};

export type GalleryBoard = {
  rows: GalleryBoardRow[];
  excluded: GalleryMatch[];
  filledSlots: number;
  emptySlots: number;
  curatedCount: number;
  candidateCount: number;
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

export function effectiveGalleryOrder(
  matches: readonly GalleryMatch[],
  state: GalleryCurationState,
): GalleryMatch[] {
  return orderGallery(matches, state).published;
}

export type CurationHistory = {
  past: readonly GalleryCurationState[];
  present: GalleryCurationState;
  future: readonly GalleryCurationState[];
};

export const HISTORY_LIMIT = 50;

export function historyOf(state: GalleryCurationState): CurationHistory {
  return { past: [], present: state, future: [] };
}

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

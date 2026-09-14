import {
  defaultGalleryOrder,
  DEFAULT_GALLERY_TAXONOMY_FILTERS,
  type GalleryArtistTypeFilter,
  type GalleryContentFamilyFilter,
  type GalleryEffectFilter,
  type GalleryDrugFilter,
  type GalleryDrugClassFilter,
  type GalleryMode,
  type GalleryOrder,
  type GalleryTypeFilter,
  type GalleryViewingFilter,
  type GalleryYearFilter,
} from "@/features/effects/gallery/galleryTypes";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";

/**
 * The gallery's URL contract: gallery browse/focus states own their URLs,
 * while an effect's article is the canonical source page for that collection.
 * Defaults are omitted so the canonical browse view is `/replications`.
 *
 *   /replications                       by-artist browse (default)
 *   /replications?view=effect          by-effect browse
 *   /replications?view=year            by-year browse
 *   /replications?q=…&type=…&sort=…    search / media type / time order
 *   /replications/artist/<key>[?type=] one artist's works
 *   /effects/<slug>                    one effect's article collection
 *
 * Parsing is tolerant: junk parameter values read as the default rather than
 * producing an unrepresentable state.
 */

export const REPLICATIONS_PATH = "/replications";
export const REPLICATION_VIEWER_PARAM = "viewer";
export const GALLERY_BROWSE_COVER_ID = "replications-gallery-browse";
export const GALLERY_BROWSE_QUERY_KEYS = [
  "view",
  "q",
  "type",
  "sort",
  "year",
  "viewing",
  "artistType",
  "effect",
  "drug",
  "drugClass",
  "family",
] as const;

const REPLICATION_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
/** A year rail's key: `2020`, a merged span `1939-1952`, or `undated`. */
const YEAR_FILTER_PATTERN = /^(?:\d{4}(?:-\d{4})?|undated)$/;

export interface GalleryBrowseState {
  view: GalleryMode;
  query: string;
  type: GalleryTypeFilter;
  sort: GalleryOrder;
  year: GalleryYearFilter;
  viewing: GalleryViewingFilter;
  artistType: GalleryArtistTypeFilter;
  effect: GalleryEffectFilter;
  drug: GalleryDrugFilter;
  drugClass: GalleryDrugClassFilter;
  family: GalleryContentFamilyFilter;
}

/**
 * The canonical browse view: the by-artist axis, newest work first.
 *
 * `sort` is the artist axis's own default, not a global one. Each mode brings
 * its own through `defaultGalleryOrder` — "By effect" defers to the editor's
 * curation — so URL writing and parsing read the default against the view
 * rather than against this object.
 */
export const GALLERY_BROWSE_DEFAULTS: GalleryBrowseState = {
  view: "artist",
  query: "",
  type: "all",
  sort: defaultGalleryOrder("artist"),
  year: "all",
  ...DEFAULT_GALLERY_TAXONOMY_FILTERS,
};

/**
 * A focused gallery view: one artist's or one effect's works. A year has no
 * focus page of its own — nothing in the corpus belongs to a year the way a
 * work belongs to an artist or an effect, so a year is a browse grouping only.
 */
export interface GalleryFocus {
  kind: "artist" | "effect";
  /** Artist URL key (see `artistUrlKey`) or effect slug. */
  key: string;
}

type ParamsLike = Pick<URLSearchParams, "get">;

export function parseGalleryBrowseState(
  params: ParamsLike,
): GalleryBrowseState {
  const type = params.get("type");
  const sort = params.get("sort");
  const viewing = params.get("viewing");
  const artistType = params.get("artistType");
  const effect = params.get("effect");
  const drug = params.get("drug");
  const drugClass = params.get("drugClass");
  const family = params.get("family");
  const year = params.get("year");
  const view =
    params.get("view") === "effect"
      ? "effect"
      : params.get("view") === "year"
        ? "year"
        : "artist";
  return {
    view,
    query: params.get("q") ?? "",
    type:
      type === "image" || type === "video" || type === "audio" ? type : "all",
    // `curated` is an effect-view answer only: there is no editorial playlist
    // to defer to on an artist or a year, so it reads as that mode's default.
    sort:
      sort === "newest" || sort === "oldest" || (sort === "curated" && view === "effect")
        ? sort
        : defaultGalleryOrder(view),
    year: year && YEAR_FILTER_PATTERN.test(year) ? year : "all",
    viewing: viewing === "open-eye" || viewing === "closed-eye" ? viewing : "all",
    artistType:
      artistType === "replicator" || artistType === "traditional-psychedelic-artist"
        ? artistType
        : "all",
    effect: effect && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(effect) ? effect : "all",
    drug: drug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(drug) ? drug : "all",
    drugClass:
      drugClass === "psychedelics" || drugClass === "dissociatives" || drugClass === "deliriants" || drugClass === "other"
        ? drugClass
        : "all",
    family:
      family === "experiential-replication" ||
      family === "visionary-psychedelic-art" ||
      family === "traditional-cultural-art" ||
      family === "dark-surrealism" ||
      family === "optical-perceptual-art" ||
      family === "generative-abstract-art" ||
      family === "effect-illustration" ||
      family === "explanatory-figure" ||
      family === "uncertain"
        ? family
        : "all",
  };
}

/** Parse the active overlay work; invalid values fail closed. */
export function parseReplicationViewerSlug(params: ParamsLike): string | null {
  const slug = params.get(REPLICATION_VIEWER_PARAM);
  return slug && REPLICATION_SLUG_PATTERN.test(slug) ? slug : null;
}

function relativeUrl(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Add or replace the active viewer work without disturbing source state. */
export function buildReplicationViewerUrl(
  sourceUrl: string,
  slug: string,
): string {
  const url = new URL(sourceUrl, "https://dose.wiki");
  if (!REPLICATION_SLUG_PATTERN.test(slug)) return relativeUrl(url);
  url.searchParams.set(REPLICATION_VIEWER_PARAM, slug);
  return relativeUrl(url);
}

/** Remove only the overlay work, preserving collection filters and focus. */
export function closeReplicationViewerUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl, "https://dose.wiki");
  url.searchParams.delete(REPLICATION_VIEWER_PARAM);
  return relativeUrl(url);
}

export function buildGalleryBrowseUrl(
  state: Partial<GalleryBrowseState> = {},
): string {
  const params = new URLSearchParams();
  if (state.view === "effect" || state.view === "year") {
    params.set("view", state.view);
  }
  if (state.query && state.query.trim()) {
    params.set("q", state.query);
  }
  if (state.type && state.type !== "all") {
    params.set("type", state.type);
  }
  // Omitted when it matches the view's own default, so the canonical URL of
  // each mode stays clean: `/replications` and `?view=effect` carry no sort.
  // A named direction survives a round trip through another view so toggling
  // back does not silently lose the reader's ordering.
  if (state.sort && state.sort !== defaultGalleryOrder(state.view ?? "artist")) {
    params.set("sort", state.sort);
  }
  if (state.year && state.year !== "all") params.set("year", state.year);
  if (state.viewing && state.viewing !== "all") params.set("viewing", state.viewing);
  if (state.artistType && state.artistType !== "all") params.set("artistType", state.artistType);
  if (state.effect && state.effect !== "all") params.set("effect", state.effect);
  if (state.drug && state.drug !== "all") params.set("drug", state.drug);
  if (state.drugClass && state.drugClass !== "all") params.set("drugClass", state.drugClass);
  if (state.family && state.family !== "all") params.set("family", state.family);
  const query = params.toString();
  return query ? `${REPLICATIONS_PATH}?${query}` : REPLICATIONS_PATH;
}

export function buildGalleryFocusUrl(
  focus: GalleryFocus,
  state: Partial<Pick<GalleryBrowseState, "type">> = {},
): string {
  if (focus.kind === "effect") {
    return getPublicRoutePath({
      family: "effect",
      params: { effectSlug: focus.key },
    });
  }

  const base = getPublicRoutePath({
    family: "replicationArtist",
    params: { key: focus.key },
  });
  const params = new URLSearchParams();
  if (state.type && state.type !== "all") {
    params.set("type", state.type);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

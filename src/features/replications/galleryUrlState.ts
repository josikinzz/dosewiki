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

export const GALLERY_BROWSE_DEFAULTS: GalleryBrowseState = {
  view: "artist",
  query: "",
  type: "all",
  sort: defaultGalleryOrder("artist"),
  year: "all",
  ...DEFAULT_GALLERY_TAXONOMY_FILTERS,
};

export interface GalleryFocus {
  kind: "artist" | "effect";
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
    sort:
      sort === "newest" || sort === "oldest" || sort === "alphabetical" || (sort === "curated" && view === "effect")
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

export function parseReplicationViewerSlug(params: ParamsLike): string | null {
  const slug = params.get(REPLICATION_VIEWER_PARAM);
  return slug && REPLICATION_SLUG_PATTERN.test(slug) ? slug : null;
}

function relativeUrl(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildReplicationViewerUrl(
  sourceUrl: string,
  slug: string,
): string {
  const url = new URL(sourceUrl, "https://dose.wiki");
  if (!REPLICATION_SLUG_PATTERN.test(slug)) return relativeUrl(url);
  url.searchParams.set(REPLICATION_VIEWER_PARAM, slug);
  return relativeUrl(url);
}

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

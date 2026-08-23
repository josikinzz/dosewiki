import {
  DEFAULT_GALLERY_ARTIST_SORT,
  type GalleryArtistSort,
  type GalleryMode,
  type GalleryTypeFilter,
} from "@/features/effects/gallery/galleryModel";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import { toAppPath } from "@/utils/previewPath";

/**
 * The gallery's URL contract: gallery browse/focus states own their URLs,
 * while an effect's article is the canonical source page for that collection.
 * Defaults are omitted so the canonical browse view is `/replications`.
 *
 *   /replications                       by-artist browse (default)
 *   /replications?view=effect          by-effect browse
 *   /replications?q=…&type=…&sort=…    search / media type / artist sort
 *   /replications/artist/<key>[?type=] one artist's works
 *   /effects/<slug>                    one effect's article collection
 *
 * Parsing is tolerant: junk parameter values read as the default rather than
 * producing an unrepresentable state.
 */

export const REPLICATIONS_PATH = "/replications";
export const REPLICATION_VIEWER_PARAM = "viewer";

const REPLICATION_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export interface GalleryBrowseState {
  view: GalleryMode;
  query: string;
  type: GalleryTypeFilter;
  sort: GalleryArtistSort;
}

export const GALLERY_BROWSE_DEFAULTS: GalleryBrowseState = {
  view: "artist",
  query: "",
  type: "all",
  sort: DEFAULT_GALLERY_ARTIST_SORT,
};

/** A focused gallery view: one artist's or one effect's works. */
export interface GalleryFocus {
  kind: GalleryMode;
  /** Artist URL key (see `artistUrlKey`) or effect slug. */
  key: string;
}

type ParamsLike = Pick<URLSearchParams, "get">;

export function parseGalleryBrowseState(
  params: ParamsLike,
): GalleryBrowseState {
  const type = params.get("type");
  const sort = params.get("sort");
  return {
    view: params.get("view") === "effect" ? "effect" : "artist",
    query: params.get("q") ?? "",
    type: type === "image" || type === "video" ? type : "all",
    sort:
      sort === "alpha" || sort === "count" ? sort : DEFAULT_GALLERY_ARTIST_SORT,
  };
}

/** Parse the active overlay work; invalid values fail closed. */
export function parseReplicationViewerSlug(params: ParamsLike): string | null {
  const slug = params.get(REPLICATION_VIEWER_PARAM);
  return slug && REPLICATION_SLUG_PATTERN.test(slug) ? slug : null;
}

function relativeUrl(url: URL): string {
  return `${toAppPath(url.pathname)}${url.search}${url.hash}`;
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
  if (state.view === "effect") {
    params.set("view", "effect");
  }
  if (state.query && state.query.trim()) {
    params.set("q", state.query);
  }
  if (state.type === "image" || state.type === "video") {
    params.set("type", state.type);
  }
  // `sort` only drives the by-artist grouping, but it survives in the URL
  // across a round trip through effect view so toggling back does not silently
  // lose the reader's ordering.
  if (state.sort === "alpha" || state.sort === "count") {
    params.set("sort", state.sort);
  }
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
  if (state.type === "image" || state.type === "video") {
    params.set("type", state.type);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

import type {
  GalleryArtistSort,
  GalleryMode,
  GalleryTypeFilter,
} from '@/features/effects/gallery/galleryModel';
import { getPublicRoutePath } from '@/utils/publicRouteIdentity';

/**
 * The gallery's URL contract (PRD T7 / prototype P4): focus is a path, filters
 * are query params, defaults are omitted so the canonical browse view is the
 * bare `/replications` path.
 *
 *   /replications                       by-artist browse (default)
 *   /replications?view=effect          by-effect browse
 *   /replications?q=…&type=…&sort=…    search / media type / artist sort
 *   /replications/artist/<key>[?type=] one artist's works
 *   /replications/effect/<slug>[?type=] one effect's works
 *
 * Parsing is tolerant: junk parameter values read as the default rather than
 * producing an unrepresentable state.
 */

export const REPLICATIONS_PATH = '/replications';

export interface GalleryBrowseState {
  view: GalleryMode;
  query: string;
  type: GalleryTypeFilter;
  sort: GalleryArtistSort;
}

export const GALLERY_BROWSE_DEFAULTS: GalleryBrowseState = {
  view: 'artist',
  query: '',
  type: 'all',
  sort: 'count',
};

/** A focused gallery view: one artist's or one effect's works. */
export interface GalleryFocus {
  kind: GalleryMode;
  /** Artist URL key (see `artistUrlKey`) or effect slug. */
  key: string;
}

type ParamsLike = Pick<URLSearchParams, 'get'>;

export function parseGalleryBrowseState(params: ParamsLike): GalleryBrowseState {
  const type = params.get('type');
  return {
    view: params.get('view') === 'effect' ? 'effect' : 'artist',
    query: params.get('q') ?? '',
    type: type === 'image' || type === 'video' ? type : 'all',
    sort: params.get('sort') === 'alpha' ? 'alpha' : 'count',
  };
}

export function buildGalleryBrowseUrl(state: Partial<GalleryBrowseState> = {}): string {
  const params = new URLSearchParams();
  if (state.view === 'effect') {
    params.set('view', 'effect');
  }
  if (state.query && state.query.trim()) {
    params.set('q', state.query);
  }
  if (state.type === 'image' || state.type === 'video') {
    params.set('type', state.type);
  }
  // `sort` only drives the by-artist grouping, but it survives in the URL
  // across a round trip through effect view so toggling back does not silently
  // lose the reader's ordering.
  if (state.sort === 'alpha') {
    params.set('sort', 'alpha');
  }
  const query = params.toString();
  return query ? `${REPLICATIONS_PATH}?${query}` : REPLICATIONS_PATH;
}

export function buildGalleryFocusUrl(
  focus: GalleryFocus,
  state: Partial<Pick<GalleryBrowseState, 'type'>> = {},
): string {
  const base =
    focus.kind === 'artist'
      ? getPublicRoutePath({ family: 'replicationArtist', params: { key: focus.key } })
      : getPublicRoutePath({ family: 'replicationEffect', params: { slug: focus.key } });
  const params = new URLSearchParams();
  if (state.type === 'image' || state.type === 'video') {
    params.set('type', state.type);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

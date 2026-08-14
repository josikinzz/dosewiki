import { describe, expect, it } from 'vitest';
import {
  buildGalleryBrowseUrl,
  buildGalleryFocusUrl,
  parseGalleryBrowseState,
  REPLICATIONS_PATH,
  type GalleryBrowseState,
} from './galleryUrlState';

/** Params of a built URL, the way useSearchParams would hand them back. */
function paramsOf(url: string): URLSearchParams {
  const [, query = ''] = url.split('?');
  return new URLSearchParams(query);
}

describe('parseGalleryBrowseState', () => {
  it('reads the bare path as the default state', () => {
    expect(parseGalleryBrowseState(new URLSearchParams())).toEqual({
      view: 'artist',
      query: '',
      type: 'all',
      sort: 'count',
    });
  });

  it('reads every recognized parameter', () => {
    expect(
      parseGalleryBrowseState(new URLSearchParams('view=effect&q=drifting&type=video&sort=alpha')),
    ).toEqual({ view: 'effect', query: 'drifting', type: 'video', sort: 'alpha' });
  });

  it('treats junk values as defaults instead of an unrepresentable state', () => {
    expect(
      parseGalleryBrowseState(new URLSearchParams('view=banana&type=hologram&sort=biggest')),
    ).toEqual({ view: 'artist', query: '', type: 'all', sort: 'count' });
  });
});

describe('buildGalleryBrowseUrl', () => {
  it('omits defaults so the canonical browse view is the bare path', () => {
    expect(buildGalleryBrowseUrl({})).toBe(REPLICATIONS_PATH);
    expect(
      buildGalleryBrowseUrl({ view: 'artist', query: '', type: 'all', sort: 'count' }),
    ).toBe(REPLICATIONS_PATH);
  });

  it('drops a whitespace-only query', () => {
    expect(buildGalleryBrowseUrl({ query: '   ' })).toBe(REPLICATIONS_PATH);
  });

  it('keeps the artist sort across a round trip through effect view', () => {
    const url = buildGalleryBrowseUrl({ view: 'effect', sort: 'alpha' });
    expect(paramsOf(url).get('sort')).toBe('alpha');
  });

  it('round-trips every non-default state through parse', () => {
    const states: GalleryBrowseState[] = [
      { view: 'effect', query: '', type: 'all', sort: 'count' },
      { view: 'artist', query: 'drifting', type: 'all', sort: 'alpha' },
      { view: 'artist', query: '', type: 'video', sort: 'count' },
      { view: 'effect', query: 'symmetry & light', type: 'image', sort: 'alpha' },
    ];
    for (const state of states) {
      expect(parseGalleryBrowseState(paramsOf(buildGalleryBrowseUrl(state)))).toEqual(state);
    }
  });
});

describe('buildGalleryFocusUrl', () => {
  it('addresses artist and effect groups as paths', () => {
    expect(buildGalleryFocusUrl({ kind: 'artist', key: 'chelsea-morgan' })).toBe(
      '/replications/artist/chelsea-morgan',
    );
    expect(buildGalleryFocusUrl({ kind: 'effect', key: 'symmetrical-texture-repetition' })).toBe(
      '/replications/effect/symmetrical-texture-repetition',
    );
  });

  it('carries only the media-type filter, and only when non-default', () => {
    expect(buildGalleryFocusUrl({ kind: 'artist', key: 'chelsea-morgan' }, { type: 'video' })).toBe(
      '/replications/artist/chelsea-morgan?type=video',
    );
    expect(buildGalleryFocusUrl({ kind: 'artist', key: 'chelsea-morgan' }, { type: 'all' })).toBe(
      '/replications/artist/chelsea-morgan',
    );
  });

  it('percent-encodes a hostile key rather than emitting a broken path', () => {
    expect(buildGalleryFocusUrl({ kind: 'artist', key: 'a/b?c' })).toBe(
      '/replications/artist/a%2Fb%3Fc',
    );
  });
});

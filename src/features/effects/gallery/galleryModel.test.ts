import { describe, expect, it } from 'vitest';
import type { GalleryReplication } from '@/types/replications';
import {
  artistIdentity,
  artistUrlKey,
  countGallery,
  galleryGroupUrlKey,
  groupByArtist,
  groupByEffect,
  matchesQuery,
  splitRailsAndPool,
  sortWithinGroup,
  UNATTRIBUTED_KEY,
  UNATTRIBUTED_LABEL,
  UNKNOWN_ARTIST_URL_KEY,
} from './galleryModel';

let seq = 0;
function rep(overrides: Partial<GalleryReplication> = {}): GalleryReplication {
  seq += 1;
  return {
    _id: `id-${seq}`,
    _creationTime: seq,
    slug: `slug-${seq}`,
    title: `Work ${seq}`,
    artist: 'Josie Kins',
    type: 'image',
    storage_id: `store-${seq}`,
    effect_slug: 'geometry',
    format: 'jpg',
    created_at: '2024-01-01T00:00:00.000Z',
    url: `https://cdn.test/${seq}.jpg`,
    ...overrides,
  };
}

const effectName = (slug: string) => ({ geometry: 'Geometry', drifting: 'Drifting' })[slug] ?? slug;
const effectHref = (slug: string) => `/effects/${slug}`;

describe('artistIdentity', () => {
  it('folds case and trims', () => {
    expect(artistIdentity('  Josie Kins ')).toEqual({ key: 'josie kins', label: 'Josie Kins' });
  });

  it('maps empty / unknown to the unattributed bucket', () => {
    expect(artistIdentity('')).toEqual({ key: UNATTRIBUTED_KEY, label: UNATTRIBUTED_LABEL });
    expect(artistIdentity('unknown')).toEqual({ key: UNATTRIBUTED_KEY, label: UNATTRIBUTED_LABEL });
    expect(artistIdentity(undefined)).toEqual({ key: UNATTRIBUTED_KEY, label: UNATTRIBUTED_LABEL });
  });
});

describe('groupByArtist', () => {
  it('orders by work count then sinks unattributed to the bottom', () => {
    const groups = groupByArtist([
      rep({ artist: 'Josie Kins' }),
      rep({ artist: 'Josie Kins' }),
      rep({ artist: 'Unity' }),
      rep({ artist: '' }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Josie Kins', 'Unity', UNATTRIBUTED_LABEL]);
    expect(groups[0].count).toBe(2);
  });

  it('sorts alphabetically when asked, unattributed still last', () => {
    const groups = groupByArtist(
      [rep({ artist: 'Zeta' }), rep({ artist: 'Alpha' }), rep({ artist: '' })],
      'alpha',
    );
    expect(groups.map((g) => g.label)).toEqual(['Alpha', 'Zeta', UNATTRIBUTED_LABEL]);
  });

  it('carries an artist portfolio url onto the group', () => {
    const [group] = groupByArtist([rep({ artist: 'Unity', artist_url: 'https://unity.test' })]);
    expect(group.externalUrl).toBe('https://unity.test');
  });

  const directory = [
    { key: 'KAYTWO', displayName: 'Kaytwo', aliases: ['kaylee'] },
    { key: 'SYMMETRICVISION', displayName: 'Symmetric Vision', aliases: ['symmetric vision'] },
  ];

  it("links an artist heading to their profile, not their own site", () => {
    const [group] = groupByArtist(
      [rep({ artist: 'Symmetric Vision', artist_url: 'https://sv.test' })],
      'count',
      directory,
    );

    // The internal href is what MediaRail prefers, so the name now goes to the
    // profile; the personal site survives as a separate affordance.
    expect(group.href).toBe('/contributors/symmetricvision');
    expect(group.externalUrl).toBe('https://sv.test');
  });

  it('resolves a credit spelling through the shared alias matcher', () => {
    const [group] = groupByArtist([rep({ artist: 'Kaylee' })], 'count', directory);
    expect(group.href).toBe('/contributors/kaytwo');
  });

  it('leaves an artist with no profile on their external link', () => {
    const [group] = groupByArtist(
      [rep({ artist: 'Nobody At All', artist_url: 'https://nobody.test' })],
      'count',
      directory,
    );

    expect(group.href).toBeUndefined();
    expect(group.externalUrl).toBe('https://nobody.test');
  });

  it('never links the unattributed bucket to a profile', () => {
    const [group] = groupByArtist([rep({ artist: 'Unknown' }), rep({ artist: '' })], 'count', [
      // Even a profile that took the bucket's own label as a display name must
      // not collect everything nobody signed.
      { key: 'IMPOSTOR', displayName: UNATTRIBUTED_LABEL, aliases: ['unknown'] },
    ]);

    expect(group.key).toBe(UNATTRIBUTED_KEY);
    expect(group.href).toBeUndefined();
  });

  it("leads an artist's section with the works they curated", () => {
    const first = rep({ artist: 'Kaytwo', slug: 'first', order_index: 1 });
    const second = rep({ artist: 'Kaytwo', slug: 'second', order_index: 2 });
    const third = rep({ artist: 'Kaytwo', slug: 'third', order_index: 3 });

    const [group] = groupByArtist([first, second, third], 'count', [
      { key: 'KAYTWO', displayName: 'Kaytwo', aliases: ['kaylee'], replicationOrder: ['third', 'first'] },
    ]);

    // Curated slugs in their curated order, then the default sort for the rest.
    expect(group.items.map((item) => item.slug)).toEqual(['third', 'first', 'second']);
  });

  it('ignores curated slugs the artist no longer has, and leaves an uncurated artist alone', () => {
    const curated = groupByArtist(
      [rep({ artist: 'Kaytwo', slug: 'a', order_index: 1 }), rep({ artist: 'Kaytwo', slug: 'b', order_index: 2 })],
      'count',
      [{ key: 'KAYTWO', displayName: 'Kaytwo', aliases: [], replicationOrder: ['gone', 'b'] }],
    );
    expect(curated[0].items.map((item) => item.slug)).toEqual(['b', 'a']);

    const uncurated = groupByArtist(
      [rep({ artist: 'Kaytwo', slug: 'a', order_index: 1 }), rep({ artist: 'Kaytwo', slug: 'b', order_index: 2 })],
      'count',
      [{ key: 'KAYTWO', displayName: 'Kaytwo', aliases: [] }],
    );
    expect(uncurated[0].items.map((item) => item.slug)).toEqual(['a', 'b']);
  });

  it('never lets a curation reorder the unattributed bucket', () => {
    const [group] = groupByArtist(
      [rep({ artist: 'Unknown', slug: 'x', order_index: 1 }), rep({ artist: '', slug: 'y', order_index: 2 })],
      'count',
      [{ key: 'IMPOSTOR', displayName: UNATTRIBUTED_LABEL, aliases: ['unknown'], replicationOrder: ['y'] }],
    );

    expect(group.items.map((item) => item.slug)).toEqual(['x', 'y']);
  });

  it('drops an artist_url that is not an absolute http(s) url', () => {
    // Production carries `"Josie"`, `"kaylee"` and `reddit.com/u/wheressuede` in
    // this field. As an href those resolve against the current page, so the
    // gallery has been shipping links to /effects/Josie.
    for (const artist_url of ['Josie', 'kaylee', 'reddit.com/u/wheressuede', 'javascript:alert(1)']) {
      const [group] = groupByArtist([rep({ artist: 'Nobody At All', artist_url })]);
      expect(group.externalUrl).toBeUndefined();
    }
  });
});

describe('groupByEffect', () => {
  it('labels and links groups by effect', () => {
    const groups = groupByEffect(
      [rep({ effect_slug: 'geometry' }), rep({ effect_slug: 'drifting' }), rep({ effect_slug: 'geometry' })],
      effectName,
      effectHref,
    );
    expect(groups[0]).toMatchObject({ key: 'geometry', label: 'Geometry', href: '/effects/geometry', count: 2 });
  });

  it('leaves out a row with no owning effect instead of crashing on it', () => {
    // `effect_slug` is optional. Reading `.replace` off the missing slug threw
    // here, taking the whole "By effect" toggle down for every reader.
    const groups = groupByEffect(
      [rep({ effect_slug: 'geometry' }), rep({ effect_slug: undefined })],
      effectName,
      effectHref,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'geometry', count: 1 });
    expect(groups.map((group) => group.href)).not.toContain('/effects/undefined');
  });
});

describe('sortWithinGroup', () => {
  it('prefers curated order_index, then newest created_at', () => {
    const items = [
      rep({ slug: 'a', order_index: undefined, created_at: '2024-01-01T00:00:00.000Z' }),
      rep({ slug: 'b', order_index: 0 }),
      rep({ slug: 'c', order_index: 1 }),
      rep({ slug: 'd', order_index: undefined, created_at: '2024-05-01T00:00:00.000Z' }),
    ];
    expect(sortWithinGroup(items).map((item) => item.slug)).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('matchesQuery', () => {
  it('matches across title, artist, and effect name', () => {
    const item = rep({ title: 'Lattice', artist: 'Unity', effect_slug: 'geometry' });
    expect(matchesQuery(item, 'lattice', effectName)).toBe(true);
    expect(matchesQuery(item, 'unity', effectName)).toBe(true);
    expect(matchesQuery(item, 'geometry', effectName)).toBe(true);
    expect(matchesQuery(item, 'drifting', effectName)).toBe(false);
    expect(matchesQuery(item, '', effectName)).toBe(true);
  });

  it('searches a row with no owning effect by its title and artist', () => {
    // The lookup used to be handed `undefined` and throw, so the gallery died on
    // the reader's first keystroke rather than on page load.
    const item = rep({ title: 'Lattice', artist: 'Unity', effect_slug: undefined });

    expect(() => matchesQuery(item, 'lattice', effectName)).not.toThrow();
    expect(matchesQuery(item, 'lattice', effectName)).toBe(true);
    expect(matchesQuery(item, 'unity', effectName)).toBe(true);
    expect(matchesQuery(item, 'geometry', effectName)).toBe(false);
  });
});

describe('splitRailsAndPool', () => {
  const groupsOf = (...counts: number[]) =>
    counts.map((count, index) => ({
      key: `group-${index}`,
      label: `Group ${index}`,
      count,
      imageCount: count,
      videoCount: 0,
      items: Array.from({ length: count }, () => rep()),
    }));

  it('rails groups with at least three works and pools the rest, preserving order', () => {
    const groups = groupsOf(5, 3, 2, 1);
    const { rails, pool } = splitRailsAndPool(groups);
    expect(rails.map((group) => group.count)).toEqual([5, 3]);
    expect(pool.map((group) => group.count)).toEqual([2, 1]);
  });

  it('handles the all-rails and all-pool extremes', () => {
    expect(splitRailsAndPool(groupsOf(4, 3)).pool).toEqual([]);
    expect(splitRailsAndPool(groupsOf(2, 1)).rails).toEqual([]);
    expect(splitRailsAndPool([])).toEqual({ rails: [], pool: [] });
  });

  it('honours a custom minimum rail size', () => {
    const groups = groupsOf(5, 3, 2);
    const { rails, pool } = splitRailsAndPool(groups, 5);
    expect(rails.map((group) => group.count)).toEqual([5]);
    expect(pool.map((group) => group.count)).toEqual([3, 2]);
  });
});

describe('countGallery', () => {
  it('counts distinct artists/effects and media split', () => {
    expect(
      countGallery([
        rep({ artist: 'A', effect_slug: 'geometry', type: 'image' }),
        rep({ artist: 'A', effect_slug: 'drifting', type: 'video' }),
        rep({ artist: 'B', effect_slug: 'geometry', type: 'image' }),
      ]),
    ).toEqual({ total: 3, artists: 2, effects: 2, images: 2, videos: 1 });
  });

  it('does not count a missing effect as an effect', () => {
    // The header prints this as "N effects", and `undefined` in the set claimed
    // one more effect than the gallery has anything to show for.
    expect(
      countGallery([
        rep({ artist: 'A', effect_slug: 'geometry', type: 'image' }),
        rep({ artist: 'A', effect_slug: undefined, type: 'image' }),
      ]),
    ).toEqual({ total: 2, artists: 1, effects: 1, images: 2, videos: 0 });
  });
});

describe('artistUrlKey', () => {
  it('slugifies a credit line deterministically, folding case and diacritics', () => {
    expect(artistUrlKey('Chelsea Morgan')).toBe('chelsea-morgan');
    expect(artistUrlKey('  chelsea   MORGAN ')).toBe('chelsea-morgan');
    expect(artistUrlKey('Éliás Tóth')).toBe('elias-toth');
  });

  it('maps the unattributed bucket to the stable `unknown` segment', () => {
    expect(artistUrlKey('')).toBe(UNKNOWN_ARTIST_URL_KEY);
    expect(artistUrlKey('unknown')).toBe(UNKNOWN_ARTIST_URL_KEY);
    expect(artistUrlKey(undefined)).toBe(UNKNOWN_ARTIST_URL_KEY);
  });

  it('gives a label with no slug a stable hashed unknown-<key> address', () => {
    const key = artistUrlKey('★彡');
    expect(key).toMatch(/^unknown-[a-z0-9]+$/);
    // Deterministic: the same credit line addresses the same page forever.
    expect(artistUrlKey('★彡')).toBe(key);
    // And distinct degenerate labels do not collapse onto one URL.
    expect(artistUrlKey('彡★')).not.toBe(key);
  });

  it('refuses to let a named artist capture the unattributed URL', () => {
    // "UnKnown!" is a real credit line (hasKnownCreator passes), but its slug
    // would be exactly `unknown` — the unattributed bucket's segment.
    const key = artistUrlKey('UnKnown!');
    expect(key).not.toBe(UNKNOWN_ARTIST_URL_KEY);
    expect(key).toMatch(/^unknown-[a-z0-9]+$/);
  });
});

describe('galleryGroupUrlKey', () => {
  it('addresses artist groups by slug and effect groups by their slug key', () => {
    const [artistGroup] = groupByArtist([rep({ artist: 'Chelsea Morgan' })]);
    expect(galleryGroupUrlKey('artist', artistGroup)).toBe('chelsea-morgan');

    const [effectGroup] = groupByEffect(
      [rep({ effect_slug: 'geometry' })],
      effectName,
      effectHref,
    );
    expect(galleryGroupUrlKey('effect', effectGroup)).toBe('geometry');
  });

  it('agrees with artistUrlKey for every group the grouping produces', () => {
    const groups = groupByArtist([
      rep({ artist: 'Josie Kins' }),
      rep({ artist: 'unknown' }),
      rep({ artist: '' }),
    ]);
    const keys = groups.map((group) => galleryGroupUrlKey('artist', group));
    expect(keys).toEqual(['josie-kins', UNKNOWN_ARTIST_URL_KEY]);
  });
});

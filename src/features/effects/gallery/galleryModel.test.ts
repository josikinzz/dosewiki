import { describe, expect, it } from 'vitest';
import type { GalleryReplication } from '@/types/replications';
import {
  artistIdentity,
  countGallery,
  groupByArtist,
  groupByEffect,
  matchesQuery,
  selectSpotlight,
  sortWithinGroup,
  UNATTRIBUTED_KEY,
  UNATTRIBUTED_LABEL,
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
});

describe('selectSpotlight', () => {
  it('falls back to attributed videos first when nothing is curated', () => {
    const image = rep({ artist: 'Josie Kins', type: 'image' });
    const video = rep({ artist: 'Josie Kins', type: 'video', thumbnail_url: 'https://cdn.test/v.jpg' });
    const orphan = rep({ artist: '', type: 'image' });
    const chosen = selectSpotlight([image, orphan, video], 2);
    expect(chosen[0].slug).toBe(video.slug);
    expect(chosen).toHaveLength(2);
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
});

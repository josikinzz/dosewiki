import { describe, expect, it } from 'vitest';
import type {
  GalleryReplication,
  ReplicationDateInfo,
  ReplicationDateKind,
} from '@/types/replications';
import {
  ARTIST_VIEW_WITHHELD_EFFECT_SLUGS,
  artistIdentity,
  artistUrlKey,
  countGallery,
  galleryGroupUrlKey,
  groupByArtist,
  groupByEffect,
  isWithheldFromArtistViews,
  matchesQuery,
  matchesTaxonomyFilters,
  splitRailsAndPool,
  sortWithinGroup,
  workDateMs,
  UNATTRIBUTED_KEY,
  UNATTRIBUTED_LABEL,
  UNKNOWN_ARTIST_URL_KEY,
} from './galleryModel';

let seq = 0;
function dateInfo(kind: ReplicationDateKind, value: string | null): ReplicationDateInfo {
  return {
    kind,
    value: value ?? undefined,
    event_type: 'work_created',
    confidence: 'high',
    researched_at: '2026-01-01T00:00:00Z',
  };
}

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
    expect(artistIdentity('Anonymous')).toEqual({ key: UNATTRIBUTED_KEY, label: UNATTRIBUTED_LABEL });
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

  it("links an artist heading to their Artist Page, not their own site", () => {
    const [group] = groupByArtist(
      [rep({ artist: 'Symmetric Vision', artist_url: 'https://sv.test' })],
      'count',
      directory,
    );

    // The internal href is what MediaRail prefers, so the name goes to the
    // artist's one public surface; the personal site survives as a separate
    // affordance.
    expect(group.href).toBe('/replications/artist/symmetric-vision');
    expect(group.externalUrl).toBe('https://sv.test');
  });

  it('keys the heading by the credit line itself, not the claiming profile', () => {
    // "Kaylee" resolves to the Kaytwo profile for curation, but the page is
    // generated from the credit: /contributors/kaytwo forwards to whichever
    // artist key holds the larger body of work (see mapArtistPageKeysByProfile).
    const [group] = groupByArtist([rep({ artist: 'Kaylee' })], 'count', directory);
    expect(group.href).toBe('/replications/artist/kaylee');
  });

  it('gives an artist with no profile the same generated Artist Page link', () => {
    const [group] = groupByArtist(
      [rep({ artist: 'Nobody At All', artist_url: 'https://nobody.test' })],
      'count',
      directory,
    );

    expect(group.href).toBe('/replications/artist/nobody-at-all');
    expect(group.externalUrl).toBe('https://nobody.test');
  });

  it('never links the unattributed bucket heading anywhere', () => {
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

  it('withholds the works of a withheld effect, and the artist left with none', () => {
    const groups = groupByArtist([
      rep({ artist: 'Josie Kins', effect_slug: 'geometry' }),
      rep({ artist: 'Josie Kins', effect_slug: 'unspeakable-horrors' }),
      rep({ artist: 'H. R. Giger', effect_slug: 'unspeakable-horrors' }),
    ]);

    // Giger holds nothing else, so he has no group at all — which is what
    // makes /replications/artist/h-r-giger a 404 rather than an empty page.
    expect(groups.map((group) => group.label)).toEqual(['Josie Kins']);
    expect(groups[0].count).toBe(1);
    expect(groups[0].items.map((item) => item.effect_slug)).toEqual(['geometry']);
  });

  describe('video-first default tier', () => {
    it('ranks any artist with a video above every image-only artist', () => {
      const groups = groupByArtist([
        rep({ artist: 'Prolific Painter' }),
        rep({ artist: 'Prolific Painter' }),
        rep({ artist: 'Prolific Painter' }),
        rep({ artist: 'Motion Maker', type: 'video', format: 'mp4' }),
      ]);
      expect(groups.map((g) => g.label)).toEqual(['Motion Maker', 'Prolific Painter']);
    });

    it('keeps the count-then-alpha order within each tier', () => {
      const groups = groupByArtist([
        // Video tier: Zed (two works, one a video) outranks Ann (one video).
        rep({ artist: 'Zed', type: 'video', format: 'mp4' }),
        rep({ artist: 'Zed' }),
        rep({ artist: 'Ann', type: 'video', format: 'mp4' }),
        // Image tier: equal counts fall back to the alphabetical tiebreak.
        rep({ artist: 'Yara' }),
        rep({ artist: 'Beth' }),
      ]);
      expect(groups.map((g) => g.label)).toEqual(['Zed', 'Ann', 'Beth', 'Yara']);
    });

    it('sinks unattributed last even when its bucket holds a video', () => {
      const groups = groupByArtist([
        rep({ artist: '', type: 'video', format: 'mp4' }),
        rep({ artist: 'Still Lifer' }),
      ]);
      expect(groups.map((g) => g.label)).toEqual(['Still Lifer', UNATTRIBUTED_LABEL]);
    });

    it('leaves the selectable sorts untiered', () => {
      const works = [
        rep({ artist: 'Zed', type: 'video', format: 'mp4' }),
        rep({ artist: 'Ann' }),
        rep({ artist: 'Ann' }),
      ];
      // Untiered count: Ann's two works beat Zed's video. Untiered alpha:
      // Ann leads; a tiered alpha would have hoisted Zed to the front.
      expect(groupByArtist(works, 'count').map((g) => g.label)).toEqual(['Ann', 'Zed']);
      expect(groupByArtist(works, 'alpha').map((g) => g.label)).toEqual(['Ann', 'Zed']);
    });
  });

  it('withholds from the unattributed bucket too', () => {
    const groups = groupByArtist([rep({ artist: '', effect_slug: 'unspeakable-horrors' })]);
    expect(groups).toEqual([]);
  });

  it('folds Anonymous works into the unattributed bucket, unlinked', () => {
    // "Anonymous" holds a marker contributor profile, but its works belong to
    // the Unattributed bucket: no section of its own, no profile link, and the
    // profile's curation cannot reorder the bucket.
    const groups = groupByArtist(
      [
        rep({ artist: 'Anonymous', slug: 'anon-work', order_index: 2 }),
        rep({ artist: 'unknown', slug: 'unknown-work', order_index: 1 }),
        rep({ artist: 'Josie Kins' }),
      ],
      'count',
      [{ key: 'ANONYMOUS', displayName: 'Anonymous', aliases: [], replicationOrder: ['anon-work'] }],
    );

    expect(groups.map((group) => group.label)).toEqual(['Josie Kins', UNATTRIBUTED_LABEL]);
    const bucket = groups[1];
    expect(bucket.key).toBe(UNATTRIBUTED_KEY);
    expect(bucket.href).toBeUndefined();
    expect(bucket.items.map((item) => item.slug)).toEqual(['unknown-work', 'anon-work']);
  });

  it('keeps the "Various artists" and "Midjourney" marker sections', () => {
    const groups = groupByArtist([
      rep({ artist: 'Various artists' }),
      rep({ artist: 'Midjourney' }),
      rep({ artist: 'Anonymous' }),
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      'Midjourney',
      'Various artists',
      UNATTRIBUTED_LABEL,
    ]);
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

  it('still groups a work that artist browsing withholds', () => {
    // The withholding is a browsing choice, not an unpublication: "By effect"
    // and the effect article collection keep every one of them.
    const groups = groupByEffect(
      [
        rep({ artist: 'H. R. Giger', effect_slug: 'unspeakable-horrors' }),
        rep({ artist: 'H. R. Giger', effect_slug: 'unspeakable-horrors' }),
      ],
      effectName,
      effectHref,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'unspeakable-horrors', count: 2 });
  });
});

describe('isWithheldFromArtistViews', () => {
  it('withholds exactly the listed effect slugs', () => {
    expect([...ARTIST_VIEW_WITHHELD_EFFECT_SLUGS]).toEqual(['unspeakable-horrors']);
    expect(isWithheldFromArtistViews(rep({ effect_slug: 'unspeakable-horrors' }))).toBe(true);
  });

  it('is exact about the slug and forgiving of a row with no effect', () => {
    for (const effect_slug of ['unspeakable-horror', 'horrors', 'Unspeakable-Horrors', 'geometry', undefined]) {
      expect(isWithheldFromArtistViews(rep({ effect_slug }))).toBe(false);
    }
  });

  it('ignores effect_tags: what one side withholds is what the other side carries', () => {
    const tagged = rep({ effect_slug: 'geometry', effect_tags: ['unspeakable-horrors'] });
    expect(isWithheldFromArtistViews(tagged)).toBe(false);
    expect(groupByArtist([tagged])).toHaveLength(1);
  });
});

describe('workDateMs', () => {
  it('parses an exact date', () => {
    const row = rep({ date_info: dateInfo('exact_date', '2014-09-23') });
    expect(workDateMs(row)).toBe(Date.parse('2014-09-23'));
  });

  it('parses a year-only value as Jan 1 of that year', () => {
    const row = rep({ date_info: dateInfo('year', '1981') });
    expect(workDateMs(row)).toBe(Date.UTC(1981, 0, 1));
  });

  it("extracts the date from an 'on or before' upper bound", () => {
    const row = rep({ date_info: dateInfo('upper_bound', 'on or before 2024-04-08T04:45:05Z') });
    expect(workDateMs(row)).toBe(Date.parse('2024-04-08'));
  });

  it("is null when kind is 'unknown', even with a value", () => {
    const row = rep({
      created_at: '2023-06-15T00:00:00.000Z',
      date_info: dateInfo('unknown', '2001-01-01'),
    });
    expect(workDateMs(row)).toBeNull();
  });

  it('is null when date_info is missing, null-valued, or dateless', () => {
    expect(workDateMs(rep({ date_info: undefined }))).toBeNull();
    expect(workDateMs(rep({ date_info: dateInfo('inferred', null) }))).toBeNull();
    expect(workDateMs(rep({ date_info: dateInfo('inferred', 'sometime long ago') }))).toBeNull();
  });
});

describe('sortWithinGroup', () => {
  it('prefers curated order_index within a media rank, then falls through the tiers', () => {
    const items = [
      rep({ slug: 'a', order_index: undefined, date_info: dateInfo('exact_date', '2024-01-01') }),
      rep({ slug: 'b', order_index: 0, format: 'gif' }),
      rep({ slug: 'c', order_index: 1, type: 'video', format: 'mp4' }),
      rep({ slug: 'd', order_index: undefined, date_info: dateInfo('exact_date', '2024-05-01') }),
    ];
    expect(sortWithinGroup(items).map((item) => item.slug)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('ranks sounded videos above silent motion above stills before any date comparison', () => {
    const items = [
      rep({ slug: 'gif', format: 'gif', date_info: dateInfo('exact_date', '2025-01-01') }),
      rep({ slug: 'still', format: 'webp', date_info: dateInfo('exact_date', '2015-01-01') }),
      rep({ slug: 'video', type: 'video', format: 'mp4', date_info: dateInfo('exact_date', '2005-01-01') }),
      // Oldest work of the lot, but the only one with a confirmed soundtrack.
      rep({ slug: 'sounded', type: 'video', format: 'mp4', has_audio: true, date_info: dateInfo('exact_date', '1995-01-01') }),
    ];
    expect(sortWithinGroup(items).map((item) => item.slug)).toEqual(['sounded', 'video', 'gif', 'still']);
  });

  it('sorts by researched work date, newest first, with undated rows sinking last', () => {
    const items = [
      // Ingested most recently, but the work itself is from 1981.
      rep({ slug: 'vintage', created_at: '2026-01-01T00:00:00.000Z', date_info: dateInfo('year', '1981') }),
      // No research: sinks below every dated work regardless of ingest date.
      rep({ slug: 'undated', created_at: '2026-06-01T00:00:00.000Z' }),
      rep({ slug: 'recent', created_at: '2019-01-01T00:00:00.000Z', date_info: dateInfo('exact_date', '2024-03-05') }),
    ];
    expect(sortWithinGroup(items).map((item) => item.slug)).toEqual(['recent', 'vintage', 'undated']);
  });

  it('orders undated rows among themselves by ingest date, newest first', () => {
    const items = [
      rep({ slug: 'older', created_at: '2020-01-01T00:00:00.000Z' }),
      rep({ slug: 'newer', created_at: '2024-01-01T00:00:00.000Z' }),
      rep({ slug: 'dated', created_at: '2019-01-01T00:00:00.000Z', date_info: dateInfo('exact_date', '2010-01-01') }),
    ];
    expect(sortWithinGroup(items).map((item) => item.slug)).toEqual(['dated', 'newer', 'older']);
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

describe('matchesTaxonomyFilters', () => {
  const all = {
    status: 'all' as const,
    viewing: 'all' as const,
    artistType: 'all' as const,
    drug: 'all' as const,
    drugClass: 'all' as const,
    family: 'all' as const,
  };

  it('keeps untagged rows visible under the default filters', () => {
    expect(matchesTaxonomyFilters(rep(), all)).toBe(true);
  });

  it('lets mixed viewing modes and mixed artists appear under either tag', () => {
    const item = rep({
      viewing_mode: 'mixed',
      viewing_mode_tags: ['open-eye', 'closed-eye'],
      artist_primary_type: 'mixed',
      artist_type_tags: ['replicator', 'traditional-psychedelic-artist'],
    });
    expect(matchesTaxonomyFilters(item, { ...all, viewing: 'open-eye' })).toBe(true);
    expect(matchesTaxonomyFilters(item, { ...all, viewing: 'closed-eye' })).toBe(true);
    expect(matchesTaxonomyFilters(item, { ...all, artistType: 'replicator' })).toBe(true);
    expect(matchesTaxonomyFilters(item, { ...all, artistType: 'traditional-psychedelic-artist' })).toBe(true);
  });

  it('matches drug arrays and exact content families while selected', () => {
    const item = rep({
      title_drugs: [{ slug: 'salvia', name: 'Salvia', class: 'other', matched_title_text: 'Salvia' }],
      drug_classes: ['dissociatives', 'other'],
      content_family: 'experiential-replication',
    });
    expect(matchesTaxonomyFilters(item, { ...all, drug: 'salvia' })).toBe(true);
    expect(matchesTaxonomyFilters(item, { ...all, drug: 'lsd' })).toBe(false);
    expect(matchesTaxonomyFilters(item, { ...all, drugClass: 'other' })).toBe(true);
    expect(matchesTaxonomyFilters(item, { ...all, drugClass: 'psychedelics' })).toBe(false);
    expect(matchesTaxonomyFilters(item, { ...all, family: 'experiential-replication' })).toBe(true);
    expect(matchesTaxonomyFilters(rep(), { ...all, viewing: 'open-eye' })).toBe(false);
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
    expect(artistUrlKey('Anonymous')).toBe(UNKNOWN_ARTIST_URL_KEY);
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

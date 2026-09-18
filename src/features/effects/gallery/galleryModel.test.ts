import { describe, expect, it } from 'vitest';
import type {
  GalleryReplication,
  ReplicationDateInfo,
  ReplicationDateKind,
} from '@/types/replications';
import {
  countGallery,
  groupByArtist,
  groupByEffect,
  groupByYear,
  splitRailsAndPool,
  UNDATED_YEAR_LABEL,
} from './galleryModel';
import {
  ARTIST_VIEW_WITHHELD_EFFECT_SLUGS,
  artistIdentity,
  artistUrlKey,
  galleryGroupUrlKey,
  isWithheldFromArtistViews,
  UNATTRIBUTED_KEY,
  UNKNOWN_ARTIST_URL_KEY,
} from './galleryArtistIdentity';
import {
  matchesQuery,
  matchesTaxonomyFilters,
  matchesYear,
  matchesType,
} from './galleryFilters';
import {
  sortWithinGroup,
  sortWorksByDate,
  workDateMs,
} from './galleryOrdering';
import type { GalleryTypeFilter } from './galleryTypes';
import { UNATTRIBUTED_LABEL } from '@/features/replications/replicationVocabulary';

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

/**
 * `order` is the row's position in its own effect's curated `gallery_order`,
 * written as the per-effect map the projection actually carries.
 */
function rep(
  overrides: Partial<GalleryReplication> & { order?: number } = {},
): GalleryReplication {
  seq += 1;
  const { order, ...rest } = overrides;
  const row: GalleryReplication = {
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
    ...rest,
  };
  return order === undefined || !row.effect_slug
    ? row
    : { ...row, effect_order_index: { [row.effect_slug]: order } };
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

  it('carries an artist portfolio url onto the group', () => {
    const [group] = groupByArtist([rep({ artist: 'Unity', artist_url: 'https://unity.test' })]);
    expect(group.externalUrl).toBe('https://unity.test');
  });

  const directory = [
    { key: 'KAYTWO', displayName: 'Kaytwo', aliases: ['kaylee'] },
    { key: 'SYMMETRICVISION', displayName: 'Symmetric Vision', aliases: ['symmetric vision'] },
  ];

  it("links an artist heading to their Artist Page, not their own site", () => {
    const [group] = groupByArtist([rep({ artist: 'Symmetric Vision', artist_url: 'https://sv.test' })], directory);

    // The internal href is what MediaRail prefers, so the name goes to the
    // artist's one public surface; the personal site survives as a separate
    // affordance.
    expect(group.href).toBe('/replications/artist/symmetric-vision');
    expect(group.externalUrl).toBe('https://sv.test');
  });

  it('heads a claimed credit line by the claiming profile, keeping the credit key for forwarding', () => {
    // "Kaylee" resolves to the Kaytwo profile, so the rail wears the profile's
    // display name and address; /replications/artist/kaylee still forwards
    // here through `creditKeys` (see resolveGalleryFocus).
    const [group] = groupByArtist([rep({ artist: 'Kaylee' })], directory);
    expect(group.label).toBe('Kaytwo');
    expect(group.href).toBe('/replications/artist/kaytwo');
    expect(group.creditKeys).toEqual(['kaylee']);
  });

  it('folds every credit line a profile claims into one group', () => {
    const groups = groupByArtist([
      rep({ artist: 'josikins', slug: 'a', artist_url: 'https://www.reddit.com/user/josikins/' }),
      rep({ artist: 'Josikins', slug: 'b' }),
      rep({ artist: 'Josie', slug: 'c' }),
      rep({ artist: 'Josie Kins', slug: 'd', artist_url: 'https://www.josiekins.xyz/' }),
      rep({ artist: 'Unity', slug: 'e' }),
    ], [{ key: 'JOSIE', displayName: 'Josie Kins', aliases: ['josie', 'josikinz', 'josikins'] }]);
    expect(groups.map((g) => [g.label, g.count])).toEqual([['Josie Kins', 4], ['Unity', 1]]);
    const [josie] = groups;
    expect(josie.href).toBe('/replications/artist/josie-kins');
    expect(josie.creditKeys).toEqual(['josikins', 'josie', 'josie-kins']);
    // The display-name credit's own portfolio link wins over a retired handle's.
    expect(josie.externalUrl).toBe('https://www.josiekins.xyz/');
    expect(josie.items.map((item) => item.slug).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves an unclaimed credit line keyed by itself', () => {
    const [group] = groupByArtist([rep({ artist: 'Nobody At All' })], directory);
    expect(group.creditKeys).toEqual(['nobody-at-all']);
  });

  it('gives an artist with no profile the same generated Artist Page link', () => {
    const [group] = groupByArtist([rep({ artist: 'Nobody At All', artist_url: 'https://nobody.test' })], directory);

    expect(group.href).toBe('/replications/artist/nobody-at-all');
    expect(group.externalUrl).toBe('https://nobody.test');
  });

  it('never links the unattributed bucket heading anywhere', () => {
    const [group] = groupByArtist([rep({ artist: 'Unknown' }), rep({ artist: '' })], [
      // Even a profile that took the bucket's own label as a display name must
      // not collect everything nobody signed.
      { key: 'IMPOSTOR', displayName: UNATTRIBUTED_LABEL, aliases: ['unknown'] },
    ]);

    expect(group.key).toBe(UNATTRIBUTED_KEY);
    expect(group.href).toBeUndefined();
  });

  it("orders an artist's section newest work first, above every other key", () => {
    // The date now outranks the audio-first media rank, the media tier, and
    // any stored `replicationOrder`. Before this an artist's rail read as a
    // media grouping: a 2020 sounded video always preceded a 2026 still.
    const works = [
      rep({
        artist: 'Kaytwo',
        slug: 'old-sounded-video',
        type: 'video',
        format: 'mp4',
        has_audio: true,
        date_info: dateInfo('exact_date', '2020-06-01'),
      }),
      rep({
        artist: 'Kaytwo',
        slug: 'newest-still',
        type: 'image',
        format: 'webp',
        date_info: dateInfo('year', '2026'),
      }),
      rep({
        artist: 'Kaytwo',
        slug: 'mid-gif',
        format: 'gif',
        date_info: dateInfo('exact_date', '2023-02-02'),
      }),
    ];

    const [group] = groupByArtist(works, [
      { key: 'KAYTWO', displayName: 'Kaytwo', aliases: ['kaylee'] },
    ]);

    expect(group.items.map((item) => item.slug)).toEqual([
      'newest-still',
      'mid-gif',
      'old-sounded-video',
    ]);
  });

  it('sinks an undated work below every dated one in an artist section', () => {
    const [group] = groupByArtist([
      rep({ artist: 'Kaytwo', slug: 'undated' }),
      rep({
        artist: 'Kaytwo',
        slug: 'ancient',
        date_info: dateInfo('year', '2011'),
      }),
    ]);

    expect(group.items.map((item) => item.slug)).toEqual(['ancient', 'undated']);
  });

  it('breaks a shared work date by ingest recency, not by title', () => {
    // Most of the corpus carries year-only dates, so the tiebreak decides most
    // adjacent pairs; alphabetical there would read as an arbitrary shuffle.
    const [group] = groupByArtist([
      rep({
        artist: 'Kaytwo',
        slug: 'a-ingested-first',
        title: 'A',
        created_at: '2024-01-01T00:00:00.000Z',
        date_info: dateInfo('year', '2022'),
      }),
      rep({
        artist: 'Kaytwo',
        slug: 'z-ingested-later',
        title: 'Z',
        created_at: '2025-01-01T00:00:00.000Z',
        date_info: dateInfo('year', '2022'),
      }),
    ]);

    expect(group.items.map((item) => item.slug)).toEqual([
      'z-ingested-later',
      'a-ingested-first',
    ]);
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

  // The rail order is no longer selectable: the reader's control chooses which
  // end of time the works inside a rail lead with, never which artist leads
  // the page, so these tiers are the only artist ordering there is.
  describe('fixed rail tiers', () => {
    it('ranks any artist with a video above every image-only artist', () => {
      const groups = groupByArtist([
        rep({ artist: 'Prolific Painter' }),
        rep({ artist: 'Prolific Painter' }),
        rep({ artist: 'Prolific Painter' }),
        rep({ artist: 'Motion Maker', type: 'video', format: 'mp4' }),
      ]);
      expect(groups.map((g) => g.label)).toEqual(['Motion Maker', 'Prolific Painter']);
    });

    it('keeps the count-then-label order within each tier', () => {
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

    it('lifts approved replicators above the video tier, in count order among themselves', () => {
      const works = [
        rep({ artist: 'Motion Maker', type: 'video', format: 'mp4' }),
        rep({ artist: 'Motion Maker', type: 'video', format: 'mp4' }),
        rep({ artist: 'Motion Maker', type: 'video', format: 'mp4' }),
        // Image-only, one work: last by every other rule.
        rep({ artist: 'Still Lifer' }),
        rep({ artist: 'Prolific Painter' }),
        rep({ artist: 'Prolific Painter' }),
      ];
      const directory = [
        { key: 'STILL-LIFER', displayName: 'Still Lifer', aliases: [], approvedReplicator: true },
        { key: 'PROLIFIC', displayName: 'Prolific Painter', aliases: [], approvedReplicator: true },
      ];

      const groups = groupByArtist(works, directory);
      expect(groups.map((g) => g.label)).toEqual([
        'Prolific Painter',
        'Still Lifer',
        'Motion Maker',
      ]);
      expect(groups.map((g) => g.approvedReplicator === true)).toEqual([true, true, false]);
    });

    it('resolves the endorsement through the alias-aware profile match', () => {
      const groups = groupByArtist([rep({ artist: 'wheressuede', type: 'video', format: 'mp4' }), rep({ artist: 'Zed', type: 'video', format: 'mp4' }), rep({ artist: 'Zed' })], [{ key: 'LOKA', displayName: 'Loka', aliases: ['wheressuede'], approvedReplicator: true }]);
      expect(groups.map((g) => g.label)).toEqual(['Loka', 'Zed']);
      expect(groups[0].approvedReplicator).toBe(true);
      expect(groups[1]).not.toHaveProperty('approvedReplicator');
    });

  });

  it('withholds from the unattributed bucket too', () => {
    const groups = groupByArtist([rep({ artist: '', effect_slug: 'unspeakable-horrors' })]);
    expect(groups).toEqual([]);
  });

  it('folds Anonymous works into the unattributed bucket, unlinked', () => {
    // "Anonymous" holds a marker profile, but its works belong in the
    // Unattributed bucket: no section of its own and no profile link.
    const groups = groupByArtist([
      rep({ artist: 'Anonymous', slug: 'anon-work' }),
      rep({ artist: 'unknown', slug: 'unknown-work' }),
      rep({ artist: 'Josie Kins' }),
    ], [{ key: 'ANONYMOUS', displayName: 'Anonymous', aliases: [] }]);

    expect(groups.map((group) => group.label)).toEqual(['Josie Kins', UNATTRIBUTED_LABEL]);
    const bucket = groups[1];
    expect(bucket.key).toBe(UNATTRIBUTED_KEY);
    expect(bucket.href).toBeUndefined();
    expect([...bucket.items.map((item) => item.slug)].sort()).toEqual([
      'anon-work',
      'unknown-work',
    ]);
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

  it("opens on the effect's curated pick even when it loses every automatic rank", () => {
    // Regression: the editor's stored `gallery_order` reaches this projection
    // as `effect_order_index`, and `sortWithinGroup` ranks it below the
    // media rank. So the browse rail opened on whichever uncurated video had
    // sound while the effect article opened on the curated still, and 37 of
    // the 49 curated effects disagreed with their own article.
    const groups = groupByEffect(
      [
        rep({ slug: 'loud-video', type: 'video', has_audio: true }),
        rep({ slug: 'silent-video', type: 'video', has_audio: false }),
        rep({ slug: 'curated-still', order: 0 }),
        rep({ slug: 'curated-runner-up', order: 1 }),
      ],
      effectName,
      effectHref,
    );

    expect(groups[0].items.map((item) => item.slug)).toEqual([
      'curated-still',
      'curated-runner-up',
      'loud-video',
      'silent-video',
    ]);
  });

  it('groups a work under every effect it depicts, not only the one it owns', () => {
    // Regression: the effect article's collection is `depictsEffect`, so a
    // tagged-in work is a member of that playlist and can be its curated
    // opener. Bucketing on the owning slug alone left 13 effects unable to
    // open on their own first pick, because the pick sat in another bucket.
    const groups = groupByEffect(
      [
        rep({
          slug: 'tagged-in',
          effect_slug: 'geometry',
          effect_tags: ['drifting'],
          effect_order_index: { geometry: 40, drifting: 0 },
        }),
        rep({ slug: 'owned-by-drifting', effect_slug: 'drifting', order: 1 }),
      ],
      effectName,
      effectHref,
    );

    const drifting = groups.find((group) => group.key === 'drifting');
    // Ranked by drifting's own curated position, not by geometry's 40.
    expect(drifting?.items.map((item) => item.slug)).toEqual([
      'tagged-in',
      'owned-by-drifting',
    ]);
    expect(groups.find((group) => group.key === 'geometry')?.count).toBe(1);
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

describe('sortWorksByDate', () => {
  const rows = [
    rep({ slug: 'mid', date_info: dateInfo('exact_date', '2019-06-01') }),
    rep({ slug: 'newest', date_info: dateInfo('exact_date', '2026-01-01') }),
    rep({ slug: 'undated', date_info: undefined }),
    rep({ slug: 'oldest', date_info: dateInfo('exact_date', '2011-01-01') }),
  ];

  it('reads the timeline in either direction', () => {
    expect(sortWorksByDate(rows, 'newest').map((r) => r.slug)).toEqual([
      'newest',
      'mid',
      'oldest',
      'undated',
    ]);
    expect(sortWorksByDate(rows, 'oldest').map((r) => r.slug)).toEqual([
      'oldest',
      'mid',
      'newest',
      'undated',
    ]);
  });

  it('sinks undated rows last in both directions', () => {
    // An absent date is not a claim of being old, so "Oldest" must not open
    // on unknown work.
    for (const direction of ['newest', 'oldest'] as const) {
      const ordered = sortWorksByDate(rows, direction);
      expect(ordered[ordered.length - 1].slug).toBe('undated');
    }
  });

  it('follows the direction through the ingest tiebreak on equal dates', () => {
    // Most of the corpus carries year-only dates, so this tiebreak decides
    // most adjacent pairs; keeping it newest-first under "Oldest" would flip
    // era order inside every year.
    const sameYear = [
      rep({ slug: 'ingested-first', date_info: dateInfo('year', '2020'), created_at: '2021-01-01T00:00:00.000Z' }),
      rep({ slug: 'ingested-later', date_info: dateInfo('year', '2020'), created_at: '2024-01-01T00:00:00.000Z' }),
    ];
    expect(sortWorksByDate(sameYear, 'newest').map((r) => r.slug)).toEqual(['ingested-later', 'ingested-first']);
    expect(sortWorksByDate(sameYear, 'oldest').map((r) => r.slug)).toEqual(['ingested-first', 'ingested-later']);
  });
});

describe('groupByEffect ordering', () => {
  const rows = [
    rep({ slug: 'curated-still', order: 0, date_info: dateInfo('exact_date', '2015-01-01') }),
    rep({ slug: 'loud-video', type: 'video', format: 'mp4', has_audio: true, date_info: dateInfo('exact_date', '2020-01-01') }),
    rep({ slug: 'recent-still', date_info: dateInfo('exact_date', '2026-01-01') }),
  ];
  const name = (slug: string) => slug;
  const href = (slug: string) => `/effects/${slug}`;

  it('opens on the editor’s curated pick by default', () => {
    const [group] = groupByEffect(rows, name, href);
    expect(group.items[0].slug).toBe('curated-still');
  });

  it('retires the curated prefix while a direction is named', () => {
    // A reader asking for the oldest work has asked past the editor's pick; a
    // prefix that survived would leave the front of the rail out of
    // chronological order while claiming to be sorted by date.
    expect(groupByEffect(rows, name, href, 'newest').map(() => 0)).toHaveLength(1);
    expect(groupByEffect(rows, name, href, 'newest')[0].items.map((i) => i.slug)).toEqual([
      'recent-still',
      'loud-video',
      'curated-still',
    ]);
    expect(groupByEffect(rows, name, href, 'oldest')[0].items.map((i) => i.slug)).toEqual([
      'curated-still',
      'loud-video',
      'recent-still',
    ]);
  });
});

describe('groupByYear', () => {
  const dated = (slug: string, value: string) =>
    rep({ slug, date_info: dateInfo(value.length === 4 ? 'year' : 'exact_date', value) });
  // Three works per recent year clears MIN_RAIL_SIZE; the thin tail does not.
  const corpus = [
    ...['2026-01-01', '2026-02-01', '2026-03-01'].map((d, i) => dated(`new-${i}`, d)),
    ...['2025-01-01', '2025-02-01', '2025-03-01'].map((d, i) => dated(`mid-${i}`, d)),
    dated('thin-2003', '2003'),
    dated('thin-2001', '2001'),
    dated('thin-2000', '2000'),
    rep({ slug: 'no-date', date_info: undefined }),
  ];

  it('gives every dense year its own rail, newest first', () => {
    const groups = groupByYear(corpus);
    expect(groups.slice(0, 2).map((g) => g.label)).toEqual(['2026', '2025']);
  });

  it('reverses the years under oldest, keeping undated last', () => {
    const oldestFirst = groupByYear(corpus, 'oldest').map((g) => g.label);
    const newestFirst = groupByYear(corpus, 'newest').map((g) => g.label);
    expect(oldestFirst[0]).not.toBe('2026');
    expect(newestFirst[0]).toBe('2026');
    expect(oldestFirst[oldestFirst.length - 1]).toBe(UNDATED_YEAR_LABEL);
    expect(newestFirst[newestFirst.length - 1]).toBe(UNDATED_YEAR_LABEL);
  });

  it('buckets the thin tail by decade and labels the span it holds', () => {
    // A fixed cutoff would rot as the archive's deep tail grows, so the
    // per-year run ends at the first year too thin to fill a rail.
    const labels = groupByYear(corpus).map((g) => g.label);
    expect(labels).toContain('2000\u20132003');
    expect(labels).not.toContain('2003');
  });

  it('merges a decade too thin to stand into the next one up', () => {
    // Otherwise the oldest works in the archive drop into the pooled tail and
    // lose their date entirely.
    const groups = groupByYear([
      ...['2026-01-01', '2026-02-01', '2026-03-01'].map((d, i) => dated(`new-${i}`, d)),
      dated('lone-1952', '1952'),
      dated('lone-1949', '1949'),
      dated('lone-1939', '1939'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['2026', '1939\u20131952']);
    expect(groups[1].count).toBe(3);
  });

  it('keys each rail so its own year filter reproduces it exactly', () => {
    for (const group of groupByYear(corpus)) {
      const narrowed = corpus.filter((row) => matchesYear(row, group.key));
      expect(narrowed.map((row) => row.slug).sort()).toEqual(
        group.items.map((row) => row.slug).sort(),
      );
    }
  });
});

describe('sortWithinGroup', () => {
  it('prefers the curated position within a media rank, then falls through the tiers', () => {
    const items = [
      rep({ slug: 'a', date_info: dateInfo('exact_date', '2024-01-01') }),
      rep({ slug: 'b', order: 0, format: 'gif' }),
      rep({ slug: 'c', order: 1, type: 'video', format: 'mp4' }),
      rep({ slug: 'd', date_info: dateInfo('exact_date', '2024-05-01') }),
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
    viewing: 'all' as const,
    artistType: 'all' as const,
    effect: 'all' as const,
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

  it('matches a depicted effect by owning slug or effect tag', () => {
    const item = rep({ effect_slug: 'geometry', effect_tags: ['drifting'] });
    expect(matchesTaxonomyFilters(item, { ...all, effect: 'geometry' })).toBe(true);
    expect(matchesTaxonomyFilters(item, { ...all, effect: 'drifting' })).toBe(true);
    expect(matchesTaxonomyFilters(item, { ...all, effect: 'tracers' })).toBe(false);
    expect(matchesTaxonomyFilters(rep({ effect_slug: undefined }), { ...all, effect: 'drifting' })).toBe(false);
  });
});

describe('matchesType', () => {
  it('filters each stored media kind, audio included', () => {
    const image = rep({ type: 'image' });
    const video = rep({ type: 'video', format: 'mp4' });
    const audio = rep({ type: 'audio', format: 'ogg' });
    const corpus = [image, video, audio];
    const kept = (filter: GalleryTypeFilter) =>
      corpus.filter((row) => matchesType(row, filter)).map((row) => row.type);
    expect(kept('all')).toEqual(['image', 'video', 'audio']);
    expect(kept('image')).toEqual(['image']);
    expect(kept('video')).toEqual(['video']);
    expect(kept('audio')).toEqual(['audio']);
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
      audioCount: 0,
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

import { describe, expect, it } from 'vitest';
import type { GalleryReplication } from '@/types/replications';
import { groupByArtist, groupByEffect } from './galleryModel';
import {
  ARTIST_VIEW_WITHHELD_EFFECT_SLUGS,
  isWithheldFromArtistViews,
} from './galleryArtistIdentity';

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

describe('groupByArtist', () => {
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

    // Giger holds nothing else, so he has no group at all, which is what
    // makes /replications/artist/h-r-giger a 404 rather than an empty page.
    expect(groups.map((group) => group.label)).toEqual(['Josie Kins']);
    expect(groups[0].count).toBe(1);
    expect(groups[0].items.map((item) => item.effect_slug)).toEqual(['geometry']);
  });

  it('withholds from the unattributed bucket too', () => {
    const groups = groupByArtist([rep({ artist: '', effect_slug: 'unspeakable-horrors' })]);
    expect(groups).toEqual([]);
  });
});

describe('groupByEffect', () => {
  it('still groups a work that artist browsing withholds', () => {
    // The withholding is a browsing choice, not an unpublication: "By effect"
    // and the effect article collection keep every one of them.
    const groups = groupByEffect(
      [
        rep({ artist: 'H. R. Giger', effect_slug: 'unspeakable-horrors' }),
        rep({ artist: 'H. R. Giger', effect_slug: 'unspeakable-horrors' }),
      ],
      (slug) => slug,
      (slug) => `/effects/${slug}`,
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

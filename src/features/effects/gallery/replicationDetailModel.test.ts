import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import {
  orderContributorReplications,
  orderContributorWorksFeaturedFirst,
  orderEffectReplications,
} from './replicationDetailModel';

const base: ReplicationWithUrl = {
  _id: 'id-0',
  _creationTime: 0,
  slug: 'slug-0',
  title: 'Title',
  artist: 'Chelsea Morgan',
  type: 'image',
  storage_id: 'storage-0',
  effect_slug: 'tracers',
  format: 'webp',
  created_at: '2024-01-01T00:00:00.000Z',
  url: 'https://cdn.test/0.webp',
};

const make = (overrides: Partial<ReplicationWithUrl>): ReplicationWithUrl => ({
  ...base,
  ...overrides,
});

describe('orderEffectReplications', () => {
  it('follows curated gallery_order and appends the uncurated remainder', () => {
    const items = [
      make({ slug: 'c', title: 'C' }),
      make({ slug: 'a', title: 'A' }),
      make({ slug: 'b', title: 'B' }),
      make({ slug: 'z', title: 'Z' }),
    ];

    const ordered = orderEffectReplications(items, ['b', 'a']);

    expect(ordered.map((item) => item.slug)).toEqual(['b', 'a', 'c', 'z']);
  });

  it('treats gallery_order as an exact prefix across media ranks', () => {
    const items = [
      make({ slug: 'sounded', type: 'video', format: 'mp4', has_audio: true }),
      make({ slug: 'still', type: 'image', format: 'webp' }),
      make({ slug: 'motion', type: 'video', format: 'mp4', has_audio: false }),
    ];

    expect(orderEffectReplications(items, ['still', 'motion']).map((item) => item.slug)).toEqual([
      'still',
      'motion',
      'sounded',
    ]);
  });

  it('drops rows with no resolved asset so the walk never reaches a dead page', () => {
    const items = [
      make({ slug: 'a' }),
      make({ slug: 'broken', url: '' as unknown as string }),
      make({ slug: 'b' }),
    ];

    expect(orderEffectReplications(items, ['a', 'broken', 'b']).map((i) => i.slug)).toEqual([
      'a',
      'b',
    ]);
  });

  it('falls back to the shared newest-first ordering without curation', () => {
    const items = [
      make({ slug: 'old', created_at: '2023-01-01T00:00:00.000Z' }),
      make({ slug: 'new', created_at: '2025-01-01T00:00:00.000Z' }),
    ];

    expect(orderEffectReplications(items).map((item) => item.slug)).toEqual(['new', 'old']);
  });
});

describe('orderContributorReplications', () => {
  it('ignores any single effect curation and sorts the whole body of work newest first', () => {
    const works = [
      make({ slug: 'old', effect_slug: 'tracers', created_at: '2023-01-01T00:00:00.000Z' }),
      make({ slug: 'new', effect_slug: 'geometry', created_at: '2025-01-01T00:00:00.000Z' }),
    ];

    expect(orderContributorReplications(works).map((work) => work.slug)).toEqual(['new', 'old']);
  });

  it("leads with the contributor's own curation, newest-first for the rest", () => {
    const works = [
      make({ slug: 'old', created_at: '2023-01-01T00:00:00.000Z' }),
      make({ slug: 'mid', created_at: '2024-01-01T00:00:00.000Z' }),
      make({ slug: 'new', created_at: '2025-01-01T00:00:00.000Z' }),
    ];

    expect(orderContributorReplications(works, ['old', 'gone']).map((work) => work.slug)).toEqual([
      'old',
      'new',
      'mid',
    ]);
  });

  it('treats replicationOrder as an exact prefix across media ranks', () => {
    const works = [
      make({ slug: 'sounded', type: 'video', format: 'mp4', has_audio: true }),
      make({ slug: 'still', type: 'image', format: 'webp' }),
    ];

    expect(orderContributorReplications(works, ['still']).map((work) => work.slug)).toEqual([
      'still',
      'sounded',
    ]);
  });
});

describe('orderContributorWorksFeaturedFirst', () => {
  const works = ['a', 'b', 'c', 'd', 'e'].map((slug) => ({ slug }));

  it('leads with the curated works and keeps every group in its arrival order', () => {
    expect(
      orderContributorWorksFeaturedFirst(works, ['d', 'b']).map((work) => work.slug),
      // 'b' before 'd' even though the curated list names 'd' first: the config
      // is a membership list, not a ranking, so the rail's own order still
      // decides what comes first within each group.
    ).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('is a no-op for the common case of a contributor with nothing curated', () => {
    // Only 36 works are curated across the whole corpus, so most contributors
    // must come through this untouched rather than gratuitously reshuffled.
    expect(orderContributorWorksFeaturedFirst(works, ['not-theirs']).map((work) => work.slug)).toEqual(
      ['a', 'b', 'c', 'd', 'e'],
    );
    expect(orderContributorWorksFeaturedFirst(works, []).map((work) => work.slug)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('changes nothing when every work is curated', () => {
    // Jumproper holds two works and both are featured; an all-featured set has
    // no front to float anything to.
    expect(
      orderContributorWorksFeaturedFirst(works, ['a', 'b', 'c', 'd', 'e']).map((work) => work.slug),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('does not mutate the set it was given', () => {
    const input = [...works];
    orderContributorWorksFeaturedFirst(input, ['e']);
    expect(input.map((work) => work.slug)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('composes with the newest-first contributor order', () => {
    const ordered = orderContributorReplications([
      make({ slug: 'old', created_at: '2023-01-01T00:00:00.000Z' }),
      make({ slug: 'featured-old', created_at: '2022-01-01T00:00:00.000Z' }),
      make({ slug: 'new', created_at: '2025-01-01T00:00:00.000Z' }),
    ]);

    expect(
      orderContributorWorksFeaturedFirst(ordered, ['featured-old']).map((work) => work.slug),
    ).toEqual(['featured-old', 'new', 'old']);
  });
});

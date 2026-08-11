import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import {
  orderContributorReplications,
  orderEffectReplications,
  selectReplicationNeighbors,
  selectReplicationNeighborSet,
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

describe('selectReplicationNeighbors', () => {
  const ordered = [make({ slug: 'a' }), make({ slug: 'b' }), make({ slug: 'c' })];

  it('reports both neighbours and a 1-based position', () => {
    const result = selectReplicationNeighbors(ordered, 'b');

    expect(result.previous?.slug).toBe('a');
    expect(result.next?.slug).toBe('c');
    expect(result.position).toBe(2);
    expect(result.total).toBe(3);
  });

  it('does not wrap around at either end', () => {
    expect(selectReplicationNeighbors(ordered, 'a').previous).toBeNull();
    expect(selectReplicationNeighbors(ordered, 'c').next).toBeNull();
  });

  it('returns an empty walk when the item is not in the set', () => {
    const result = selectReplicationNeighbors(ordered, 'missing');

    expect(result).toEqual({ previous: null, next: null, position: 0, total: 3 });
  });

  it('prefers the thumbnail but falls back to the asset itself', () => {
    const withThumb = [make({ slug: 'a' }), make({ slug: 'b', thumbnail_url: 'https://cdn.test/t.jpg' })];

    expect(selectReplicationNeighbors(withThumb, 'a').next?.thumbnailUrl).toBe(
      'https://cdn.test/t.jpg',
    );
    expect(selectReplicationNeighbors(withThumb, 'b').previous?.thumbnailUrl).toBe(
      'https://cdn.test/0.webp',
    );
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
});

describe('selectReplicationNeighborSet', () => {
  const artistWorks = [
    make({ slug: 'artist-a', created_at: '2025-03-01T00:00:00.000Z' }),
    make({ slug: 'shared', created_at: '2025-02-01T00:00:00.000Z' }),
    make({ slug: 'artist-b', created_at: '2025-01-01T00:00:00.000Z' }),
  ];
  const effectWorks = [
    make({ slug: 'effect-a', artist: 'Someone Else' }),
    make({ slug: 'shared' }),
    make({ slug: 'effect-b', artist: 'Someone Else' }),
  ];

  it("walks the artist's other works when the credit resolves to a contributor", () => {
    const result = selectReplicationNeighborSet({
      slug: 'shared',
      artistWorks,
      artistName: 'Chelsea Morgan',
      effectWorks,
      effectName: 'Tracers',
      galleryOrder: ['effect-a', 'shared', 'effect-b'],
    });

    expect(result.scope).toBe('artist');
    expect(result.scopeLabel).toBe('Chelsea Morgan');
    expect(result.previous?.slug).toBe('artist-a');
    expect(result.next?.slug).toBe('artist-b');
    // The counter has to count the set it is actually walking.
    expect(result.position).toBe(2);
    expect(result.total).toBe(3);
  });

  it('falls back to the effect walk when the work is unattributed', () => {
    const result = selectReplicationNeighborSet({
      slug: 'shared',
      // An unattributed marker resolves to no profile, so no works arrive.
      artistWorks: [],
      artistName: null,
      effectWorks,
      effectName: 'Tracers',
      galleryOrder: ['effect-a', 'shared', 'effect-b'],
    });

    expect(result.scope).toBe('effect');
    expect(result.scopeLabel).toBe('Tracers');
    expect(result.previous?.slug).toBe('effect-a');
    expect(result.next?.slug).toBe('effect-b');
    expect(result.total).toBe(3);
  });

  it('keeps the effect walk when the artist has no other work to offer', () => {
    const result = selectReplicationNeighborSet({
      slug: 'shared',
      artistWorks: [make({ slug: 'shared' })],
      artistName: 'Chelsea Morgan',
      effectWorks,
      effectName: 'Tracers',
    });

    // A lone piece would otherwise replace a usable walk with a dead one.
    expect(result.scope).toBe('effect');
    expect(result.total).toBe(3);
  });

  it('keeps the effect walk when the artist set does not contain this work', () => {
    const result = selectReplicationNeighborSet({
      slug: 'shared',
      artistWorks: [make({ slug: 'artist-a' }), make({ slug: 'artist-b' })],
      artistName: 'Chelsea Morgan',
      effectWorks,
      effectName: 'Tracers',
    });

    expect(result.scope).toBe('effect');
    expect(result.position).toBe(2);
  });

  it('reports no named set when neither the artist nor the effect names one', () => {
    const result = selectReplicationNeighborSet({
      slug: 'shared',
      artistWorks: [],
      artistName: null,
      effectWorks,
      effectName: null,
    });

    expect(result.scope).toBe('effect');
    expect(result.scopeLabel).toBeNull();
  });
});

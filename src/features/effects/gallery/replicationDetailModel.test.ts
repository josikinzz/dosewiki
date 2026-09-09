import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import {
  orderContributorReplications,
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

  it('puts the newest work first even when an older one is a sounded video', () => {
    // Media rank used to lead this sort, so an artist's rail read as a media
    // grouping. The date now outranks it outright.
    const works = [
      make({
        slug: 'old-sounded',
        type: 'video',
        format: 'mp4',
        has_audio: true,
        created_at: '2020-01-01T00:00:00.000Z',
      }),
      make({
        slug: 'new-still',
        type: 'image',
        format: 'webp',
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    ];

    expect(orderContributorReplications(works).map((work) => work.slug)).toEqual([
      'new-still',
      'old-sounded',
    ]);
  });

  it('drops rows it cannot render', () => {
    const works = [make({ slug: 'shown' }), { ...make({ slug: 'broken' }), url: '' }];

    expect(orderContributorReplications(works).map((work) => work.slug)).toEqual(['shown']);
  });
});

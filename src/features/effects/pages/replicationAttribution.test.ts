import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import { buildAttributionLine } from './replicationAttribution';

const base: ReplicationWithUrl = {
  _id: 'id-0',
  _creationTime: 0,
  slug: 'tree-bark-chelsea-morgan',
  title: 'Tree Bark',
  artist: 'Chelsea Morgan',
  type: 'image',
  storage_id: 'storage-0',
  effect_slug: 'colour-enhancement',
  format: 'jpg',
  created_at: '2024-01-01T00:00:00.000Z',
  url: 'https://cdn.test/tree-bark.jpg',
};

const make = (overrides: Partial<ReplicationWithUrl> = {}): ReplicationWithUrl => ({
  ...base,
  ...overrides,
});

describe('buildAttributionLine', () => {
  it('pairs the credit with the licence and its URL', () => {
    expect(
      buildAttributionLine(
        make({
          license_name: 'CC BY-SA 4.0',
          license_url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en',
        }),
      ),
    ).toBe(
      'Tree Bark by Chelsea Morgan, licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.en).',
    );
  });

  it('names the licence alone when no URL is recorded', () => {
    expect(buildAttributionLine(make({ license_name: 'CC BY 4.0' }))).toBe(
      'Tree Bark by Chelsea Morgan, licensed under CC BY 4.0.',
    );
  });

  it('is absent when no licence grants reuse', () => {
    // The licence row on the rendering surface is the rights posture's one
    // home; the copyable line only exists when there is a licence to satisfy.
    expect(buildAttributionLine(make())).toBeNull();
  });

  it('falls back to the rightsholder when the artist is unknown', () => {
    expect(
      buildAttributionLine(
        make({ license_name: 'CC BY 4.0', artist: 'Unknown', rightsholder: 'Chelsea Morgan' }),
      ),
    ).toContain('Tree Bark by Chelsea Morgan');
  });

  it('marks the work as unattributed when nobody is recorded', () => {
    expect(
      buildAttributionLine(make({ license_name: 'CC BY 4.0', artist: 'Unknown', rightsholder: undefined })),
    ).toContain('Tree Bark (creator unknown)');
  });
});

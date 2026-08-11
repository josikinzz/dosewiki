import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import { getExternalSourceUrl } from './replicationCredit';

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
  url: 'https://assets.test/tree-bark.jpg',
};

const make = (overrides: Partial<ReplicationWithUrl> = {}): ReplicationWithUrl => ({
  ...base,
  ...overrides,
});

describe('getExternalSourceUrl', () => {
  it('keeps a source that points somewhere genuinely else', () => {
    expect(
      getExternalSourceUrl(make({ source_url: 'https://www.reddit.com/r/replications/abc' })),
    ).toBe('https://www.reddit.com/r/replications/abc');
  });

  it('drops a source that is the asset URL itself', () => {
    expect(getExternalSourceUrl(make({ source_url: base.url }))).toBeNull();
  });

  it('drops a source that merely re-points at the asset host', () => {
    expect(
      getExternalSourceUrl(make({ source_url: 'https://assets.test/some-other-name.jpg' })),
    ).toBeNull();
  });

  it('drops a source that re-points at the thumbnail host', () => {
    expect(
      getExternalSourceUrl(
        make({
          thumbnail_url: 'https://thumbs.test/tree-bark.jpg',
          source_url: 'https://thumbs.test/tree-bark.jpg',
        }),
      ),
    ).toBeNull();
  });

  it('returns null for absent, blank, or unparseable values', () => {
    expect(getExternalSourceUrl(make())).toBeNull();
    expect(getExternalSourceUrl(make({ source_url: '   ' }))).toBeNull();
    expect(getExternalSourceUrl(make({ source_url: 'not a url' }))).toBeNull();
  });
});

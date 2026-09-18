import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import {
  getCaptionCredit,
  getCreatorByline,
  getExternalSourceUrl,
  hasKnownCreator,
} from './replicationCredit';

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

describe('hasKnownCreator', () => {
  it('accepts a real credit line', () => {
    expect(hasKnownCreator('Chelsea Morgan')).toBe(true);
  });

  it('rejects blank and "Unknown" credits', () => {
    expect(hasKnownCreator(undefined)).toBe(false);
    expect(hasKnownCreator('   ')).toBe(false);
    expect(hasKnownCreator(' UNKNOWN ')).toBe(false);
  });

  it('folds the Reddit-intake "Unknown Artist" marker into no-creator', () => {
    // Missing/deleted Reddit posters retain exactly this credit line
    // (server/lib/replicationAttribution.ts); it must never rank as a named
    // artist on gallery surfaces.
    expect(hasKnownCreator('Unknown Artist')).toBe(false);
    expect(hasKnownCreator(' unknown artist ')).toBe(false);
  });

  it('folds the "Anonymous" marker into no-creator, in any casing', () => {
    // The Anonymous marker profile's works belong to the Unattributed bucket
    // (T-1); the word must never surface as a creator on replication pages.
    expect(hasKnownCreator('Anonymous')).toBe(false);
    expect(hasKnownCreator(' anonymous ')).toBe(false);
  });

  it('keeps the other marker credits as known creators', () => {
    expect(hasKnownCreator('Various artists')).toBe(true);
    expect(hasKnownCreator('Midjourney')).toBe(true);
  });
});

describe('creator lines for folded markers', () => {
  it('bylines an Anonymous work as creator unknown', () => {
    expect(getCreatorByline(make({ artist: 'Anonymous' }))).toBe('Creator unknown');
    expect(getCaptionCredit(make({ artist: 'Anonymous' }))).toBe('Creator unknown.');
  });
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

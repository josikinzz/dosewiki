import { describe, expect, it } from 'vitest';
import type { GalleryReplication } from '@/types/replications';
import { UNATTRIBUTED_LABEL } from '@/features/effects/gallery/galleryModel';
import { resolveGalleryFocus } from './galleryFocus';

let seq = 0;
function rep(overrides: Partial<GalleryReplication> = {}): GalleryReplication {
  seq += 1;
  return {
    _id: `id-${seq}`,
    _creationTime: seq,
    slug: `slug-${seq}`,
    title: `Work ${seq}`,
    artist: 'Chelsea Morgan',
    type: 'image',
    storage_id: `store-${seq}`,
    effect_slug: 'geometry',
    format: 'jpg',
    created_at: '2024-01-01T00:00:00.000Z',
    url: `https://cdn.test/${seq}.jpg`,
    ...overrides,
  };
}

const corpus = [
  rep({ artist: 'Chelsea Morgan' }),
  rep({ artist: 'chelsea morgan', effect_slug: 'drifting' }),
  rep({ artist: '' }),
  rep({ artist: 'unknown' }),
  rep({ artist: 'Solo', url: undefined }),
];

const context = {
  effects: [
    { slug: 'geometry', name: 'Geometry' },
    { slug: 'drifting', name: 'Drifting' },
  ],
  contributorDirectory: [
    { key: 'chelseamorgan', displayName: 'Chelsea Morgan', aliases: [] },
  ],
};

describe('resolveGalleryFocus', () => {
  it('resolves a known artist key to their group, profile link included', () => {
    const focus = resolveGalleryFocus({ kind: 'artist', key: 'chelsea-morgan' }, corpus, context);

    expect(focus?.label).toBe('Chelsea Morgan');
    expect(focus?.group.count).toBe(2);
    expect(focus?.group.href).toBe('/contributors/chelseamorgan');
  });

  it('resolves the unattributed bucket at the stable `unknown` key', () => {
    const focus = resolveGalleryFocus({ kind: 'artist', key: 'unknown' }, corpus, context);

    expect(focus?.label).toBe(UNATTRIBUTED_LABEL);
    // The empty credit and the literal "unknown" marker fold together.
    expect(focus?.group.count).toBe(2);
    expect(focus?.group.href).toBeUndefined();
  });

  it('resolves an effect slug to its group, article link included', () => {
    const focus = resolveGalleryFocus({ kind: 'effect', key: 'drifting' }, corpus, context);

    expect(focus?.label).toBe('Drifting');
    expect(focus?.group.count).toBe(1);
    expect(focus?.group.href).toBe('/effects/drifting');
  });

  it('returns null for a bogus key, in either kind', () => {
    expect(resolveGalleryFocus({ kind: 'artist', key: 'nobody-here' }, corpus, context)).toBeNull();
    expect(resolveGalleryFocus({ kind: 'effect', key: 'not-an-effect' }, corpus, context)).toBeNull();
  });

  it('does not resolve a key whose only works are undisplayable', () => {
    // "Solo" exists in the corpus but carries no resolved asset, so the
    // gallery never shows the group and the URL space must not include it.
    expect(resolveGalleryFocus({ kind: 'artist', key: 'solo' }, corpus, context)).toBeNull();
  });
});

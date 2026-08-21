import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import {
  describeViewerSet,
  findViewerIndex,
  selectReplicationViewerSet,
  type ReplicationViewerItem,
  type ReplicationViewerSet,
} from './viewerModel';

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

// A transparent mapper: the selection policy under test decides *which*
// replications appear in what order, so the item fields the loader would
// hydrate (effect names, profile links) stay inert here.
const toItem = (replication: ReplicationWithUrl): ReplicationViewerItem => ({
  replication,
  effectName: null,
  effectSlug: null,
  effectCategories: [],
  artistProfileHref: null,
});

const slugsOf = (set: ReplicationViewerSet) =>
  set.items.map((item) => item.replication.slug);

describe('selectReplicationViewerSet', () => {
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
    const result = selectReplicationViewerSet({
      slug: 'shared',
      artistWorks,
      artistName: 'Chelsea Morgan',
      effectWorks,
      effectName: 'Tracers',
      galleryOrder: ['effect-a', 'shared', 'effect-b'],
      toItem,
    });

    expect(result.scope).toBe('artist');
    expect(result.scopeLabel).toBe('Chelsea Morgan');
    // The whole ordered walk crosses into the viewer, active item included; the
    // client finds itself by slug rather than receiving a prev/next pair.
    expect(slugsOf(result)).toEqual(['artist-a', 'shared', 'artist-b']);
    expect(findViewerIndex(result, 'shared')).toBe(1);
  });

  it("walks the artist's curated order, so the filmstrip matches the profile rail", () => {
    // The rail applies the same list to the same set, so a walk entered at a
    // pinned work moves through the pinned works in the order the rail shows.
    const result = selectReplicationViewerSet({
      slug: 'shared',
      artistWorks,
      artistName: 'Chelsea Morgan',
      artistOrder: ['artist-b', 'shared', 'artist-a'],
      effectWorks,
      effectName: 'Tracers',
      toItem,
    });

    expect(result.scope).toBe('artist');
    expect(slugsOf(result)).toEqual(['artist-b', 'shared', 'artist-a']);
  });

  it('falls back to the effect walk when the work is unattributed', () => {
    const result = selectReplicationViewerSet({
      slug: 'shared',
      // An unattributed marker resolves to no profile, so no works arrive.
      artistWorks: [],
      artistName: null,
      effectWorks,
      effectName: 'Tracers',
      galleryOrder: ['effect-a', 'shared', 'effect-b'],
      toItem,
    });

    expect(result.scope).toBe('effect');
    expect(result.scopeLabel).toBe('Tracers');
    expect(slugsOf(result)).toEqual(['effect-a', 'shared', 'effect-b']);
  });

  it('keeps the effect walk when the artist has no other work to offer', () => {
    const result = selectReplicationViewerSet({
      slug: 'shared',
      artistWorks: [make({ slug: 'shared' })],
      artistName: 'Chelsea Morgan',
      effectWorks,
      effectName: 'Tracers',
      toItem,
    });

    // A lone piece would otherwise replace a usable walk with a dead one.
    expect(result.scope).toBe('effect');
    expect(result.items).toHaveLength(3);
  });

  it('keeps the effect walk when the artist set does not contain this work', () => {
    const result = selectReplicationViewerSet({
      slug: 'shared',
      artistWorks: [make({ slug: 'artist-a' }), make({ slug: 'artist-b' })],
      artistName: 'Chelsea Morgan',
      effectWorks,
      effectName: 'Tracers',
      toItem,
    });

    expect(result.scope).toBe('effect');
    expect(findViewerIndex(result, 'shared')).toBe(1);
  });

  it('reports no named set when neither the artist nor the effect names one', () => {
    const result = selectReplicationViewerSet({
      slug: 'shared',
      artistWorks: [],
      artistName: null,
      effectWorks,
      effectName: null,
      toItem,
    });

    expect(result.scope).toBe('effect');
    expect(result.scopeLabel).toBeNull();
  });

  it('still returns the fallback walk when the active slug is in neither set', () => {
    // A publishable row whose effect gallery no longer lists it (curation drift)
    // still gets a set to render; the viewer treats index -1 as "show the walk
    // without a highlighted position" rather than as a broken page.
    const result = selectReplicationViewerSet({
      slug: 'absent',
      artistWorks,
      artistName: 'Chelsea Morgan',
      effectWorks,
      effectName: 'Tracers',
      toItem,
    });

    expect(result.scope).toBe('effect');
    expect(result.items).toHaveLength(3);
    expect(findViewerIndex(result, 'absent')).toBe(-1);
  });
});

describe('describeViewerSet', () => {
  const withItems = (
    scope: ReplicationViewerSet['scope'],
    scopeLabel: string | null,
  ): ReplicationViewerSet => ({ scope, scopeLabel, items: [] });

  it('names the set that was actually chosen', () => {
    // "More by Chelsea Morgan" and "More replications of Tracers" are different
    // claims about where the reader is, so the label follows the chosen scope
    // rather than whichever subject happens to be on the page.
    expect(describeViewerSet(withItems('artist', 'Chelsea Morgan'))).toBe(
      'More by Chelsea Morgan',
    );
    expect(describeViewerSet(withItems('effect', 'Tracers'))).toBe(
      'More replications of Tracers',
    );
    expect(describeViewerSet(withItems('substance', 'LSD'))).toBe(
      'More replications of LSD',
    );
  });

  it('falls back to a generic label when the set names no subject', () => {
    expect(describeViewerSet(withItems('effect', null))).toBe('More replications');
  });
});

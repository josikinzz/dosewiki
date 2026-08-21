import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import {
  FALLBACK_IMAGE_RATIO,
  FALLBACK_VIDEO_RATIO,
  FILL_SCALE_LIMIT,
  buildViewerPath,
  computeFillScale,
  computeStageScale,
  parseViewerSetParam,
  resolveFitMode,
  resolveMediaAspect,
  viewerDocumentTitle,
} from './viewerLogic';
import type { ReplicationViewerItem } from './viewerModel';

describe('computeFillScale', () => {
  it('leaves matching aspects alone', () => {
    expect(computeFillScale(16 / 9, 16 / 9)).toBe(1);
  });

  it('scales a mild mismatch by exactly the ratio of the aspects', () => {
    // 16:9 media on a 16:10 stage: covering needs (16/9) / (16/10) = 10/9.
    expect(computeFillScale(16 / 9, 16 / 10)).toBeCloseTo(10 / 9, 10);
  });

  it('covers symmetrically regardless of which side is wider', () => {
    // A portrait work on a landscape stage needs the same zoom as the
    // mirror-image case — the crop math cannot depend on orientation.
    expect(computeFillScale(9 / 16, 16 / 9)).toBeCloseTo(computeFillScale(16 / 9, 9 / 16), 10);
  });

  it('clamps landscape media on a portrait stage to the crop ceiling', () => {
    // Truly covering would need ~3.2x, which throws away most of the frame.
    expect(computeFillScale(16 / 9, 9 / 16)).toBe(FILL_SCALE_LIMIT);
  });

  it('honours a caller-supplied ceiling', () => {
    expect(computeFillScale(16 / 9, 9 / 16, 2)).toBe(2);
  });

  it('never crops on a degenerate aspect', () => {
    // Unloaded metadata or a zero-sized stage must not zoom on a guess.
    expect(computeFillScale(0, 16 / 9)).toBe(1);
    expect(computeFillScale(16 / 9, 0)).toBe(1);
    expect(computeFillScale(Number.NaN, 16 / 9)).toBe(1);
    expect(computeFillScale(16 / 9, Number.POSITIVE_INFINITY)).toBe(1);
    expect(computeFillScale(-1, 16 / 9)).toBe(1);
  });
});

describe('computeStageScale', () => {
  it('crops landscape media exactly like the raw cover math', () => {
    // 16:9 media on a 16:10 stage: covering needs (16/9) / (16/10) = 10/9.
    expect(computeStageScale(16 / 9, 16 / 10)).toBeCloseTo(10 / 9, 10);
  });

  it('clamps landscape media on a portrait stage to the crop ceiling', () => {
    expect(computeStageScale(16 / 9, 9 / 16)).toBe(FILL_SCALE_LIMIT);
  });

  it('never crops portrait media, whatever the stage', () => {
    expect(computeStageScale(9 / 16, 16 / 9)).toBe(1);
    expect(computeStageScale(3 / 4, 1)).toBe(1);
  });

  it('never crops square media', () => {
    expect(computeStageScale(1, 16 / 9)).toBe(1);
    expect(computeStageScale(1, 9 / 16)).toBe(1);
  });

  it('leaves a landscape work alone on a wider stage only up to the ceiling', () => {
    // 4:3 media on an ultrawide stage: covering needs (21/9) / (4/3) = 1.75,
    // past the ceiling — the bounded crop stops at the cap.
    expect(computeStageScale(4 / 3, 21 / 9)).toBe(FILL_SCALE_LIMIT);
  });

  it('honours a caller-supplied ceiling', () => {
    expect(computeStageScale(16 / 9, 9 / 16, 2)).toBe(2);
  });

  it('never crops on a degenerate aspect', () => {
    expect(computeStageScale(Number.NaN, 16 / 9)).toBe(1);
    expect(computeStageScale(0, 16 / 9)).toBe(1);
    expect(computeStageScale(16 / 9, 0)).toBe(1);
    expect(computeStageScale(16 / 9, Number.NaN)).toBe(1);
  });
});

describe('resolveMediaAspect', () => {
  it('prefers a probed ratio over catalogued dimensions', () => {
    expect(resolveMediaAspect('video', 1600, 900, 4 / 3)).toBeCloseTo(4 / 3, 10);
  });

  it('falls back to catalogued dimensions when nothing was probed', () => {
    expect(resolveMediaAspect('image', 1200, 1600, undefined)).toBeCloseTo(3 / 4, 10);
  });

  it('guesses by type when the row carries no dimensions', () => {
    expect(resolveMediaAspect('video', undefined, undefined, undefined)).toBe(
      FALLBACK_VIDEO_RATIO,
    );
    expect(resolveMediaAspect('image', null, null, undefined)).toBe(FALLBACK_IMAGE_RATIO);
  });

  it('ignores junk probes and junk dimensions', () => {
    expect(resolveMediaAspect('image', 1600, 900, Number.NaN)).toBeCloseTo(16 / 9, 10);
    expect(resolveMediaAspect('image', 1600, 900, 0)).toBeCloseTo(16 / 9, 10);
    expect(resolveMediaAspect('video', 0, 900, undefined)).toBe(FALLBACK_VIDEO_RATIO);
  });
});

describe('parseViewerSetParam', () => {
  it('parses each scope the grammar knows', () => {
    expect(parseViewerSetParam('?set=effect:tracers')).toEqual({
      kind: 'effect',
      slug: 'tracers',
    });
    expect(parseViewerSetParam('?set=substance:lsd')).toEqual({
      kind: 'substance',
      slug: 'lsd',
    });
    expect(parseViewerSetParam('?set=artist:chelsea-morgan')).toEqual({
      kind: 'artist',
      slug: 'chelsea-morgan',
    });
  });

  it("parses the Unattributed bucket's artist keys", () => {
    expect(parseViewerSetParam('?set=artist:unknown')).toEqual({
      kind: 'artist',
      slug: 'unknown',
    });
    expect(parseViewerSetParam('?set=artist:unknown-1a2b3c')).toEqual({
      kind: 'artist',
      slug: 'unknown-1a2b3c',
    });
  });

  it('parses multi-segment slugs and ignores unrelated params', () => {
    expect(parseViewerSetParam('?foo=bar&set=substance:4-ho-met')).toEqual({
      kind: 'substance',
      slug: '4-ho-met',
    });
  });

  it('accepts a URL-encoded colon, which browsers may normalise either way', () => {
    expect(parseViewerSetParam('?set=substance%3Alsd')).toEqual({
      kind: 'substance',
      slug: 'lsd',
    });
  });

  it('returns null when the param is absent', () => {
    expect(parseViewerSetParam('')).toBeNull();
    expect(parseViewerSetParam('?foo=bar')).toBeNull();
  });

  it('rejects unknown scope kinds', () => {
    expect(parseViewerSetParam('?set=playlist:favourites')).toBeNull();
  });

  it('rejects values outside the slug charset — they feed a fetch path', () => {
    expect(parseViewerSetParam('?set=substance:')).toBeNull();
    expect(parseViewerSetParam('?set=substance:../../etc')).toBeNull();
    expect(parseViewerSetParam('?set=substance:LSD')).toBeNull();
    expect(parseViewerSetParam('?set=substance:lsd?x=1')).toBeNull();
    expect(parseViewerSetParam('?set=substance:-lsd')).toBeNull();
    expect(parseViewerSetParam('?set=artist:Chelsea Morgan')).toBeNull();
  });
});

describe('buildViewerPath', () => {
  it('builds the canonical permalink when no scope is live', () => {
    expect(buildViewerPath('tracers-chelsea-morgan', null)).toBe(
      '/replications/tracers-chelsea-morgan',
    );
  });

  it('carries the scope param so a copied URL reproduces the walk', () => {
    expect(buildViewerPath('tracers-chelsea-morgan', { kind: 'effect', slug: 'tracers' })).toBe(
      '/replications/tracers-chelsea-morgan?set=effect:tracers',
    );
    expect(buildViewerPath('tracers-chelsea-morgan', { kind: 'substance', slug: 'lsd' })).toBe(
      '/replications/tracers-chelsea-morgan?set=substance:lsd',
    );
    expect(buildViewerPath('tracers-chelsea-morgan', { kind: 'artist', slug: 'chelsea-morgan' })).toBe(
      '/replications/tracers-chelsea-morgan?set=artist:chelsea-morgan',
    );
  });

  it('round-trips every scope kind through the parser', () => {
    for (const param of [
      { kind: 'effect' as const, slug: 'tracers' },
      { kind: 'substance' as const, slug: '4-ho-met' },
      { kind: 'artist' as const, slug: 'unknown' },
    ]) {
      const path = buildViewerPath('slug', param);
      expect(parseViewerSetParam(path.slice(path.indexOf('?')))).toEqual(param);
    }
  });
});

describe('resolveFitMode', () => {
  it('defaults videos to fill and images to fit', () => {
    expect(resolveFitMode('video', null)).toBe('fill');
    expect(resolveFitMode('image', null)).toBe('fit');
  });

  it("honours the reader's stored choice over the per-type default", () => {
    expect(resolveFitMode('video', 'fit')).toBe('fit');
    expect(resolveFitMode('image', 'fill')).toBe('fill');
  });

  it('ignores unparseable stored values', () => {
    expect(resolveFitMode('video', 'sideways')).toBe('fill');
  });
});

describe('viewerDocumentTitle', () => {
  const replication = {
    title: 'Tracers',
    artist: 'Chelsea Morgan',
  } as ReplicationWithUrl;

  const item = (overrides: Partial<ReplicationWithUrl>): ReplicationViewerItem => ({
    replication: { ...replication, ...overrides } as ReplicationWithUrl,
    effectName: null,
    effectSlug: null,
    effectCategories: [],
    artistProfileHref: null,
    avatarUrl: null,
  });

  it('matches the server metadata title for a credited work', () => {
    expect(viewerDocumentTitle(item({}))).toBe('Tracers by Chelsea Morgan');
  });

  it('drops the byline for unattributed works, like the server does', () => {
    expect(viewerDocumentTitle(item({ artist: 'Unknown' }))).toBe('Tracers');
  });
});

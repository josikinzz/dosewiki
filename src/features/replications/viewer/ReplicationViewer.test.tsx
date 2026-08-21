import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import {
  FILL_SCALE_LIMIT,
  buildViewerPath,
  computeFillScale,
  parseViewerSetParam,
  resolveFitMode,
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

describe('parseViewerSetParam', () => {
  it('parses a substance scope', () => {
    expect(parseViewerSetParam('?set=substance:lsd')).toEqual({
      kind: 'substance',
      slug: 'lsd',
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
    expect(parseViewerSetParam('?set=artist:chelsea-morgan')).toBeNull();
  });

  it('rejects values outside the slug charset — they feed a fetch path', () => {
    expect(parseViewerSetParam('?set=substance:')).toBeNull();
    expect(parseViewerSetParam('?set=substance:../../etc')).toBeNull();
    expect(parseViewerSetParam('?set=substance:LSD')).toBeNull();
    expect(parseViewerSetParam('?set=substance:lsd?x=1')).toBeNull();
    expect(parseViewerSetParam('?set=substance:-lsd')).toBeNull();
  });
});

describe('buildViewerPath', () => {
  it('builds the canonical permalink when no scope is live', () => {
    expect(buildViewerPath('tracers-chelsea-morgan', null)).toBe(
      '/replications/tracers-chelsea-morgan',
    );
  });

  it('carries the scope param so a copied URL reproduces the walk', () => {
    expect(buildViewerPath('tracers-chelsea-morgan', { kind: 'substance', slug: 'lsd' })).toBe(
      '/replications/tracers-chelsea-morgan?set=substance:lsd',
    );
  });

  it('round-trips through the parser', () => {
    const param = { kind: 'substance' as const, slug: '4-ho-met' };
    const path = buildViewerPath('slug', param);
    expect(parseViewerSetParam(path.slice(path.indexOf('?')))).toEqual(param);
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
  });

  it('matches the server metadata title for a credited work', () => {
    expect(viewerDocumentTitle(item({}))).toBe('Tracers by Chelsea Morgan');
  });

  it('drops the byline for unattributed works, like the server does', () => {
    expect(viewerDocumentTitle(item({ artist: 'Unknown' }))).toBe('Tracers');
  });
});

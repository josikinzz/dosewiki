import { describe, expect, it } from 'vitest';

import {
  AVBL,
  bondSegment,
  buildStereoProbe,
  depict,
  distance,
  hashesAcrossBond,
  offsetFromAxis,
  polygonPoints,
} from './depiction_probe.js';

// DoseWiki fork delta: both wedge kinds flare to 70% of the upstream width
// (LOCAL_MODIFICATIONS.md, "Bold bonds"). AbstractDepictor.drawWedge widens a
// solid wedge by cFactorWedgeFlarePerSide = 0.70 / 9 per side (upstream 1 / 9),
// and the hashed wedge grows each hash by cFactorHashWedgeSlope = 0.70 / 128
// per side per step (upstream 1 / 128).

const UPSTREAM_SOLID_HALF_WIDTH = AVBL / 9;
const FORK_SOLID_HALF_WIDTH = (0.7 * AVBL) / 9;
// The hashed wedge draws 8 hashes at i = 2, 4, ..., 16 of 17 steps; the last
// one is the widest: half-width = 16 * AVBL * slope.
const UPSTREAM_LAST_HASH_LENGTH = 2 * ((16 * AVBL) / 128);
const FORK_LAST_HASH_LENGTH = 2 * ((16 * AVBL * 0.7) / 128);

describe('solid wedge flare', () => {
  it('widens to 0.7 / 9 of the bond length per side at the broad end', () => {
    const { molecule, up } = buildStereoProbe();
    const id = 'solid';

    const svg = depict(molecule, id);

    const axis = bondSegment(svg, id, up);
    expect(distance(axis.from, axis.to)).toBeCloseTo(AVBL, 5);
    const points = polygonPoints(svg);
    expect(points.length).toBeGreaterThan(0);
    const halfWidth = Math.max(
      ...points.map((point) => Math.abs(offsetFromAxis(axis, point))),
    );
    // Polygon coordinates are emitted as integers, so allow rounding.
    expect(Math.abs(halfWidth - FORK_SOLID_HALF_WIDTH)).toBeLessThan(1);
    expect(halfWidth).toBeLessThan(UPSTREAM_SOLID_HALF_WIDTH - 5);
  });
});

describe('hashed wedge flare', () => {
  it('grows each hash by 0.7 / 128 of the bond length per side per step', () => {
    const { molecule, down } = buildStereoProbe();
    const id = 'hashed';

    const svg = depict(molecule, id);

    const hashes = hashesAcrossBond(svg, id, down);
    expect(hashes).toHaveLength(8);
    const lengths = hashes
      .map((hash) => distance(hash.from, hash.to))
      .toSorted((left, right) => left - right);
    expect(lengths.at(-1)).toBeCloseTo(FORK_LAST_HASH_LENGTH, 1);
    expect(lengths.at(-1)).toBeLessThan(UPSTREAM_LAST_HASH_LENGTH - 5);
    // Every hash keeps the same slope: length grows linearly with its step.
    const perStep = FORK_LAST_HASH_LENGTH / 16;
    lengths.forEach((length, index) => {
      expect(length).toBeCloseTo(perStep * 2 * (index + 1), 1);
    });
  });
});

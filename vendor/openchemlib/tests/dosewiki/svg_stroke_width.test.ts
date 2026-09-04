import { describe, expect, it } from 'vitest';

import { Molecule } from '#lib';

import { strokesAlongBond, strokeWidths } from './depiction_probe.js';

// DoseWiki fork delta: the toSVG strokeWidth option re-bases only the standard
// line width (lib/extend/extend_to_svg.js). Upstream rewrites every
// stroke-width attribute to the requested value, which would flatten bold
// bonds and the invisible hit targets onto the same width.

describe('toSVG strokeWidth re-basing', () => {
  const id = 'rebase';

  function render(strokeWidth?: number) {
    const molecule = Molecule.fromSmiles('CCCC');
    molecule.setBondBold(1, true);
    return molecule.toSVG(
      400,
      300,
      id,
      strokeWidth === undefined ? undefined : { strokeWidth },
    );
  }

  it('rewrites only strokes drawn at the standard width', () => {
    const reference = render();
    const [standardBefore] = strokesAlongBond(reference, id, 0);
    const [boldBefore] = strokesAlongBond(reference, id, 1);
    const target = standardBefore.strokeWidth * 5;

    const svg = render(target);

    const [standard] = strokesAlongBond(svg, id, 0);
    const [other] = strokesAlongBond(svg, id, 2);
    const [bold] = strokesAlongBond(svg, id, 1);
    expect(standard.strokeWidth).toBe(target);
    expect(other.strokeWidth).toBe(target);
    expect(bold.strokeWidth).toBe(boldBefore.strokeWidth);
    expect(bold.strokeWidth).not.toBe(target);
  });

  it('leaves the invisible hit targets untouched', () => {
    const reference = render();
    const hitTargetWidths = strokeWidths(
      reference
        .split('\n')
        .filter((line) => line.includes('class="event"'))
        .join('\n'),
    );
    expect(hitTargetWidths.length).toBeGreaterThan(0);

    const svg = render(3);

    const rebased = strokeWidths(
      svg
        .split('\n')
        .filter((line) => line.includes('class="event"'))
        .join('\n'),
    );
    expect(rebased).toEqual(hitTargetWidths);
    expect(rebased).not.toContain(3);
  });
});

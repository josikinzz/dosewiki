import { describe, expect, it } from 'vitest';

import { Molecule } from '#lib';

import {
  AVBL,
  buildStereoProbe,
  depict,
  hashesAcrossBond,
  strokesAlongBond,
} from './depiction_probe.js';

// DoseWiki fork delta: Molecule.setBondBold / isBondBold keep a depiction-only
// flag in the per-bond flag word (LOCAL_MODIFICATIONS.md, "Bold bonds").
// Upstream has neither method, so every test here fails on a plain 9.23.0.

describe('bold-bond marker', () => {
  it('defaults to false and round-trips through set and clear', () => {
    const molecule = Molecule.fromSmiles('CCCC');

    expect([0, 1, 2].map((bond) => molecule.isBondBold(bond))).toEqual([
      false,
      false,
      false,
    ]);

    molecule.setBondBold(1, true);
    expect([0, 1, 2].map((bond) => molecule.isBondBold(bond))).toEqual([
      false,
      true,
      false,
    ]);

    molecule.setBondBold(1, false);
    expect(molecule.isBondBold(1)).toBe(false);
  });

  it('does not disturb neighbouring bond state', () => {
    const molecule = Molecule.fromSmiles('C=CC');
    const orders = [0, 1].map((bond) => molecule.getBondOrder(bond));

    molecule.setBondBold(0, true);
    molecule.setBondBold(1, true);

    expect([0, 1].map((bond) => molecule.getBondOrder(bond))).toEqual(orders);
    expect(molecule.getIDCode()).toBe(Molecule.fromSmiles('C=CC').getIDCode());
  });

  it('survives copying like the other bond flags', () => {
    const molecule = Molecule.fromSmiles('CCCC');
    molecule.setBondBold(1, true);

    const copy = molecule.getCompactCopy();

    expect([0, 1, 2].map((bond) => copy.isBondBold(bond))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('follows its bond when atom deletion compacts the bond table', () => {
    const molecule = Molecule.fromSmiles('CCCC');
    const boldBond = molecule.getBond(1, 2);
    molecule.setBondBold(boldBond, true);

    molecule.deleteAtom(0);

    expect(molecule.getAllBonds()).toBe(2);
    const survivingBond = molecule.getBond(0, 1);
    expect(molecule.isBondBold(survivingBond)).toBe(true);
    expect(molecule.isBondBold(1 - survivingBond)).toBe(false);
  });

  it('is not written to molfiles or idcodes', () => {
    const molecule = Molecule.fromSmiles('CCCC');
    molecule.setBondBold(1, true);

    const reparsed = [
      Molecule.fromMolfile(molecule.toMolfile()),
      Molecule.fromMolfile(molecule.toMolfileV3()),
      Molecule.fromIDCode(molecule.getIDCode()),
    ];

    for (const candidate of reparsed) {
      expect(candidate.getAllBonds()).toBe(3);
      expect([0, 1, 2].map((bond) => candidate.isBondBold(bond))).toEqual([
        false,
        false,
        false,
      ]);
    }
  });
});

describe('bold-bond depiction width', () => {
  // AbstractDepictor: cFactorBoldBondWidth = 0.116 versus the standard
  // cFactorLineWidth = 0.06. Upstream draws every single bond at 0.06 x AVBL.
  const STANDARD = 0.06 * AVBL;
  const BOLD = 0.116 * AVBL;

  it('draws a marked bond at 0.116 x AVBL and leaves the others standard', () => {
    const { molecule, plain, down } = buildStereoProbe();
    molecule.setBondBold(plain, true);
    const id = 'bold';

    const svg = depict(molecule, id);

    const boldStrokes = strokesAlongBond(svg, id, plain);
    expect(boldStrokes.length).toBeGreaterThan(0);
    for (const stroke of boldStrokes) {
      expect(stroke.strokeWidth).toBeCloseTo(BOLD, 1);
    }
    const hashes = hashesAcrossBond(svg, id, down);
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) {
      expect(hash.strokeWidth).toBeCloseTo(STANDARD, 1);
    }
  });

  it('returns to the standard width once the marker is cleared', () => {
    const { molecule, plain } = buildStereoProbe();
    molecule.setBondBold(plain, true);
    molecule.setBondBold(plain, false);
    const id = 'cleared';

    const strokes = strokesAlongBond(depict(molecule, id), id, plain);

    expect(strokes.length).toBeGreaterThan(0);
    for (const stroke of strokes) {
      expect(stroke.strokeWidth).toBeCloseTo(STANDARD, 1);
    }
  });

  it('keeps the width ratio the application relies on', () => {
    const molecule = Molecule.fromSmiles('CCCC');
    molecule.setBondBold(1, true);
    const id = 'ratio';

    const svg = molecule.toSVG(400, 300, id);

    const [bold] = strokesAlongBond(svg, id, 1);
    const [standard] = strokesAlongBond(svg, id, 0);
    expect(bold.strokeWidth / standard.strokeWidth).toBeCloseTo(0.116 / 0.06, 2);
  });
});

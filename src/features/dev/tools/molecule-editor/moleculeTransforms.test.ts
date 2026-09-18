import { describe, expect, it } from "vitest";
import {
  applyBoldBonds,
  applyBondVertical,
  applyMoleculeSnap,
  countSelectedBonds,
  mirrorMoleculeCoordinates,
  readBoldBonds,
  rotateMoleculeCoordinates,
} from "./moleculeTransforms";

/** Minimal molecule standing in for OCL's bold-bond flag storage. */
class BoldBondFixture {
  private readonly bold: boolean[];

  constructor(bondCount: number, bold: number[] = []) {
    this.bold = Array.from({ length: bondCount }, (_, bond) => bold.includes(bond));
  }

  getAllBonds() {
    return this.bold.length;
  }

  isBondBold(bond: number) {
    return this.bold[bond]!;
  }

  setBondBold(bond: number, value: boolean) {
    this.bold[bond] = value;
  }
}

class CoordinateFixture {
  constructor(
    readonly coordinates: Array<{ x: number; y: number }>,
    readonly bonds: Array<{ atoms: [number, number]; selected?: boolean }> = [],
  ) {}

  getAllAtoms() {
    return this.coordinates.length;
  }

  getAtomX(atom: number) {
    return this.coordinates[atom]!.x;
  }

  getAtomY(atom: number) {
    return this.coordinates[atom]!.y;
  }

  setAtomX(atom: number, x: number) {
    this.coordinates[atom]!.x = x;
  }

  setAtomY(atom: number, y: number) {
    this.coordinates[atom]!.y = y;
  }

  getAllBonds() {
    return this.bonds.length;
  }

  getBondAtom(no: 0 | 1, bond: number) {
    return this.bonds[bond]!.atoms[no];
  }

  isSelectedBond(bond: number) {
    return !!this.bonds[bond]!.selected;
  }

  bondAngleDegrees(bond: number) {
    const [a0, a1] = this.bonds[bond]!.atoms;
    return (
      (Math.atan2(
        this.coordinates[a1]!.y - this.coordinates[a0]!.y,
        this.coordinates[a1]!.x - this.coordinates[a0]!.x,
      ) *
        180) /
      Math.PI
    );
  }
}

function distance(fixture: CoordinateFixture, a: number, b: number) {
  return Math.hypot(
    fixture.coordinates[a]!.x - fixture.coordinates[b]!.x,
    fixture.coordinates[a]!.y - fixture.coordinates[b]!.y,
  );
}

function atDegrees(degrees: number, length = 1.5) {
  return {
    x: length * Math.cos((degrees * Math.PI) / 180),
    y: length * Math.sin((degrees * Math.PI) / 180),
  };
}

describe("mirrorMoleculeCoordinates", () => {
  it("reflects every atom left-to-right about the depiction bounds without changing y", () => {
    const molecule = new CoordinateFixture([
      { x: -2, y: 3 },
      { x: 1, y: -1 },
      { x: 5, y: 4 },
    ]);

    expect(mirrorMoleculeCoordinates(molecule, "left-right")).toBe(true);
    expect(molecule.coordinates).toEqual([
      { x: 5, y: 3 },
      { x: 2, y: -1 },
      { x: -2, y: 4 },
    ]);
  });

  it("reflects every atom up-to-down about the depiction bounds without changing x", () => {
    const molecule = new CoordinateFixture([
      { x: -2, y: 3 },
      { x: 1, y: -1 },
      { x: 5, y: 4 },
    ]);

    expect(mirrorMoleculeCoordinates(molecule, "up-down")).toBe(true);
    expect(molecule.coordinates).toEqual([
      { x: -2, y: 0 },
      { x: 1, y: 4 },
      { x: 5, y: -1 },
    ]);
  });

  it("does nothing when the depiction has no atoms", () => {
    const molecule = new CoordinateFixture([]);

    expect(mirrorMoleculeCoordinates(molecule, "left-right")).toBe(false);
  });
});

describe("rotateMoleculeCoordinates", () => {
  it("rotates rigidly about the bounds centre, preserving every distance", () => {
    const molecule = new CoordinateFixture([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 3 },
      // Sits exactly on the bounds centre, the rotation's fixed point.
      { x: 1, y: 1.5 },
    ]);
    const before = [distance(molecule, 0, 1), distance(molecule, 1, 2), distance(molecule, 0, 2)];

    expect(rotateMoleculeCoordinates(molecule, Math.PI / 3)).toBe(true);

    const after = [distance(molecule, 0, 1), distance(molecule, 1, 2), distance(molecule, 0, 2)];
    after.forEach((length, index) => expect(length).toBeCloseTo(before[index]!, 9));
    expect(molecule.coordinates[3]!.x).toBeCloseTo(1, 9);
    expect(molecule.coordinates[3]!.y).toBeCloseTo(1.5, 9);
  });

  it("does nothing when the depiction has no atoms", () => {
    expect(rotateMoleculeCoordinates(new CoordinateFixture([]), Math.PI / 2)).toBe(false);
  });
});

describe("countSelectedBonds", () => {
  it("counts only the bonds flagged as selected", () => {
    const molecule = new CoordinateFixture(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      [
        { atoms: [0, 1], selected: true },
        { atoms: [1, 2] },
      ],
    );

    expect(countSelectedBonds(molecule)).toBe(1);
  });
});

describe("applyMoleculeSnap bond-vertical", () => {
  it("rotates the whole depiction so the selected bond becomes exactly vertical", () => {
    const molecule = new CoordinateFixture(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 3, y: 0.5 },
      ],
      [
        { atoms: [0, 1], selected: true },
        { atoms: [1, 2] },
      ],
    );
    const before = [distance(molecule, 0, 1), distance(molecule, 1, 2), distance(molecule, 0, 2)];

    const outcome = applyMoleculeSnap(molecule, "bond-vertical");

    expect(outcome).toMatchObject({ kind: "bond-vertical", status: "applied" });
    expect(outcome.status === "applied" && outcome.degrees).toBeCloseTo(45, 6);
    expect(molecule.coordinates[0]!.x).toBeCloseTo(molecule.coordinates[1]!.x, 9);
    const after = [distance(molecule, 0, 1), distance(molecule, 1, 2), distance(molecule, 0, 2)];
    after.forEach((length, index) => expect(length).toBeCloseTo(before[index]!, 9));
  });

  it("chooses the smaller of the two turns that make the bond vertical", () => {
    // A bond at −80° is 170° from pointing up but only 10° from pointing down.
    const molecule = new CoordinateFixture([{ x: 0, y: 0 }, atDegrees(-80)], [
      { atoms: [0, 1], selected: true },
    ]);

    const outcome = applyMoleculeSnap(molecule, "bond-vertical");

    expect(outcome.status === "applied" && outcome.degrees).toBeCloseTo(-10, 6);
    expect(molecule.coordinates[0]!.x).toBeCloseTo(molecule.coordinates[1]!.x, 9);
  });

  it("reports when no bond is selected and leaves coordinates alone", () => {
    const molecule = new CoordinateFixture(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      [{ atoms: [0, 1] }],
    );

    expect(applyMoleculeSnap(molecule, "bond-vertical")).toEqual({
      kind: "bond-vertical",
      status: "no-bond-selected",
    });
    expect(molecule.coordinates).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it("reports when the selection is ambiguous", () => {
    const molecule = new CoordinateFixture(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
      [
        { atoms: [0, 1], selected: true },
        { atoms: [1, 2], selected: true },
      ],
    );

    expect(applyMoleculeSnap(molecule, "bond-vertical")).toEqual({
      kind: "bond-vertical",
      status: "multiple-bonds-selected",
    });
  });

  it("reports an already-vertical bond without touching coordinates", () => {
    const molecule = new CoordinateFixture(
      [
        { x: 1, y: 0 },
        { x: 1, y: 2 },
      ],
      [{ atoms: [0, 1], selected: true }],
    );

    expect(applyMoleculeSnap(molecule, "bond-vertical")).toEqual({
      kind: "bond-vertical",
      status: "already-aligned",
    });
    expect(molecule.coordinates).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 2 },
    ]);
  });
});

describe("applyBondVertical", () => {
  it("rotates the whole depiction so the picked bond becomes vertical, ignoring selection", () => {
    const molecule = new CoordinateFixture(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 3, y: 0.5 },
      ],
      [
        { atoms: [0, 1] },
        { atoms: [1, 2] },
      ],
    );
    const before = [distance(molecule, 0, 1), distance(molecule, 1, 2), distance(molecule, 0, 2)];

    const outcome = applyBondVertical(molecule, 0);

    expect(outcome).toMatchObject({ kind: "bond-vertical", status: "applied" });
    expect(outcome.status === "applied" && outcome.degrees).toBeCloseTo(45, 6);
    expect(molecule.coordinates[0]!.x).toBeCloseTo(molecule.coordinates[1]!.x, 9);
    const after = [distance(molecule, 0, 1), distance(molecule, 1, 2), distance(molecule, 0, 2)];
    after.forEach((length, index) => expect(length).toBeCloseTo(before[index]!, 9));
  });

  it("fails closed on a bond index outside the molecule", () => {
    const molecule = new CoordinateFixture(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      [{ atoms: [0, 1] }],
    );

    expect(applyBondVertical(molecule, -1)).toEqual({ kind: "bond-vertical", status: "failed" });
    expect(applyBondVertical(molecule, 1)).toEqual({ kind: "bond-vertical", status: "failed" });
    expect(molecule.coordinates).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it("reports an already-vertical picked bond without touching coordinates", () => {
    const molecule = new CoordinateFixture(
      [
        { x: 1, y: 0 },
        { x: 1, y: 2 },
      ],
      [{ atoms: [0, 1] }],
    );

    expect(applyBondVertical(molecule, 0)).toEqual({
      kind: "bond-vertical",
      status: "already-aligned",
    });
  });
});

describe("applyMoleculeSnap straighten", () => {
  it("removes a uniform tilt so bonds land back on the 30° drawing grid", () => {
    // A two-bond chain drawn 10° off the grid: bonds at 40° and 100°.
    const first = atDegrees(40);
    const step = atDegrees(100);
    const molecule = new CoordinateFixture(
      [
        { x: 0, y: 0 },
        { x: first.x, y: first.y },
        { x: first.x + step.x, y: first.y + step.y },
      ],
      [{ atoms: [0, 1] }, { atoms: [1, 2] }],
    );

    const outcome = applyMoleculeSnap(molecule, "straighten");

    expect(outcome.status === "applied" && outcome.degrees).toBeCloseTo(-10, 6);
    expect(molecule.bondAngleDegrees(0)).toBeCloseTo(30, 6);
    expect(molecule.bondAngleDegrees(1)).toBeCloseTo(90, 6);
  });

  it("rotates by the circular mean when bonds deviate by different amounts", () => {
    // Bonds at 34° and 36° — independent 4° and 6° tilts average to 5°.
    const molecule = new CoordinateFixture(
      [{ x: 0, y: 0 }, atDegrees(34), { x: 5, y: 5 }, { x: 5 + atDegrees(36).x, y: 5 + atDegrees(36).y }],
      [{ atoms: [0, 1] }, { atoms: [2, 3] }],
    );

    const outcome = applyMoleculeSnap(molecule, "straighten");

    expect(outcome.status === "applied" && outcome.degrees).toBeCloseTo(-5, 6);
  });

  it("reports a depiction that is already on the grid", () => {
    const molecule = new CoordinateFixture([{ x: 0, y: 0 }, atDegrees(30)], [{ atoms: [0, 1] }]);

    expect(applyMoleculeSnap(molecule, "straighten")).toEqual({
      kind: "straighten",
      status: "already-aligned",
    });
  });

  it("reports a bond-less depiction instead of rotating", () => {
    const molecule = new CoordinateFixture([{ x: 0, y: 0 }]);

    expect(applyMoleculeSnap(molecule, "straighten")).toEqual({
      kind: "straighten",
      status: "no-bonds",
    });
  });
});

describe("bold bond helpers", () => {
  it("reads bold indices in ascending order", () => {
    const molecule = new BoldBondFixture(5, [3, 0]);
    expect(readBoldBonds(molecule)).toEqual([0, 3]);
  });

  it("applies a persisted list, clearing bonds not in it", () => {
    const molecule = new BoldBondFixture(4, [1, 2]);
    applyBoldBonds(molecule, [0, 3]);
    expect(readBoldBonds(molecule)).toEqual([0, 3]);
  });

  it("clears everything when no list is given", () => {
    const molecule = new BoldBondFixture(3, [0, 1, 2]);
    applyBoldBonds(molecule, undefined);
    expect(readBoldBonds(molecule)).toEqual([]);
  });

  it("ignores out-of-range indices in the persisted list", () => {
    const molecule = new BoldBondFixture(2);
    applyBoldBonds(molecule, [1, 99]);
    expect(readBoldBonds(molecule)).toEqual([1]);
  });
});

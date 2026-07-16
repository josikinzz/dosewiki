import { describe, expect, it } from "vitest";
import { mirrorMoleculeCoordinates } from "./OclEditor";

class CoordinateFixture {
  constructor(readonly coordinates: Array<{ x: number; y: number }>) {}

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

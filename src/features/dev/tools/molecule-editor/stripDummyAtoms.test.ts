import { describe, expect, it } from "vitest";
import * as OCL from "openchemlib";

import { RDKIT_PHENETHYLAMINE } from "./classMolblockFixture";
import { CLASS_STRUCTURES } from "./classStructures";
import { stripDummyAtoms } from "./stripDummyAtoms";

function atomCoordinates(molecule: OCL.Molecule): Array<{ x: number; y: number }> {
  return Array.from({ length: molecule.getAllAtoms() }, (_, atom) => ({
    x: molecule.getAtomX(atom),
    y: molecule.getAtomY(atom),
  }));
}

describe("stripDummyAtoms", () => {
  it("removes the R-group dummies from the real phenethylamine class structure while retaining coordinates", async () => {
    const phenethylamine = CLASS_STRUCTURES.find((item) => item.key === "phenethylamine");
    expect(phenethylamine?.rLabels).toEqual({
      "2": "R2",
      "3": "R3",
      "4": "R4",
      "5": "R5",
      "6": "R6",
      "7": "Rβ",
      "8": "Rα",
      "9": "RN",
    });
    const source = OCL.Molecule.fromMolfile(RDKIT_PHENETHYLAMINE);
    const expectedCoordinates = Array.from({ length: source.getAllAtoms() }, (_, atom) => atom)
      .filter((atom) => source.getAtomicNo(atom) !== 0)
      .map((atom) => ({ x: source.getAtomX(atom), y: source.getAtomY(atom) }));

    const stripped = OCL.Molecule.fromMolfile(await stripDummyAtoms(RDKIT_PHENETHYLAMINE));

    expect(stripped.getAllAtoms()).toBe(expectedCoordinates.length);
    expect(atomCoordinates(stripped)).toEqual(
      expectedCoordinates.map(({ x, y }) => ({
        x: expect.closeTo(x, 8),
        y: expect.closeTo(y, 8),
      })),
    );
  });

  it("is a no-op for a plain scaffold and leaves its coordinates unchanged", async () => {
    const plainScaffold = `
  DoseWiki

  2  1  0  0  0  0  0  0  0  0999 V2000
    1.2345   -2.3456    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    4.5678    5.6789    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
M  END
`;

    expect(await stripDummyAtoms(plainScaffold)).toBe(plainScaffold);
    const before = OCL.Molecule.fromMolfile(plainScaffold);
    const after = OCL.Molecule.fromMolfile(await stripDummyAtoms(plainScaffold));
    expect(atomCoordinates(after)).toEqual(atomCoordinates(before));
  });

  it("keeps all bonds between the surviving scaffold atoms", async () => {
    const stripped = OCL.Molecule.fromMolfile(await stripDummyAtoms(RDKIT_PHENETHYLAMINE));
    const expected = OCL.Molecule.fromSmiles("NCCc1ccccc1");

    expect(stripped.toSmiles()).toBe(expected.toSmiles());
    expect(stripped.getAllBonds()).toBe(9);
  });
});

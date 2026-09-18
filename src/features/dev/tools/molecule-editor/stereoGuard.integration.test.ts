// @vitest-environment node
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import initRDKitModule from "@rdkit/rdkit";
import { Molecule } from "openchemlib";
import {
  compareInchi,
  type RdkitModuleLike,
} from "@/features/dev/tools/molecule-editor/stereoGuard";
import { mirrorMoleculeCoordinates } from "@/features/dev/tools/molecule-editor/moleculeTransforms";

// LSD (two stereocenters) and an inverted-stereocenter diastereomer.
const LSD_SMILES = "CCN(CC)C(=O)[C@H]1CN([C@@H]2Cc3c[nH]c4cccc(c34)C2=C1)C";
const LSD_INVERTED = "CCN(CC)C(=O)[C@H]1CN([C@H]2Cc3c[nH]c4cccc(c34)C2=C1)C";

function molblockFromSmiles(smiles: string): string {
  const m = Molecule.fromSmiles(smiles);
  m.inventCoordinates();
  return m.toMolfile();
}

let rdkit: RdkitModuleLike;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@rdkit/rdkit/dist/RDKit_minimal.wasm");
  const init = initRDKitModule as unknown as (opts?: {
    locateFile?: () => string;
  }) => Promise<RdkitModuleLike>;
  rdkit = await init({ locateFile: () => wasmPath });
}, 30_000);

describe("compareInchi (stereo guard)", () => {
  it("treats a re-depicted molecule as the SAME chemistry (match)", () => {
    // A fresh 2D depiction of LSD: different coords/wedges, identical molecule.
    const editedMolblock = molblockFromSmiles(LSD_SMILES);
    const result = compareInchi(rdkit, LSD_SMILES, editedMolblock);
    expect(result.match).toBe(true);
    expect(result.inchiOriginal).toBe(result.inchiEdited);
    expect(result.inchiOriginal).toContain("InChI=1S/C20H25N3O");
  });

  it("flags an inverted stereocenter as a DIFFERENT molecule (mismatch)", () => {
    const editedMolblock = molblockFromSmiles(LSD_INVERTED);
    const result = compareInchi(rdkit, LSD_SMILES, editedMolblock);
    expect(result.match).toBe(false);
    expect(result.inchiOriginal).not.toBe(result.inchiEdited);
    // both are real LSD-formula InChIs, differing only in the /t stereo layer
    expect(result.inchiEdited).toContain("InChI=1S/C20H25N3O");
  });

  it("reports no match (not a crash) when the edited molblock is unparseable", () => {
    const result = compareInchi(rdkit, LSD_SMILES, "not a molblock");
    expect(result.match).toBe(false);
    expect(result.inchiEdited).toBe("");
    expect(result.inchiOriginal).toContain("InChI=1S");
  });
});

describe("mirrorMoleculeCoordinates keeps the chemistry", () => {
  it.each(["left-right", "up-down"] as const)(
    "keeps LSD stereochemistry intact when flipped %s",
    (direction) => {
      const molecule = Molecule.fromSmiles(LSD_SMILES);
      molecule.inventCoordinates();
      const editable = Molecule.fromMolfile(molecule.toMolfile());

      expect(mirrorMoleculeCoordinates(editable, direction, Molecule)).toBe(true);
      expect(compareInchi(rdkit, LSD_SMILES, editable.toMolfile()).match).toBe(true);
    },
  );
});

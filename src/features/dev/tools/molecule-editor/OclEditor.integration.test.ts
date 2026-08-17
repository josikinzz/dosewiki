// @vitest-environment node
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import initRDKitModule from "@rdkit/rdkit";
import { Molecule } from "openchemlib";
import { mirrorMoleculeCoordinates } from "./moleculeTransforms";
import { compareInchi, type RdkitModuleLike } from "./stereoGuard";

const LSD_SMILES = "CCN(CC)C(=O)[C@H]1CN([C@@H]2Cc3c[nH]c4cccc(c34)C2=C1)C";

let rdkit: RdkitModuleLike;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@rdkit/rdkit/dist/RDKit_minimal.wasm");
  const init = initRDKitModule as unknown as (opts?: {
    locateFile?: () => string;
  }) => Promise<RdkitModuleLike>;
  rdkit = await init({ locateFile: () => wasmPath });
}, 30_000);

describe("molecule depiction mirrors", () => {
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

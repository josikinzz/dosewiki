// @vitest-environment node
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import initRDKitModule from "@rdkit/rdkit";
import { Molecule } from "openchemlib";
import {
  renderMoleculeSvg,
  type RdkitModuleLike,
} from "@/features/dev/tools/molecule-editor/renderMoleculeSvg";

const LSD_SMILES = "CCN(CC)C(=O)[C@H]1CN([C@@H]2Cc3c[nH]c4cccc(c34)C2=C1)C";
const METHYLENEDIOXY_CATHINONE_SMILES = "CNC(C)C(=O)c1ccc2c(c1)OCO2";

function lsdMolblock(): string {
  const m = Molecule.fromSmiles(LSD_SMILES);
  m.inventCoordinates();
  return m.toMolfile();
}

function alternateKekuleFixture() {
  const molecule = Molecule.fromSmiles(METHYLENEDIOXY_CATHINONE_SMILES);
  molecule.inventCoordinates();
  molecule.ensureHelperArrays(Molecule.cHelperRings);
  const arylBonds = Array.from({ length: molecule.getAllBonds() }, (_, bond) => bond).filter(
    (bond) => molecule.isAromaticBond(bond),
  );

  for (const bond of arylBonds) {
    molecule.setBondType(
      bond,
      molecule.getBondType(bond) === Molecule.cBondTypeDouble
        ? Molecule.cBondTypeSingle
        : Molecule.cBondTypeDouble,
    );
  }

  return {
    molblock: molecule.toMolfile(),
    arylBonds,
    doubleBonds: arylBonds.filter(
      (bond) => molecule.getBondType(bond) === Molecule.cBondTypeDouble,
    ),
  };
}

function renderedDoubleBonds(svg: string, bonds: number[]) {
  return bonds.filter((bond) => {
    const paths = svg.match(new RegExp(`class='bond-${bond} `, "g"));
    return paths?.length === 2;
  });
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

describe("renderMoleculeSvg", () => {
  it(
    "renders a brand-styled SVG from an explicit MOL block",
    () => {
      const svg = renderMoleculeSvg(rdkit, lsdMolblock());
      expect(svg).not.toBeNull();
      expect(svg!).toContain("<svg");
      // brand fuchsia skeleton (RDKit emits uppercase hex)
      expect(svg!).toContain("#F0ABFC");
      // transparent background rect
      expect(svg!).toContain("#FFFFFF00");
    },
    15_000,
  );

  it("applies the rounded-stroke post-processing (no butt caps / miter joins)", () => {
    const svg = renderMoleculeSvg(rdkit, lsdMolblock())!;
    expect(svg).not.toContain("stroke-linecap:butt");
    expect(svg).not.toContain("stroke-linejoin:miter");
    expect(svg).toContain("stroke-linecap:round");
    expect(svg).toContain("stroke-linejoin:round");
  });

  it("emits a tight, flexible viewBox (not the 250×250 default)", () => {
    const svg = renderMoleculeSvg(rdkit, lsdMolblock())!;
    const m = svg.match(/width='(\d+(?:\.\d+)?)px'/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).not.toBe(250);
    expect(svg).toMatch(/viewBox='[-\d. ]+'/);
  });

  it("preserves the editor's aromatic double-bond pattern on a fused ring", () => {
    const fixture = alternateKekuleFixture();
    const svg = renderMoleculeSvg(rdkit, fixture.molblock);

    expect(svg).not.toBeNull();
    expect(renderedDoubleBonds(svg!, fixture.arylBonds)).toEqual(fixture.doubleBonds);
  });

  it("returns null for an unparseable MOL block", () => {
    expect(renderMoleculeSvg(rdkit, "definitely not a molblock")).toBeNull();
  });
});

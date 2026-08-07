// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as OCL from "openchemlib";
import {
  CARBON_COLOR,
  R_LABEL_COLOR,
  renderMoleculeSvg,
} from "@/features/dev/tools/molecule-editor/renderMoleculeSvg";

const { Molecule } = OCL;

const LSD_SMILES = "CCN(CC)C(=O)[C@H]1CN([C@@H]2Cc3c[nH]c4cccc(c34)C2=C1)C";
const METHYLENEDIOXY_CATHINONE_SMILES = "CNC(C)C(=O)c1ccc2c(c1)OCO2";
// A chiral pure hydrocarbon: any "H" in the output is a phantom the renderer added.
const CHIRAL_HYDROCARBON_SMILES = "C[C@H](CC)C(C)CC";

function molblockFromSmiles(smiles: string): string {
  const m = Molecule.fromSmiles(smiles);
  m.inventCoordinates();
  return m.toMolfile();
}

function alternateKekuleFixture() {
  const molecule = Molecule.fromSmiles(METHYLENEDIOXY_CATHINONE_SMILES);
  molecule.inventCoordinates();
  const original = molecule.toMolfile();

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

  return { original, alternate: molecule.toMolfile() };
}

describe("renderMoleculeSvg (OpenChemLib)", () => {
  it("renders a brand-styled SVG from an explicit MOL block", () => {
    const svg = renderMoleculeSvg(OCL, molblockFromSmiles(LSD_SMILES));
    expect(svg).not.toBeNull();
    expect(svg!).toContain("<svg");
    // brand carbon skeleton, every CPK color mapped away
    expect(svg!).toContain(CARBON_COLOR);
    expect(svg!).not.toContain("rgb(");
    // interaction layer stripped; rounded strokes kept
    expect(svg!).not.toContain('class="event"');
    expect(svg!).not.toContain("pointer-events");
    expect(svg!).toContain("stroke-linecap:round");
  });

  it("draws no phantom stereo hydrogen (Fig. 1 regression)", () => {
    // RDKit's addChiralHs default invented an explicit H at every stereocenter.
    // A chiral hydrocarbon must render with no atom labels at all.
    const svg = renderMoleculeSvg(OCL, molblockFromSmiles(CHIRAL_HYDROCARBON_SMILES));
    expect(svg).not.toBeNull();
    expect(svg!).not.toContain("<text");
  });

  it("draws bonds at the 28 px brand length regardless of molecule size", () => {
    const svg = renderMoleculeSvg(OCL, molblockFromSmiles(LSD_SMILES))!;
    const lines = [...svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)];
    const longest = Math.max(
      ...lines.map((m) => Math.hypot(Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2]))),
    );
    expect(longest).toBeGreaterThan(26);
    expect(longest).toBeLessThan(30);
  });

  it("preserves the editor's Kekulé pattern on a fused ring instead of re-deriving it", () => {
    const { original, alternate } = alternateKekuleFixture();
    const svgOriginal = renderMoleculeSvg(OCL, original);
    const svgAlternate = renderMoleculeSvg(OCL, alternate);
    expect(svgOriginal).not.toBeNull();
    expect(svgAlternate).not.toBeNull();
    // A sanitizing renderer would normalize both variants to one drawing; drawing
    // the MOL block verbatim keeps the flipped double bonds visibly different.
    expect(svgOriginal).not.toBe(svgAlternate);
  });

  it("pads tiny molecules up to the viewBox floor", () => {
    const svg = renderMoleculeSvg(OCL, molblockFromSmiles("CC"))!;
    expect(svg).toContain('width="56px" height="56px"');
  });

  it("renders class R-group labels — Greek included — as real text in the R violet", () => {
    const molblock = `
  probe

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2990    0.7500    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    2.5981    0.0000    0.0000 *   0  0  0  0  0  0  0  0  0  1  0  0
  1  2  1  0
  2  3  1  0
M  END
`;
    const svg = renderMoleculeSvg(OCL, molblock, { 2: "Rα" });
    expect(svg).not.toBeNull();
    expect(svg!).toContain(`fill="${R_LABEL_COLOR}">Rα</text>`);
  });

  it("draws bold bonds 2.5× thicker while every other bond keeps the base width", () => {
    const molblock = molblockFromSmiles(LSD_SMILES);
    const svg = renderMoleculeSvg(OCL, molblock, undefined, [0, 1])!;
    const widths = [
      ...new Set([...svg.matchAll(/stroke-width="([^"]+)"/g)].map((m) => Number(m[1]))),
    ].sort((a, b) => a - b);
    expect(widths).toHaveLength(2);
    expect(widths[1] / widths[0]).toBeCloseTo(2.5, 1);
    // without the bold list the same molblock renders a single width
    const plain = renderMoleculeSvg(OCL, molblock)!;
    const plainWidths = new Set([...plain.matchAll(/stroke-width="([^"]+)"/g)].map((m) => m[1]));
    expect(plainWidths.size).toBe(1);
  });

  it("ignores out-of-range bold indices instead of failing the render", () => {
    const svg = renderMoleculeSvg(OCL, molblockFromSmiles("CCO"), undefined, [999]);
    expect(svg).not.toBeNull();
  });

  it("returns null for an unparseable MOL block", () => {
    expect(renderMoleculeSvg(OCL, "definitely not a molblock")).toBeNull();
  });

  it("is deterministic: identical input yields byte-identical SVG", () => {
    const molblock = molblockFromSmiles(LSD_SMILES);
    expect(renderMoleculeSvg(OCL, molblock)).toBe(renderMoleculeSvg(OCL, molblock));
  });
});

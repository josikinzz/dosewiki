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

function lsdMolblock(): string {
  const m = Molecule.fromSmiles(LSD_SMILES);
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

  it("returns null for an unparseable MOL block", () => {
    expect(renderMoleculeSvg(rdkit, "definitely not a molblock")).toBeNull();
  });
});

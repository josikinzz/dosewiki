import { describe, expect, it } from "vitest";
import {
  BRAND_PALETTE,
  buildDrawDetails,
  floorViewBox,
  roundStrokes,
  VIEWBOX_FLOOR,
} from "@/features/dev/tools/molecule-editor/renderMoleculeSvg";

describe("roundStrokes", () => {
  it("softens RDKit's butt caps and miter joins to round", () => {
    const svg =
      "<path style='stroke-linecap:butt;stroke-linejoin:miter' />" +
      "<path style='stroke-linecap:butt;stroke-linejoin:miter' />";
    const out = roundStrokes(svg);
    expect(out).not.toContain("stroke-linecap:butt");
    expect(out).not.toContain("stroke-linejoin:miter");
    expect(out.match(/stroke-linecap:round/g)).toHaveLength(2);
    expect(out.match(/stroke-linejoin:round/g)).toHaveLength(2);
  });

  it("leaves already-rounded / unrelated styles untouched", () => {
    const svg = "<path style='stroke-linecap:round;fill:#F0ABFC' />";
    expect(roundStrokes(svg)).toBe(svg);
  });
});

describe("floorViewBox", () => {
  it("leaves a molecule already larger than the floor untouched", () => {
    // LSD-sized output from the prototype.
    const svg =
      "width='156px' height='140px' viewBox='0 0 156 140'><!-- END -->";
    expect(floorViewBox(svg)).toBe(svg);
  });

  it("pads a tiny molecule up to the floor and re-centres the viewBox", () => {
    // 30x20 molecule, floor 56 → tw=th=56, ox=(56-30)/2=13, oy=(56-20)/2=18
    const svg = "width='30px' height='20px' viewBox='0 0 30 20'>rest";
    const out = floorViewBox(svg);
    expect(out).toContain("width='56px' height='56px'");
    expect(out).toContain("viewBox='-13 -18 56 56'");
    expect(out).toContain("rest");
  });

  it("pads only the limiting dimension", () => {
    // 80x20, floor 56 → width stays 80, height floored to 56, oy=(56-20)/2=18
    const svg = "width='80px' height='20px' viewBox='0 0 80 20'>";
    const out = floorViewBox(svg);
    expect(out).toContain("width='80px' height='56px'");
    expect(out).toContain("viewBox='0 -18 80 56'");
  });

  it("returns the svg unchanged when the dimension header doesn't match", () => {
    const svg = "<svg width='10' height='10'></svg>";
    expect(floorViewBox(svg)).toBe(svg);
  });

  it("uses 56 (28 bond-length × 2.0) as the default floor", () => {
    expect(VIEWBOX_FLOOR).toBe(56);
  });
});

describe("buildDrawDetails", () => {
  it("mirrors the Python render_molecules.py draw options", () => {
    const d = buildDrawDetails();
    expect(d.width).toBe(-1);
    expect(d.height).toBe(-1);
    expect(d.fixedBondLength).toBe(28);
    expect(d.bondLineWidth).toBeCloseTo(1.1);
    expect(d.scaleBondWidth).toBe(false);
    expect(d.backgroundColour).toEqual([1, 1, 1, 0]); // transparent
    expect(d.useMolBlockWedging).toBe(true); // honor saved wedges verbatim
    expect(d.prepareMolsBeforeDrawing).toBe(false); // honor saved coords verbatim
  });

  it("includes the brand palette with a default (-1) entry", () => {
    const d = buildDrawDetails();
    expect(d.atomColourPalette[-1]).toEqual([0xf0 / 255, 0xab / 255, 0xfc / 255]); // carbon
    expect(d.atomColourPalette[7]).toEqual([0xc4 / 255, 0xb5 / 255, 0xfd / 255]); // N violet
    expect(d.atomColourPalette[8]).toEqual([0xfd / 255, 0xa4 / 255, 0xaf / 255]); // O rose
  });
});

describe("BRAND_PALETTE", () => {
  it("colour-codes the elements the legacy artwork uses", () => {
    // carbon/H share the fuchsia skeleton colour
    expect(BRAND_PALETTE[6]).toEqual(BRAND_PALETTE[-1]);
    expect(BRAND_PALETTE[1]).toEqual(BRAND_PALETTE[-1]);
    expect(BRAND_PALETTE[16]).toEqual([0xbe / 255, 0xf2 / 255, 0x64 / 255]); // S lime
    expect(BRAND_PALETTE[17]).toEqual([0x6e / 255, 0xe7 / 255, 0xb7 / 255]); // Cl emerald
  });
});

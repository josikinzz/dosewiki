import { describe, expect, it } from "vitest";
import {
  applyBrandColors,
  BOLD_BODY_WIDTH,
  BOLD_CROSSING_GAP,
  buildRenderOptions,
  CARBON_COLOR,
  floorViewBox,
  OCL_BASE_STROKE_WIDTH,
  OCL_COLOR_TO_BRAND,
  R_LABEL_COLOR,
  rebaseStrokeWidths,
  RIBBON_HAIRLINE,
  stripEventLayer,
  svgIdFor,
  thinWedgeOutlines,
  VIEWBOX_FLOOR,
} from "@/features/dev/tools/molecule-editor/renderMoleculeSvg";

describe("buildRenderOptions", () => {
  it("draws the stored depiction verbatim at brand scale", () => {
    const options = buildRenderOptions() as Record<string, unknown>;
    expect(options.maxAVBL).toBe(28); // brand bond length in px
    // stroke width is deliberately absent: rebaseStrokeWidths handles it so
    // bold strokes keep their absolute (wedge-matching) width
    expect(options.strokeWidth).toBeUndefined();
    expect(options.autoCrop).toBe(true);
    // the depiction is data, not a stereochemistry report — no chiral/ESR/CIP text
    expect(options.suppressChiralText).toBe(true);
    expect(options.suppressESR).toBe(true);
    expect(options.suppressCIPParity).toBe(true);
    expect(options.noStereoProblem).toBe(true);
  });
});

describe("rebaseStrokeWidths", () => {
  it("thins the engine's base width to the brand width", () => {
    const svg = `<line stroke-width="${OCL_BASE_STROKE_WIDTH}" /><line stroke-width="1.68" />`;
    const out = rebaseStrokeWidths(svg);
    expect(out).not.toContain('stroke-width="1.68"');
    expect(out.match(/stroke-width="1\.1"/g)).toHaveLength(2);
  });

  it("leaves ribbon hairlines and halo strokes at their absolute widths", () => {
    const svg = `<line stroke-width="1.68" /><polygon stroke-width="${RIBBON_HAIRLINE}" /><polygon stroke-width="5.20" />`;
    const out = rebaseStrokeWidths(svg);
    expect(out).toContain(`stroke-width="${RIBBON_HAIRLINE}"`);
    expect(out).toContain('stroke-width="5.20"');
    expect(out).toContain('stroke-width="1.1"');
  });

  it("bold body and crossing gap carry Lyrea's revised values", () => {
    expect(BOLD_BODY_WIDTH).toBeCloseTo(3.25, 10);
    expect(BOLD_CROSSING_GAP).toBeCloseTo(3.3, 10);
  });
});

describe("stripEventLayer", () => {
  const svg =
    '<svg id="m"><style> #m text {font-family: sans-serif;} #m { pointer-events:none; } #m .event  { pointer-events:all; } #m line { stroke-linecap:round; } #m polygon { stroke-linejoin:round; } </style>\n' +
    '<line x1="1" y1="2" x2="3" y2="4" stroke="rgb(0,0,0)" stroke-width="1.1" />\n' +
    '  <line id="m:Bond:0" class="event" x1="1" y1="2" x2="3" y2="4" stroke-width="1.1" opacity="0" />\n' +
    '  <circle id="m:Atom:0" class="event" cx="1" cy="2" r="8" opacity="0" />\n' +
    "</svg>";

  it("removes the invisible hit-target elements and pointer-events rules", () => {
    const out = stripEventLayer(svg);
    expect(out).not.toContain('class="event"');
    expect(out).not.toContain("pointer-events");
  });

  it("keeps the visible drawing and its rounded stroke rules", () => {
    const out = stripEventLayer(svg);
    expect(out).toContain('<line x1="1" y1="2" x2="3" y2="4" stroke="rgb(0,0,0)"');
    expect(out).toContain("stroke-linecap:round");
    expect(out).toContain("stroke-linejoin:round");
  });
});

describe("applyBrandColors", () => {
  it("maps every OpenChemLib CPK color onto the brand palette", () => {
    const parts = Object.keys(OCL_COLOR_TO_BRAND).map(
      (color, i) => `<text fill="${color}">${i}</text>`,
    );
    const out = applyBrandColors(parts.join(""));
    expect(out).not.toContain("rgb(");
    for (const brand of Object.values(OCL_COLOR_TO_BRAND)) {
      expect(out).toContain(brand);
    }
  });

  it("maps bonds and carbon (black) to the carbon color", () => {
    const out = applyBrandColors('<line stroke="rgb(0,0,0)" />');
    expect(out).toContain(`stroke="${CARBON_COLOR}"`);
  });

  it("falls back to the carbon color for unmapped (exotic element) colors", () => {
    const out = applyBrandColors('<text fill="rgb(1,2,3)">Si</text>');
    expect(out).toContain(`fill="${CARBON_COLOR}"`);
  });

  it("recolors class R-group labels to the R-label violet by their exact text", () => {
    const svg =
      '<text x="1" y="2" stroke="none" font-size="14" fill="rgb(0,0,0)">Rα</text>' +
      '<text x="3" y="4" stroke="none" font-size="14" fill="rgb(48,80,248)">N</text>';
    const out = applyBrandColors(svg, ["Rα"]);
    expect(out).toContain(`fill="${R_LABEL_COLOR}">Rα</text>`);
    // the N label keeps its element color
    expect(out).toContain(`fill="${OCL_COLOR_TO_BRAND["rgb(48,80,248)"]}">N</text>`);
  });
});

describe("floorViewBox", () => {
  it("leaves a molecule already larger than the floor untouched", () => {
    const svg = 'width="210px" height="206px" viewBox="1895 1893 210 206"><!-- END -->';
    expect(floorViewBox(svg)).toBe(svg);
  });

  it("pads a tiny molecule up to the floor, centered on OCL's crop origin", () => {
    // 30x20 at origin (100, 200), floor 56 → pad 13 left/right, 18 up/down
    const svg = 'width="30px" height="20px" viewBox="100 200 30 20">rest';
    const out = floorViewBox(svg);
    expect(out).toContain('width="56px" height="56px"');
    expect(out).toContain('viewBox="87 182 56 56"');
    expect(out).toContain("rest");
  });

  it("pads only the limiting dimension", () => {
    const svg = 'width="80px" height="20px" viewBox="0 10 80 20">';
    const out = floorViewBox(svg);
    expect(out).toContain('width="80px" height="56px"');
    expect(out).toContain('viewBox="0 -8 80 56"');
  });

  it("returns the svg unchanged when the dimension header doesn't match", () => {
    const svg = '<svg width="10" height="10"></svg>';
    expect(floorViewBox(svg)).toBe(svg);
  });

  it("uses 56 (28 bond-length × 2.0) as the default floor", () => {
    expect(VIEWBOX_FLOOR).toBe(56);
  });
});

describe("thinWedgeOutlines", () => {
  it("thins the engine's fat wedge outline to the ribbon hairline", () => {
    const svg = `<polygon points="0,0 1,1 2,2 " fill="rgb(0,0,0)" stroke="rgb(0,0,0)" stroke-width="${OCL_BASE_STROKE_WIDTH}" />`;
    expect(thinWedgeOutlines(svg)).toContain(`stroke-width="${RIBBON_HAIRLINE}"`);
  });

  it("does not touch line strokes or already-thin polygons", () => {
    const svg = `<line stroke-width="1.68" /><polygon points="0,0" stroke-width="0.5" />`;
    expect(thinWedgeOutlines(svg)).toBe(svg);
  });
});

describe("svgIdFor", () => {
  it("is stable for identical input so saved SVGs are reproducible", () => {
    expect(svgIdFor("molblock", { 0: "R1" })).toBe(svgIdFor("molblock", { 0: "R1" }));
  });

  it("differs across molblocks, label sets, and bold sets", () => {
    expect(svgIdFor("a")).not.toBe(svgIdFor("b"));
    expect(svgIdFor("a", { 0: "R1" })).not.toBe(svgIdFor("a", { 0: "R2" }));
    expect(svgIdFor("a", undefined, [1])).not.toBe(svgIdFor("a"));
  });

  it("ignores an empty bold list so bold-free renders stay byte-stable", () => {
    expect(svgIdFor("a", undefined, [])).toBe(svgIdFor("a"));
  });
});

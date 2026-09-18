import { describe, expect, it } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import {
  BRAND_MOLECULE_HEXES,
  EFFECT_INDEX_MOLECULE_PALETTES,
  RECOLORABLE_MOLECULE_HEXES,
  applyMoleculeColorway,
  recolorMoleculeSvgToEffectIndex,
  resolveMoleculeColorway,
} from "./moleculePalette";

const EI_HEXES = Object.values(EFFECT_INDEX_MOLECULE_PALETTES.light);

/** A bond path and an atom-glyph path, shaped exactly as RDKit writes them. */
const bondPath = (hex: string) =>
  `<path class='bond-0 atom-0 atom-1' d='M 29.2,44.6 L 36.4,40.5' style='fill:none;fill-rule:evenodd;stroke:${hex};stroke-width:1.1px;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:1' />`;

const atomPath = (hex: string) =>
  `<path class='atom-3' d='M 10,10 L 20,20 Z' style='fill:${hex};fill-rule:evenodd;stroke:${hex};stroke-width:1.0px' />`;

describe("recolorMoleculeSvgToEffectIndex", () => {
  it("maps every brand palette hex onto an Effect Index colour", () => {
    for (const hex of BRAND_MOLECULE_HEXES) {
      const recoloured = recolorMoleculeSvgToEffectIndex(bondPath(hex));

      expect(recoloured, `brand hex ${hex} must be replaced`).not.toContain(hex);
      const replacement = /stroke:(#[0-9a-f]{6,8})/.exec(recoloured)?.[1];
      expect(EI_HEXES, `brand hex ${hex} mapped to ${replacement}`).toContain(replacement);
    }
  });

  it("maps every recognised source literal, in either letter case", () => {
    for (const hex of RECOLORABLE_MOLECULE_HEXES) {
      for (const cased of [hex.toLowerCase(), hex.toUpperCase()]) {
        const recoloured = recolorMoleculeSvgToEffectIndex(bondPath(cased));

        // `#333333` is both a legacy source and the Effect Index carbon value, so the only
        // universal assertion is that the output is a palette colour.
        const replacement = /stroke:(#[0-9a-f]{6})([0-9a-f]{2})?/.exec(recoloured);
        expect(replacement, `source ${cased} produced no hex`).not.toBeNull();
        expect(EI_HEXES, `source ${cased} mapped to ${replacement?.[1]}`).toContain(
          replacement?.[1],
        );
      }
    }
  });

  it("assigns the documented CPK-derived hue to each element colour", () => {
    // The brand palette is the shipping source, so these are the mappings that matter most.
    const cases: Array<[string, string]> = [
      ["#F0ABFC", "#333333"], // carbon / bonds
      ["#C4B5FD", "#2f4a8f"], // nitrogen
      ["#FDA4AF", "#b0413e"], // oxygen
      ["#BEF264", "#9a7d20"], // sulfur
      ["#6EE7B7", "#3d7d52"], // chlorine
      ["#FB7185", "#8a4230"], // bromine
      ["#E879F9", "#6a4b8f"], // iodine
      ["#FBBF24", "#4a8f6f"], // fluorine (brand collapses F and P into this amber)
      ["#C084FC", "#3d9991"], // Markush R-group label
      // The standard colourway keeps fluorine and phosphorus apart.
      ["#33CCCC", "#4a8f6f"], // fluorine
      ["#FF7F00", "#b06a2c"], // phosphorus
      ["#000000", "#333333"], // carbon
      ["#0000FF", "#2f4a8f"], // nitrogen
      ["#FF0000", "#b0413e"], // oxygen
      ["#CCCC00", "#9a7d20"], // sulfur
      ["#00CC00", "#3d7d52"], // chlorine
      ["#7F4C19", "#8a4230"], // bromine
      ["#A01EEF", "#6a4b8f"], // iodine
    ];

    for (const [source, expected] of cases) {
      expect(recolorMoleculeSvgToEffectIndex(atomPath(source)), source).toBe(atomPath(expected));
    }
  });

  it("uses brighter element colours on the Pro dark canvas", () => {
    const cases: Array<[string, string]> = [
      ["#F0ABFC", "#f2f2f0"],
      ["#C4B5FD", "#91aef2"],
      ["#FDA4AF", "#ef8580"],
      ["#BEF264", "#d8bc5d"],
      ["#C084FC", "#6fc4bb"],
      ["#FFFFFF", "#131313"],
    ];

    for (const [source, expected] of cases) {
      expect(recolorMoleculeSvgToEffectIndex(atomPath(source), "dark"), source).toBe(
        atomPath(expected),
      );
    }
  });

  it("leaves unknown colours untouched", () => {
    const svg = [
      bondPath("#123456"),
      atomPath("#abcdef"),
      "<rect fill='#0f172a' />",
      "<stop stop-color='rebeccapurple' />",
      "<path style='fill:none;stroke-width:1.1px' />",
      "<g id='black-box' data-note='red herring, white noise' />",
    ].join("\n");

    expect(recolorMoleculeSvgToEffectIndex(svg)).toBe(svg);
  });

  it("leaves the bold-ribbon crossing-gap mask as mask arithmetic", () => {
    // `renderMoleculeSvg.applyBoldRibbon` masks every plain bond line behind a
    // luminance mask: `white` field, `black` halo shapes. Recolouring those sends
    // white to the dark `surface` and black to the near-white dark `carbon`, which
    // inverts the mask and renders the whole skeleton at a few percent alpha.
    const mask = [
      '<mask id="mol-1-halo" maskUnits="userSpaceOnUse" x="0" y="0" width="10" height="10">',
      '<rect x="0" y="0" width="10" height="10" fill="white"/>',
      '<polygon points="0,0 1,1 2,2" fill="black" stroke="black" stroke-width="6.60"/>',
      "</mask>",
    ].join("");
    const svg = `<svg><defs>${mask}</defs><g mask="url(#mol-1-halo)">${bondPath("#F0ABFC")}</g></svg>`;

    for (const colorScheme of ["light", "dark"] as const) {
      const recoloured = recolorMoleculeSvgToEffectIndex(svg, colorScheme);

      expect(recoloured, colorScheme).toContain(mask);
      // The masked artwork outside the channel still recolours.
      expect(recoloured, colorScheme).toContain(
        `stroke:${EFFECT_INDEX_MOLECULE_PALETTES[colorScheme].carbon}`,
      );
    }
  });

  it("still recolours gradient stops inside defs", () => {
    const svg = `<svg><defs><linearGradient id="g"><stop stop-color="#F0ABFC"/></linearGradient></defs></svg>`;

    expect(recolorMoleculeSvgToEffectIndex(svg)).toContain('stop-color="#333333"');
  });

  it.each(["light", "dark"] as const)("is idempotent in %s mode", (colorScheme) => {
    const svg = [
      ...BRAND_MOLECULE_HEXES.map(bondPath),
      ...RECOLORABLE_MOLECULE_HEXES.map(atomPath),
      bondPath("#F0ABFC80"),
      atomPath("#666633"),
      "<rect fill='rgb(51, 51, 153)' />",
      "<path style='stroke:black;fill:red' />",
      "<rect fill='white' />",
      bondPath("#123456"),
    ].join("\n");

    const once = recolorMoleculeSvgToEffectIndex(svg, colorScheme);
    const twice = recolorMoleculeSvgToEffectIndex(once, colorScheme);
    const thrice = recolorMoleculeSvgToEffectIndex(twice, colorScheme);

    expect(twice).toBe(once);
    expect(thrice).toBe(once);
  });

  it("never leaves a brand hex behind", () => {
    const svg = BRAND_MOLECULE_HEXES.flatMap((hex) => [
      bondPath(hex),
      bondPath(hex.toUpperCase()),
      atomPath(`${hex}cc`),
    ]).join("\n");

    const recoloured = recolorMoleculeSvgToEffectIndex(svg).toLowerCase();

    for (const hex of BRAND_MOLECULE_HEXES) {
      expect(recoloured, `${hex} survived`).not.toContain(hex);
    }
  });

  it("preserves the alpha channel of an unlisted 8-digit literal", () => {
    // Hand-edited overrides may carry their own opacity; only the RGB half is remapped.
    expect(recolorMoleculeSvgToEffectIndex(atomPath("#F0ABFC80"))).toBe(atomPath("#33333380"));
    expect(recolorMoleculeSvgToEffectIndex(atomPath("#C4B5FD1a"))).toBe(atomPath("#2f4a8f1a"));
  });

  it("honours the legacy script's alpha decisions", () => {
    // recolorMolecules.mjs sent #666633 to #fcd34dcc (translucent) and grouped #ffffff99
    // with #333333 (ink) rather than with white.
    expect(recolorMoleculeSvgToEffectIndex(atomPath("#666633"))).toBe(atomPath("#9a7d20cc"));
    expect(recolorMoleculeSvgToEffectIndex(atomPath("#FCD34DCC"))).toBe(atomPath("#9a7d20cc"));
    expect(recolorMoleculeSvgToEffectIndex(atomPath("#ffffff99"))).toBe(atomPath("#33333399"));
    expect(recolorMoleculeSvgToEffectIndex(atomPath("#FFFFFF"))).toBe(atomPath("#f6f5f1"));
  });

  it("expands shorthand hex notation", () => {
    expect(recolorMoleculeSvgToEffectIndex(atomPath("#000"))).toBe(atomPath("#333333"));
    expect(recolorMoleculeSvgToEffectIndex(atomPath("#f00"))).toBe(atomPath("#b0413e"));
    expect(recolorMoleculeSvgToEffectIndex(atomPath("#00f8"))).toBe(atomPath("#2f4a8f88"));
  });

  it("does not mangle a malformed run of hex digits", () => {
    const svg = atomPath("#f0abfc7");
    expect(recolorMoleculeSvgToEffectIndex(svg)).toBe(svg);
  });

  it("maps the legacy rgb() form", () => {
    expect(recolorMoleculeSvgToEffectIndex("<rect fill='rgb(51, 51, 153)' />")).toBe(
      "<rect fill='#2f4a8f' />",
    );
    expect(recolorMoleculeSvgToEffectIndex("<rect fill='rgb(0,0,0)' />")).toBe(
      "<rect fill='#333333' />",
    );
    expect(recolorMoleculeSvgToEffectIndex("<rect fill='rgb(1,2,3)' />")).toBe(
      "<rect fill='rgb(1,2,3)' />",
    );
    expect(recolorMoleculeSvgToEffectIndex("<rect fill='rgb(999,0,0)' />")).toBe(
      "<rect fill='rgb(999,0,0)' />",
    );
  });

  it("maps named colours only in a paint position", () => {
    expect(recolorMoleculeSvgToEffectIndex("<path style='stroke:black;fill:white' />")).toBe(
      "<path style='stroke:#333333;fill:#f6f5f1' />",
    );
    expect(recolorMoleculeSvgToEffectIndex("<path fill='RED' />")).toBe(
      "<path fill='#b0413e' />",
    );
    expect(recolorMoleculeSvgToEffectIndex("<stop stop-color: white />")).toBe(
      "<stop stop-color: #f6f5f1 />",
    );
    // `stroke-width` shares the prefix but is not a paint property.
    expect(recolorMoleculeSvgToEffectIndex("<path style='stroke-width:1.1px' />")).toBe(
      "<path style='stroke-width:1.1px' />",
    );
  });

  it("handles an empty document", () => {
    expect(recolorMoleculeSvgToEffectIndex("")).toBe("");
  });
});

describe("resolved molecule colorways", () => {
  const svg = bondPath("#F0ABFC");

  it("defaults to the publication's native colorway", () => {
    expect(resolveMoleculeColorway(null, SITE_FLAVOR_CONFIGS.dosewiki)).toBe("brand");
    expect(resolveMoleculeColorway(null, SITE_FLAVOR_CONFIGS.effectindex)).toBe("pro-light");
  });

  it("honours either requested Pro scheme on both publications", () => {
    expect(resolveMoleculeColorway("pro-light", SITE_FLAVOR_CONFIGS.dosewiki)).toBe("pro-light");
    expect(resolveMoleculeColorway("pro-dark", SITE_FLAVOR_CONFIGS.effectindex)).toBe("pro-dark");
  });

  it("applies only the resolved Pro byte transforms", () => {
    expect(applyMoleculeColorway(svg, "brand")).toBe(svg);
    expect(applyMoleculeColorway(svg, "pro-light")).toBe(
      recolorMoleculeSvgToEffectIndex(svg, "light"),
    );
    expect(applyMoleculeColorway(svg, "pro-dark")).toBe(
      recolorMoleculeSvgToEffectIndex(svg, "dark"),
    );
  });
});

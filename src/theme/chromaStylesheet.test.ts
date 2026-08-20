import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_ACCENT_PRO_SEEDS } from "./accents";
import { authoredLevel, proAccentRepresentativeSeed } from "./chromaMath";
import { paletteTokenRole } from "./paletteOwnership";
import {
  CHROMA_STYLESHEET_PATH,
  buildChromaLevels,
  buildChromaStylesheetCss,
  wrapChromaValue,
} from "./chromaStylesheet";
import chromaManifest from "./appearanceChroma.generated.json";

describe("chroma value wrapping", () => {
  const GAIN = "--g";
  const HUE = "--h";
  const SHIFT = "calc(h + var(--h, 0deg))";

  it("wraps chromatic literals and leaves achromatic ones alone, across the value grammar", () => {
    const { text, wrapped } = wrapChromaValue(
      "color-mix(in srgb, #a5f3fc 24%, rgb(255 255 255))",
      GAIN,
      HUE,
    );
    expect(wrapped).toBe(1);
    expect(text).toBe(
      `color-mix(in srgb, oklch(from #a5f3fc l calc(c * var(--g)) ${SHIFT}) 24%, rgb(255 255 255))`,
    );
  });

  it("rewrites the chroma and hue slots of a bare oklch literal in place", () => {
    // The bare hue is a number, which cannot meet an angle inside calc(), so
    // it is given its unit before the shift is added.
    expect(wrapChromaValue("oklch(14% 0.025 318)", GAIN, HUE).text).toBe(
      "oklch(14% calc(0.025 * var(--g)) calc(318deg + var(--h, 0deg)))",
    );
    // Alpha channel rides along untouched.
    expect(wrapChromaValue("oklch(46% 0.12 318 / 0.06)", GAIN, HUE).text).toBe(
      "oklch(46% calc(0.12 * var(--g)) calc(318deg + var(--h, 0deg)) / 0.06)",
    );
    // Achromatic oklch stays byte-identical: a grey must not pick up colour
    // under a gain or a rotation.
    expect(wrapChromaValue("oklch(15% 0.004 250)", GAIN, HUE)).toEqual({
      text: "oklch(15% 0.004 250)",
      wrapped: 0,
    });
  });

  it("parenthesises existing relative-colour components before rewriting them", () => {
    // calc(c + 0.008) * gain must not become calc(c + 0.008 * gain), and the
    // relative h keyword takes the shift the same way.
    expect(
      wrapChromaValue(
        "oklch(from oklch(15.5% 0.037 318) calc(l + 0.05) calc(c + 0.008) h)",
        GAIN,
        HUE,
      ).text,
    ).toBe(
      "oklch(from oklch(15.5% 0.037 318) calc(l + 0.05) calc((c + 0.008) * var(--g)) calc(h + var(--h, 0deg)))",
    );
    // An alpha tail after the hue component survives, and a calc() hue is
    // parenthesised whole before the shift lands.
    expect(
      wrapChromaValue("oklch(from #a5f3fc l c calc(h + 4) / 0.5)", GAIN, HUE).text,
    ).toBe("oklch(from #a5f3fc l calc(c * var(--g)) calc((h + 4) + var(--h, 0deg)) / 0.5)");
  });

  it("reports zero wraps for values with nothing chromatic, so callers can drop them", () => {
    expect(wrapChromaValue("2.04rem", GAIN, HUE).wrapped).toBe(0);
    expect(wrapChromaValue("0 0 #0000", GAIN, HUE).wrapped).toBe(0);
    expect(wrapChromaValue("rgb(0 0 0 / 0.4)", GAIN, HUE).wrapped).toBe(0);
  });
});

describe("generated chroma stylesheet", () => {
  const css = readFileSync(resolve(process.cwd(), CHROMA_STYLESHEET_PATH), "utf8");
  const built = buildChromaStylesheetCss();

  const NOT_PRO_GUARD = ':where(:not([data-visual-style="pro"]))';

  /** Selector/body pairs, so assertions can speak about one block at a time. */
  const blocks = [...built.matchAll(/(html[^{]+)\{([^}]*)\}/g)].map((match) => ({
    selectors: match[1]!.trim(),
    body: match[2]!,
  }));
  /** The Pro half: every block without the Fun guard is keyed to Pro. */
  const proBlocks = blocks.filter((block) => !block.selectors.includes(NOT_PRO_GUARD));

  it("matches the builder byte for byte", () => {
    expect(css).toBe(built);
  });

  it("keeps the generated manifest in step with the stylesheet and definitions", () => {
    expect(chromaManifest.levels).toEqual(buildChromaLevels());
  });

  it("never names a semantic token: the safety ramp cannot desaturate or rotate", () => {
    for (const match of built.matchAll(/(--[a-z0-9-]+):/g)) {
      const token = match[1]!;
      if (token.startsWith("--dw-")) continue; // the axes' own level/hue/gain properties
      expect(paletteTokenRole(token), token).not.toBe("semantic");
    }
  });

  it("keys every block to the base palette and gates it on the engage attribute", () => {
    // The colourway vocabulary is retired: no selector may *equal*-match a
    // data-surface/data-accent value. The :not() forms remain for specificity
    // parity with the base sheets.
    expect(built).not.toContain('[data-surface="');
    expect(built).not.toContain('[data-accent="');
    for (const match of built.matchAll(/^html[^\s{]+/gm)) {
      expect(match[0]).toContain("[data-chroma]");
      // Every selector wears exactly one style key: the Fun :where() guard the
      // base sheets use, or the bare Pro attribute — never neither, never both.
      const bare = match[0].split(NOT_PRO_GUARD).join("");
      expect(match[0].includes(NOT_PRO_GUARD), match[0]).not.toBe(
        bare.includes('[data-visual-style="pro"]'),
      );
    }
  });

  it("emits one gain per block, derived from the base palette's own authored level", () => {
    const levels = buildChromaLevels();
    const surfaceLevels = Object.values(levels.surfaces);
    const accentLevels = Object.values(levels.accents);
    expect(surfaceLevels).toHaveLength(1);
    expect(accentLevels).toHaveLength(1);
    for (const theme of ["dark", "light"] as const) {
      const denominator = surfaceLevels[0]![theme].toFixed(4);
      expect(built).toContain(
        `--dw-surface-gain: calc(var(--dw-surface-level, ${denominator}) / ${denominator});`,
      );
    }
    const accentDenominator = accentLevels[0]!.toFixed(4);
    expect(built).toContain(
      `--dw-accent-gain: calc(var(--dw-accent-level, ${accentDenominator}) / ${accentDenominator});`,
    );
  });

  it("rotates every block through its own axis's hue property, and never the other's", () => {
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const axis = block.body.includes("--dw-surface-gain") ? "surface" : "accent";
      expect(block.body, block.selectors).toContain(`var(--dw-${axis}-hue, 0deg)`);
      const other = axis === "surface" ? "accent" : "surface";
      expect(block.body, block.selectors).not.toContain(`--dw-${other}-`);
    }
  });

  it("emits a Pro block per scheme for the base accent, keyed to the Pro ramp's own level", () => {
    for (const theme of ["dark", "light"] as const) {
      const selector = `html[data-chroma]:not([data-accent])[data-theme="${theme}"][data-visual-style="pro"]`;
      const block = proBlocks.find((candidate) => candidate.selectors === selector);
      expect(block, selector).toBeDefined();
      // The denominator is the Pro ramp's representative seed at its own
      // level — the same pick the slider rail renders, per scheme.
      const denominator = authoredLevel(
        proAccentRepresentativeSeed(BASE_ACCENT_PRO_SEEDS, theme)!,
      ).toFixed(4);
      expect(block!.body).toContain(
        `--dw-accent-gain: calc(var(--dw-accent-level, ${denominator}) / ${denominator});`,
      );
      // Only the accent seeds may appear: the gain, then --ei-* wraps. The
      // achromatic ink --ei-on-accent is dropped, not restated.
      expect(block!.body).toContain("--ei-accent:");
      expect(block!.body).not.toContain("--ei-on-accent");
      for (const match of block!.body.matchAll(/(--[a-z0-9-]+):/g)) {
        expect(match[1], selector).toMatch(/^--(dw-accent-gain$|ei-)/);
      }
    }
    // Nothing beyond those: one accent, two schemes.
    expect(proBlocks).toHaveLength(2);
  });

  it("emits no Pro surface block: Pro's one charcoal family is effectively achromatic", () => {
    // Decided from the authored literals in pro-theme.css (see the note in
    // buildChromaStylesheetCss): dark seeds are pure grey, light seeds carry
    // only a whisper of warmth — the old Graphite situation, so both surface
    // sliders stay disabled on Pro instead of ramping or rotating a trace tint.
    for (const block of proBlocks) {
      expect(block.selectors).not.toContain("data-surface");
      expect(block.body).not.toContain("--dw-surface-gain");
    }
  });
});

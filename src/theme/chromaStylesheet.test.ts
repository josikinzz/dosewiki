import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENTS, BASE_ACCENT_ID } from "./accents";
import { authoredLevel, proAccentRepresentativeSeed } from "./chromaMath";
import { paletteTokenRole } from "./paletteOwnership";
import { SURFACES } from "./surfaces";
import {
  CHROMA_STYLESHEET_PATH,
  buildChromaLevels,
  buildChromaStylesheetCss,
  wrapChromaValue,
} from "./chromaStylesheet";
import chromaManifest from "./appearanceChroma.generated.json";

describe("chroma value wrapping", () => {
  const GAIN = "--g";

  it("wraps chromatic literals and leaves achromatic ones alone, across the value grammar", () => {
    const { text, wrapped } = wrapChromaValue(
      "color-mix(in srgb, #a5f3fc 24%, rgb(255 255 255))",
      GAIN,
    );
    expect(wrapped).toBe(1);
    expect(text).toBe(
      "color-mix(in srgb, oklch(from #a5f3fc l calc(c * var(--g)) h) 24%, rgb(255 255 255))",
    );
  });

  it("multiplies the chroma slot of a bare oklch literal in place", () => {
    expect(wrapChromaValue("oklch(14% 0.025 318)", GAIN).text).toBe(
      "oklch(14% calc(0.025 * var(--g)) 318)",
    );
    // Alpha channel rides along untouched.
    expect(wrapChromaValue("oklch(46% 0.12 318 / 0.06)", GAIN).text).toBe(
      "oklch(46% calc(0.12 * var(--g)) 318 / 0.06)",
    );
    // Achromatic oklch stays byte-identical.
    expect(wrapChromaValue("oklch(15% 0.004 250)", GAIN)).toEqual({
      text: "oklch(15% 0.004 250)",
      wrapped: 0,
    });
  });

  it("parenthesises an existing relative-colour chroma before multiplying", () => {
    // calc(c + 0.008) * gain must not become calc(c + 0.008 * gain).
    expect(
      wrapChromaValue("oklch(from oklch(15.5% 0.037 318) calc(l + 0.05) calc(c + 0.008) h)", GAIN)
        .text,
    ).toBe(
      "oklch(from oklch(15.5% 0.037 318) calc(l + 0.05) calc((c + 0.008) * var(--g)) h)",
    );
  });

  it("reports zero wraps for values with nothing chromatic, so callers can drop them", () => {
    expect(wrapChromaValue("2.04rem", GAIN).wrapped).toBe(0);
    expect(wrapChromaValue("0 0 #0000", GAIN).wrapped).toBe(0);
    expect(wrapChromaValue("rgb(0 0 0 / 0.4)", GAIN).wrapped).toBe(0);
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

  it("never names a semantic token: the safety ramp cannot desaturate", () => {
    for (const match of built.matchAll(/(--[a-z0-9-]+):/g)) {
      const token = match[1]!;
      if (token.startsWith("--dw-")) continue; // the axis's own level/gain properties
      expect(paletteTokenRole(token), token).not.toBe("semantic");
    }
  });

  it("skips the achromatic colourways and gates every block on the engage attribute", () => {
    expect(built).not.toContain('[data-surface="graphite"]');
    expect(built).not.toContain('[data-accent="neutral"]');
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

  it("emits one gain per block, derived from the colourway's own authored level", () => {
    const levels = buildChromaLevels();
    for (const surface of SURFACES) {
      if (surface.achromatic) continue;
      const denominator = levels.surfaces[surface.id]!.dark.toFixed(4);
      expect(built).toContain(
        `--dw-surface-gain: calc(var(--dw-surface-level, ${denominator}) / ${denominator});`,
      );
    }
    for (const accent of ACCENTS) {
      if (accent.achromatic) continue;
      const denominator = levels.accents[accent.id]!.toFixed(4);
      expect(built).toContain(
        `--dw-accent-gain: calc(var(--dw-accent-level, ${denominator}) / ${denominator});`,
      );
    }
  });

  it("emits a Pro block per chromatic accent and scheme, keyed to the Pro ramp's own level", () => {
    const chromatic = ACCENTS.filter((accent) => !accent.achromatic);
    for (const accent of chromatic) {
      for (const theme of ["dark", "light"] as const) {
        const axis =
          accent.id === BASE_ACCENT_ID ? ":not([data-accent])" : `[data-accent="${accent.id}"]`;
        const selector = `html[data-chroma]${axis}[data-theme="${theme}"][data-visual-style="pro"]`;
        const block = proBlocks.find((candidate) => candidate.selectors === selector);
        expect(block, selector).toBeDefined();
        // The denominator is the Pro ramp's representative seed at its own
        // level — the same pick the slider rail renders, per scheme.
        const denominator = authoredLevel(proAccentRepresentativeSeed(accent, theme)!).toFixed(4);
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
    }
    // Nothing beyond those: Neutral is achromatic and emits no Pro block.
    expect(proBlocks).toHaveLength(chromatic.length * 2);
  });

  it("emits no Pro surface block: Pro's one charcoal family is effectively achromatic", () => {
    // Decided from the authored literals in pro-theme.css (see the note in
    // buildChromaStylesheetCss): dark seeds are pure grey, light seeds carry
    // only a whisper of warmth — Graphite's situation, so the surface slider
    // stays disabled on Pro instead of ramping a trace tint.
    for (const block of proBlocks) {
      expect(block.selectors).not.toContain("data-surface");
      expect(block.body).not.toContain("--dw-surface-gain");
    }
  });
});

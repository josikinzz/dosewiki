import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_ACCENT_PRO_SEEDS } from "./accents";
import { BASE_SURFACE_PRO_SEEDS } from "./surfaces";
import { authoredLevel, proAccentRepresentativeSeed } from "./chromaMath";
import { paletteTokenRole } from "./paletteOwnership";
import {
  CHROMA_STYLESHEET_PATH,
  PRO_SURFACE_CHROMA_DELTA,
  buildChromaLevels,
  buildChromaStylesheetCss,
  wrapAdditiveChromaValue,
  wrapChromaValue,
} from "./chromaStylesheet";
import chromaManifest from "./appearanceChroma.generated.json";
import { CHROMA_SUPPORT_PROBE } from "./appearanceChroma";

describe("chroma value wrapping", () => {
  const GAIN = "--g";
  const HUE = "--h";
  const SHIFT = "calc(h + var(--h, 0))";

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
    // The bare hue is a number and must STAY a number: inside calc() the hue
    // resolves as <number>, and mixing in an <angle> invalidates the whole
    // declaration at computed-value time (the page paints transparent).
    expect(wrapChromaValue("oklch(14% 0.025 318)", GAIN, HUE).text).toBe(
      "oklch(14% calc(0.025 * var(--g)) calc(318 + var(--h, 0)))",
    );
    // Alpha channel rides along untouched.
    expect(wrapChromaValue("oklch(46% 0.12 318 / 0.06)", GAIN, HUE).text).toBe(
      "oklch(46% calc(0.12 * var(--g)) calc(318 + var(--h, 0)) / 0.06)",
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
      "oklch(from oklch(15.5% 0.037 318) calc(l + 0.05) calc((c + 0.008) * var(--g)) calc(h + var(--h, 0)))",
    );
    // An alpha tail after the hue component survives, and a calc() hue is
    // parenthesised whole before the shift lands.
    expect(
      wrapChromaValue("oklch(from #a5f3fc l c calc(h + 4) / 0.5)", GAIN, HUE).text,
    ).toBe("oklch(from #a5f3fc l calc(c * var(--g)) calc((h + 4) + var(--h, 0)) / 0.5)");
  });

  it("reports zero wraps for values with nothing chromatic, so callers can drop them", () => {
    expect(wrapChromaValue("2.04rem", GAIN, HUE).wrapped).toBe(0);
    expect(wrapChromaValue("0 0 #0000", GAIN, HUE).wrapped).toBe(0);
    expect(wrapChromaValue("rgb(0 0 0 / 0.4)", GAIN, HUE).wrapped).toBe(0);
  });

  it("additive wrapping tints achromatic literals too: that is its whole point", () => {
    const DELTA = "0.05 * var(--l, 0)";
    // A pure grey — untouchable under a gain — takes the additive delta and
    // the standard shift, and the unset-var state (level 0, hue 0) resolves
    // the authored literal exactly: c + 0, h + 0.
    expect(wrapAdditiveChromaValue("#131313", DELTA, HUE)).toEqual({
      text: `oklch(from #131313 l calc(c + 0.05 * var(--l, 0)) ${SHIFT})`,
      wrapped: 1,
    });
    // rgb() with an alpha channel: relative colour syntax carries the origin's
    // alpha when the alpha slot is omitted, so the scrim stays translucent.
    expect(wrapAdditiveChromaValue("rgb(19 19 19 / 0.88)", DELTA, HUE)).toEqual({
      text: `oklch(from rgb(19 19 19 / 0.88) l calc(c + 0.05 * var(--l, 0)) ${SHIFT})`,
      wrapped: 1,
    });
    // Nothing colour-shaped still reports zero wraps.
    expect(wrapAdditiveChromaValue("2.04rem", DELTA, HUE).wrapped).toBe(0);
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

  it("wraps every block in @supports on the exact grammar the runtime probes", () => {
    // Safari 16.4 to 17.x types the relative-colour h channel as an angle, so calc(h + shift)
    // is invalid there and every rewritten token would blank its consumer; 16.3 and older
    // lack the syntax. The sheet guards itself with the same expression the bootstrap and
    // the provider ask CSS.supports about, so the server-rendered link is inert there.
    const wrapper = `@supports (color: ${CHROMA_SUPPORT_PROBE}) {\n`;
    const opening = built.indexOf(wrapper);
    expect(opening).toBeGreaterThan(0);
    expect(built.search(/^html\[/m)).toBeGreaterThan(opening);
    expect(built.match(/^@supports/gm)).toHaveLength(1);
    expect(built.endsWith("}\n}\n")).toBe(true);
    // The probe is itself a bare-number hue sum, the very form the sheet depends on.
    expect(CHROMA_SUPPORT_PROBE).toBe("oklch(from red l c calc(h + 1))");
  });

  it("emits one gain per gained block, derived from the base palette's own authored level", () => {
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
      const axis = block.body.includes("--dw-surface-") ? "surface" : "accent";
      expect(block.body, block.selectors).toContain(`var(--dw-${axis}-hue, 0)`);
      const other = axis === "surface" ? "accent" : "surface";
      expect(block.body, block.selectors).not.toContain(`--dw-${other}-`);
    }
  });

  it("never mixes an angle unit into a hue calc(): h is a <number> inside calc()", () => {
    // Regression: hue shifts were once emitted as `40deg`, which made every
    // wrapped declaration invalid at computed-value time — surfaces painted
    // transparent and the logo gradient vanished. calc(<number> + <angle>)
    // is not a valid CSS sum, so no hue slot may carry a deg unit.
    for (const match of built.matchAll(/calc\(([^)]*(?:\([^)]*\))?[^)]*) \+ var\(--dw-(?:surface|accent)-hue[^)]*\)\)/g)) {
      expect(match[0], match[0]).not.toContain("deg");
    }
    expect(built).not.toMatch(/--dw-(?:surface|accent)-hue, 0deg/);
  });

  it("emits a Pro block per scheme for the base accent, keyed to the Pro ramp's own level", () => {
    const proAccentBlocks = proBlocks.filter((block) => block.selectors.includes("data-accent"));
    for (const theme of ["dark", "light"] as const) {
      const selector = `html[data-chroma]:not([data-accent])[data-theme="${theme}"][data-visual-style="pro"]`;
      const block = proAccentBlocks.find((candidate) => candidate.selectors === selector);
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
    // Nothing beyond those on the accent axis: one accent, two schemes. The
    // surface's Pro half is asserted below on its own additive terms.
    expect(proAccentBlocks).toHaveLength(2);
  });

  it("emits an additive Pro surface block per scheme: charcoal has no gain denominator", () => {
    // Pro's authored surface family is (near-)achromatic — measured through
    // chromaMath, the dark seeds are pure grey and the light ones a trace of
    // warmth — so the gain grammar `level ÷ authored` has nothing to divide
    // by. The Pro half ADDS chroma instead: every seed's chroma slot gains
    // + K × var(--dw-surface-level, 0), K per scheme (PRO_SURFACE_CHROMA_DELTA),
    // and unset variables — or Pro's own default level 0 — resolve c + 0 and
    // h + 0: the authored charcoal, byte-visually unchanged.
    const proSurfaceBlocks = proBlocks.filter((block) =>
      block.selectors.includes("data-surface"),
    );
    for (const theme of ["dark", "light"] as const) {
      const selector = `html[data-chroma]:not([data-surface])[data-theme="${theme}"][data-visual-style="pro"]`;
      const block = proSurfaceBlocks.find((candidate) => candidate.selectors === selector);
      expect(block, selector).toBeDefined();
      // No block-local gain: the level variable is read inline, with an inert
      // 0 fallback, in every chroma slot.
      expect(block!.body).not.toContain("--dw-surface-gain");
      const delta = `${PRO_SURFACE_CHROMA_DELTA[theme].toFixed(4)} * var(--dw-surface-level, 0)`;
      const seeds = BASE_SURFACE_PRO_SEEDS[theme];
      for (const [token, literal] of Object.entries(seeds)) {
        expect(block!.body, `${selector} ${token}`).toContain(
          `  ${token}: oklch(from ${literal} l calc(c + ${delta}) calc(h + var(--dw-surface-hue, 0)));`,
        );
      }
      // Only the surface-material seeds may appear: no ink ramp, no chrome
      // rail, no WCAG-floored control outline — those are structurally absent
      // from the seed map (see BASE_SURFACE_PRO_SEEDS).
      for (const match of block!.body.matchAll(/(--[a-z0-9-]+):/g)) {
        expect(Object.keys(seeds), selector).toContain(match[1]);
      }
    }
    expect(proSurfaceBlocks).toHaveLength(2);
  });

  it("keeps the Pro surface seed map pinned to the authored pro-theme.css literals", () => {
    // BASE_SURFACE_PRO_SEEDS is a copy of authored declarations, not a second
    // palette: this is the guard that fails when pro-theme.css moves a seed
    // and the copy keeps the stale value (or the other way round). Each seed
    // is declared exactly twice in the sheet — the light/root palette block
    // first, the dark seed block later, winning on source order — so the
    // first declaration is the light value and the last the dark one.
    const skin = readFileSync(resolve(process.cwd(), "src/styles/pro-theme.css"), "utf8");
    for (const [name, lightValue] of Object.entries(BASE_SURFACE_PRO_SEEDS.light)) {
      const declarations = [...skin.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))].map(
        (match) => match[1]!.trim(),
      );
      expect(declarations, name).toHaveLength(2);
      expect(declarations[0], `${name} (light)`).toBe(lightValue);
      expect(declarations[1], `${name} (dark)`).toBe(BASE_SURFACE_PRO_SEEDS.dark[name]);
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  accentDefaultProBlockSelector,
  accentFunBlockSelector,
  accentProBlockSelector,
} from "@/theme/accentStylesheet";
import { rootSelector } from "./accentAppearanceGrid";

/**
 * The measuring apparatus, measured.
 *
 * Every assertion in the four `accents.*.test.ts` suites reads the resolved grid this fixture
 * builds, which means the fixture's cascade model is the one thing in the axis that nothing else
 * checks. Most of it fails loudly when it is wrong — a selector shape it cannot parse drops
 * declarations, and a dropped declaration usually shows up as a token resolving to the wrong
 * colour somewhere.
 *
 * The default accent's Pro block is the exception, and it is why this file exists. It is keyed by
 * `:not([data-accent])` rather than by a value, so a parser that rejects the bare `:not()` form
 * drops the block for EVERY Pro grid point at once, and the grid then measures `pro-theme.css`'s
 * authored teal — a self-consistent, entirely wrong picture that no contrast, immunity or
 * containment assertion can distinguish from the truth. The suite would pass green while the
 * browser rendered plum. So the parser's treatment of that shape is asserted here directly,
 * against the selector the generator actually emits rather than a copy of it.
 */

describe("root selector parsing", () => {
  it("gives a bare :not([attr]) the specificity of its argument", () => {
    // CSS Selectors 4: `:not()` contributes nothing itself and takes the specificity of its most
    // specific argument, so one attribute inside it counts as one attribute. That arithmetic is
    // the whole reason the generator emits the bare form: it puts the default accent's Pro block
    // at (0,3,1), level with every named accent's Pro block and a step above the Pro palette it
    // overrides, so no import order decides the winner.
    const parsed = rootSelector(accentDefaultProBlockSelector("light"));

    expect(parsed, `${accentDefaultProBlockSelector("light")} is not parsed as a root selector`)
      .not.toBeNull();
    expect(parsed!.specificity).toEqual([0, 3, 1]);
  });

  it("keeps :where(:not([attr])) at zero", () => {
    // The other shape in the sheet, and the contrast that makes the pair worth parsing
    // separately. A Fun block names two attributes and wears the guard, and it has to stay at
    // (0,2,1) — level with a generated colourway block, which is what lets it re-seat a colourway
    // the reader also has saved by winning the tie on source order.
    const parsed = rootSelector(accentFunBlockSelector("blue", "dark"));

    expect(parsed).not.toBeNull();
    expect(parsed!.specificity).toEqual([0, 2, 1]);
  });

  it("ranks the default's Pro block level with a named accent's and above the Pro palette", () => {
    // Stated as the comparison the cascade actually performs, rather than as three separate
    // numbers: the default has to tie the accent it is a peer of and beat the palette it is
    // overriding. `html[data-visual-style="pro"][data-theme="light"]` is the shape pro-theme.css
    // uses for its own per-scheme blocks.
    const defaultPro = rootSelector(accentDefaultProBlockSelector("light"))!;
    const namedPro = rootSelector(accentProBlockSelector("blue", "light"))!;
    const proPalette = rootSelector('html[data-visual-style="pro"][data-theme="light"]')!;

    expect(defaultPro.specificity).toEqual(namedPro.specificity);
    expect(defaultPro.specificity[1]).toBeGreaterThan(proPalette.specificity[1]);
  });

  it("matches a bare :not([attr]) only while the attribute is absent", () => {
    const parsed = rootSelector(accentDefaultProBlockSelector("dark"))!;

    expect(parsed.matches({ visualStyle: "pro", theme: "dark" })).toBe(true);
    // Present with any value — including the default's own id, which the bootstrap never writes —
    // and the block stops matching. That is the behaviour that keeps `data-accent="default"` out
    // of the sheet: there would be nothing for it to select.
    expect(parsed.matches({ visualStyle: "pro", theme: "dark", accent: "blue" })).toBe(false);
    expect(parsed.matches({ visualStyle: "pro", theme: "dark", accent: "default" })).toBe(false);
    // And the other two attributes still have to agree.
    expect(parsed.matches({ visualStyle: "pro", theme: "light" })).toBe(false);
    expect(parsed.matches({ visualStyle: "fun", theme: "dark" })).toBe(false);
  });

  it("still rejects the selector shapes it cannot model", () => {
    // A descendant, a class or an attribute the grid does not model cannot seed a page-wide
    // token, so the parser returns null rather than approximating it. Keeping this beside the new
    // `:not()` support is the point: widening the grammar must not widen it to everything.
    expect(rootSelector('html[data-visual-style="pro"] .app-header')).toBeNull();
    expect(rootSelector('html[data-site="effectindex"]')).toBeNull();
    expect(rootSelector(":root .theme-chrome-dark")).toBeNull();
  });
});

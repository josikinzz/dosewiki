import { describe, expect, it } from "vitest";

import {
  GRID,
  PRO_DARK_RAISED,
  contrastRatio,
  parseColor,
  ratio,
  toHex,
} from "@/test/fixtures/accentAppearanceGrid";

/**
 * The contrast floors, measured on the resolved grid rather than on the authored declarations.
 * The apparatus is `src/test/fixtures/accentAppearanceGrid.ts`; the seeds it measures are
 * pinned in `accents.test.ts`.
 *
 * The hue-rotation axis does not reopen these floors: `oklch` hue rotation at constant L and C
 * moves neither WCAG luminance-contrast side by more than gamut clamping does, and the chroma
 * axis only ever *reduces* chroma from the authored level measured here. What the floors
 * defend is the base ramp the rotations start from.
 */

const CANVAS_FLOOR = 4.5;
const ON_ACCENT_FLOOR = 4.5;
const PRO_DARK_LINK_BUDGET = 7.4;
const PRO_DARK_STRONG_BUDGET = 9.2;

/**
 * Every point on the grid clears 4.5:1 against its own canvas, with no exemption. That was not
 * true until the base accent got a Pro half, and the history is worth keeping because it is
 * the reason this file carries no exemption registry.
 *
 * `pro/light` used to be pinned at 3.12:1 and excused. The breached value was not this axis's:
 * it is `pro-theme.css`'s authored `--ei-accent: #3d9991`, which has measured 3.12:1 on paper
 * `#f6f5f1` for the whole life of that sheet, and dose.wiki inherited it by emitting no Pro
 * block. Fixing the authored declaration would repaint Effect Index, which is that
 * publication's decision rather than this axis's — so instead the base accent emits its own
 * Pro block, plum at Orchid's hue, measuring **4.5034:1**. The breach closes for every
 * dose.wiki reader, Effect Index keeps its teal byte for byte because it never imports the
 * accent sheet, and the floor below applies unconditionally. The margin is thin because the
 * derivation's ΔL was minimal by construction; a wider one would darken hairlines and hover
 * edges for no accessibility gain — and the thinness is what makes an unconditional floor the
 * right assertion: there is no slack left to hide a regression in.
 */
describe("accent floors", () => {
  it.each(GRID)("keeps $label above the canvas floor", ({ label, tokens }) => {
    const accentColour = parseColor(tokens["--theme-accent"]);
    const canvas = parseColor(tokens["--theme-body-bg"]);
    const measured = contrastRatio(accentColour, canvas);

    expect(
      measured,
      `${label}: --theme-accent ${toHex(accentColour)} on canvas ${toHex(canvas)} measures ` +
        `${ratio(measured)}, below the ${CANVAS_FLOOR} floor`,
    ).toBeGreaterThanOrEqual(CANVAS_FLOOR);
  });

  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "keeps ink legible on $label's accent fill",
    ({ label, tokens }) => {
      // --ei-on-accent is the ink ON a filled accent, so it flips with the fill rather than
      // with the accent: near-white over a dark light-scheme fill, near-black over a light
      // dark-scheme one. Copying it between ramps without measuring is how a filled CTA ends
      // up with white text on a pale fill.
      const ink = parseColor(tokens["--ei-on-accent"]);
      const fill = parseColor(tokens["--ei-accent-strong"]);
      const measured = contrastRatio(ink, fill);

      expect(
        measured,
        `${label}: --ei-on-accent ${toHex(ink)} over --ei-accent-strong ${toHex(fill)} ` +
          `measures ${ratio(measured)}`,
      ).toBeGreaterThanOrEqual(ON_ACCENT_FLOOR);
    },
  );

  it.each(GRID.filter((entry) => entry.visualStyle === "pro" && entry.theme === "dark"))(
    "clears Pro's own stated dark budgets for $label",
    ({ label, tokens }) => {
      // pro-theme.css states 7.4:1 for the base link and 9.2:1 for the strong one. Those
      // numbers were authored against the raised charcoal surface, not the page: the canvas is
      // darker, so the same authored pair measures 9.10:1 and 11.22:1 there and the budgets
      // would be slack. Measuring on the tighter ground is what keeps them a real floor.
      const ground = parseColor(PRO_DARK_RAISED);
      const link = contrastRatio(parseColor(tokens["--ei-accent"]), ground);
      const strong = contrastRatio(parseColor(tokens["--ei-accent-strong"]), ground);

      expect(link, `${label}: --ei-accent on ${PRO_DARK_RAISED} measures ${ratio(link)}`)
        .toBeGreaterThanOrEqual(PRO_DARK_LINK_BUDGET);
      expect(
        strong,
        `${label}: --ei-accent-strong on ${PRO_DARK_RAISED} measures ${ratio(strong)}`,
      ).toBeGreaterThanOrEqual(PRO_DARK_STRONG_BUDGET);
    },
  );
});

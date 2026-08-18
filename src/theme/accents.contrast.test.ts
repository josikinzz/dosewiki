import { describe, expect, it } from "vitest";

import {
  GRID,
  PRO_DARK_RAISED,
  SCHEMES,
  SWATCH_TOLERANCE,
  contrastRatio,
  deltaEok,
  parseColor,
  ratio,
  toHex,
} from "@/test/fixtures/accentAppearanceGrid";

/**
 * The contrast floors, measured on the resolved grid rather than on the authored declarations.
 * The apparatus is `src/test/fixtures/accentAppearanceGrid.ts`; the table it measures is pinned
 * in `accents.test.ts`.
 */

const CANVAS_FLOOR = 4.5;
const ON_ACCENT_FLOOR = 4.5;
const PRO_DARK_LINK_BUDGET = 7.4;
const PRO_DARK_STRONG_BUDGET = 9.2;

/**
 * Every point on the grid clears 4.5:1 against its own canvas, with no exemption. That was not
 * true until the default accent got a Pro half, and the history is worth keeping because it is
 * the reason this file no longer carries an exemption registry at all.
 *
 * `default/pro/light` used to be pinned at 3.12:1 and excused. The breached value was not the
 * accent axis's: it is `pro-theme.css`'s authored `--ei-accent: #3d9991`, which has measured
 * 3.12:1 on paper `#f6f5f1` for the whole life of that sheet, and the default accent inherited it
 * by emitting no Pro block. Fixing the authored declaration would repaint Effect Index, which is
 * that publication's decision rather than this axis's — so instead the default now emits its own
 * Pro block, plum at Orchid's hue, measuring **4.5034:1**. The breach closes for every dose.wiki
 * reader, Effect Index keeps its teal byte for byte because it never imports the accent sheet,
 * and the floor below applies to all twenty-eight points unconditionally.
 *
 * Every accent pays for the light half the same way: the ramp is shifted down by one uniform ΔL
 * until the base seed lifts over 4.5:1, and no further. Measured on paper — Default 4.50:1,
 * Blue 4.63:1, Green 4.51:1, Red 4.54:1, Amber 4.51:1, Neutral 4.53:1, Teal 4.55:1. The margins
 * are thin because the shift is minimal by construction; a wider one would darken hairlines and
 * hover edges for no accessibility gain. Default's is the thinnest at 0.0034, which is what makes
 * an unconditional floor the right assertion here: there is no slack left to hide a regression in.
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
      // dark-scheme one. Copying it between accents without measuring is how a filled CTA ends
      // up with white text on a pale blue.
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

  it.each(SCHEMES)("keeps the achromatic accent off Pro's own neutral ramp in %s", (theme) => {
    // Neutral is the one accent whose Fun colourway has no hue to rotate, so what makes its Pro
    // half an accent rather than a grey has to be measured, not assumed. Pro's canvas, ink ramp,
    // borders and levelling rows are ALL neutral, and they are neutral in two ways: exactly
    // achromatic (ink, levelling, the dark surfaces) or warm (paper, surfaces, borders sit at
    // hue 84-97, chroma <= 0.010). Neutral's ramp is cool — hue ~250, ~155 degrees opposite —
    // at several times that chroma, and that opposition is the whole of its visibility.
    //
    // The threshold is SWATCH_TOLERANCE deliberately: the same 0.02 the swatch assertion treats
    // as one just-noticeable difference. An accent step closer than one JND to the nearest Pro
    // neutral is not an accent, it is a member of the grey ramp.
    const point = GRID.find((entry) => entry.label === `neutral/pro/${theme}`);
    expect(point, `neutral/pro/${theme} is not a point on the grid`).toBeDefined();

    const NEUTRAL_RAMPS = /^--ei-(?:ink|level)(?:-\d)?(?:-mark)?$|^--ei-(?:border|border-strong)$/;
    const neutrals = Object.keys(point!.tokens).filter((token) => NEUTRAL_RAMPS.test(token));
    expect(neutrals.length, "Pro's neutral ramps are no longer where this looks").toBeGreaterThan(
      10,
    );

    for (const step of ["--ei-accent", "--ei-accent-strong", "--ei-accent-soft", "--ei-accent-muted"]) {
      const accentStep = parseColor(point!.tokens[step]);
      const nearest = neutrals
        .map((token) => ({ token, distance: deltaEok(accentStep, parseColor(point!.tokens[token])) }))
        .sort((a, b) => a.distance - b.distance)[0];

      expect(
        nearest.distance,
        `neutral/pro/${theme}: ${step} ${toHex(accentStep)} is ΔEok ` +
          `${nearest.distance.toFixed(3)} from ${nearest.token} — inside one JND of Pro's own grey`,
      ).toBeGreaterThan(SWATCH_TOLERANCE);
    }
  });
});

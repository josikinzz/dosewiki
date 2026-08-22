import { describe, expect, it } from "vitest";

import {
  GRID,
  type Rgb,
  composite,
  contrastRatio,
  parseColor,
  parseColorWithAlpha,
  ratio,
  toHex,
} from "@/test/fixtures/accentAppearanceGrid";

/**
 * The theme ramp's contrast floors, measured on the resolved cascade.
 *
 * `accents.contrast.test.ts` measures one token against one ground: the accent on the canvas. That
 * is the axis it owns, and it is a small fraction of the colour a reader actually reads. Everything
 * else — the four ink steps, six surfaces they land on, the semantic ink-on-fill pairs, the named
 * chips and phase pills, and the field hairlines — was unmeasured, and a browser audit of 6,148
 * rendered text nodes across 76 resolved appearance states found breaches in every one of those
 * groups. This suite is the arithmetic half of that audit, kept so the breaches cannot come back.
 *
 * **The thresholds here are the WCAG 2.1 floors, not a snapshot of today's values.** That is the
 * whole discipline of the file. A pinned-current-value suite passes forever and protects nothing:
 * it ratifies whatever the sheet happens to say. So `TEXT_FLOOR` is 4.5 because SC 1.4.3 says 4.5
 * for body text, and `BOUNDARY_FLOOR` is 3 because SC 1.4.11 says 3 for a control's own boundary —
 * neither number was read off a measurement. A value that sits below one of them is a bug in the
 * stylesheet, and the correct response is to repaint the token, never to relax the constant.
 *
 * Two apparatus corrections in `accentAppearanceGrid.ts` are what make this measurable at all, and
 * both are the reason the defects survived so long:
 *
 * - `data-surface` is a modelled attribute, so the six named surface blocks resolve instead of
 *   dropping out of the cascade unmatched. Twenty-four appearance states — both halves of the axis,
 *   both schemes — went from unreachable to measured. An attribute that seeds a colourway and is
 *   missing from that map takes its whole sheet silently out of the model, which is a failure that
 *   reads as green.
 * - `parseColorWithAlpha` carries the fourth channel, so a translucent hairline is composited over
 *   the ground it is painted on rather than measured as if it were opaque. Fun's field borders were
 *   12–28% inks when the audit ran, measuring 1.3–1.5:1 composited against the 5–18:1 an
 *   alpha-blind parser reported; they are 36% and 76% now, and measure 3.15–3.49:1 across all 26
 *   Fun states. Pro's field borders are opaque and were not part of that repaint: they measure
 *   4.08:1 in dark and **1.76:1** in light, so the boundary block below still fails Pro light.
 *
 * ## What this suite provably cannot cover
 *
 * Green here is not green everywhere, and the gap is structural rather than accidental. After this
 * file first went green a browser pass re-measured 4,414 rendered text nodes across all 76 resolved
 * appearance states and found two real breaches the pair lists below simply did not name. Three
 * classes of ground stay outside the apparatus even now:
 *
 * 1. **Descendant selectors.** The resolver in `accentAppearanceGrid.ts` is root-only by design and
 *    rejects any selector with a descendant combinator — see its own header for why: a descendant
 *    block's ground depends on where the element sits in the DOM, which a cascade-only model cannot
 *    know. So the rail blocks `html[data-visual-style="pro"] .app-header` (`pro-theme.css`
 *    ~1349-1398) and `.app-footer` (~1526-1554), which re-point the whole text ramp and the accent
 *    family onto the chrome rails, are invisible here. They were measured only in a browser; the
 *    verified numbers, kept so a future reader has a baseline rather than a rumour:
 *    footer muted `#a6a6a6` 6.77:1 on the light rail `#1f1f1f` / 7.22:1 on the dark rail `#191919`;
 *    footer faint `#8a8a8a` 4.77:1 / 5.09:1; footer ghost `#767676` 3.63:1 / 3.87:1 against the 3:1
 *    decorative floor; header `--ei-on-dark-faint` `#9a9a9a` 4.83:1 on `#2e2e2e` / 5.86:1 on
 *    `#1f1f1f`; header ghost `#7d7d7d` 3.30:1 / 4.00:1. `--theme-section-heading` is on the same
 *    list for the same reason: the rails restate it because the html-level
 *    `var(--theme-accent-strong)` is substituted on `html` and inherited already-resolved, so
 *    rebinding accent-strong inside the rail cannot reach it. Before that restatement the header
 *    wordmark's `.wiki` painted the light scheme's page accent-strong `#652966` at **1.33:1** on
 *    the `#2e2e2e` bar (dark scheme `#f2a9f3`, 9.22:1, hid it); on the on-dark seed it measures
 *    `#e68be8` 5.96:1 light and `#e38fe4` 7.31:1 dark, both at the shipped default axes.
 * 2. **Gradients, and alpha over an image.** A ground that is a gradient or a translucent wash over
 *    photography has no single luminance to divide by, so it cannot be composited from tokens
 *    alone: the six Fun `--theme-semantic-*-badge-bg` fills, the frosted panels, and the media
 *    scrims. The Fun badge gradients were measured in a browser by evaluating both stops plus the
 *    4% white highlight, worst reading **7.91:1**.
 * 3. **Everything root-reachable, which is a pair-list problem and not an apparatus one.**
 *    `--theme-section-heading`, the accent family over the card surfaces, and the whole
 *    `--ei-level-*` family were all fully resolvable from the root the entire time; they went
 *    unmeasured because nobody listed them. All three are asserted below. The standing lesson is
 *    that this file's blind spot is its pair list, and the pair list is the one part that has to be
 *    extended by hand — 2,772 green cases said nothing about the 1.73:1 heading.
 */

const TEXT_FLOOR = 4.5;
/**
 * `--theme-text-ghost` is the one ink step that is not text in the 1.4.3 sense: it paints watermark
 * numerals, the dimmed half of a disabled control's label and similar decoration, always beside a
 * real ink step carrying the same information. It gets the 3:1 large-text/non-text floor rather
 * than an exemption, because "decorative" is not the same as "invisible" — a ghost step under 3:1
 * is a step nobody can see at all, which makes the decoration pointless as well as inaccessible.
 */
const GHOST_FLOOR = 3;
/**
 * SC 1.4.11: a control's own boundary needs 3:1 against its adjacent ground. This applies to the
 * field borders, which are what tells a reader where an input begins, and to nothing else in the
 * border layer — see the boundary block below for why the decorative hairlines are excluded.
 */
const BOUNDARY_FLOOR = 3;

/** Every surface an ink step is painted on, page down to field. */
const SURFACES = [
  "--theme-body-bg",
  "--theme-surface-soft",
  "--theme-surface-muted",
  "--theme-surface-strong",
  "--theme-menu-surface",
  "--theme-field-surface",
];

/** The four ink steps that carry text. `--theme-text-ghost` is measured separately, at 3:1. */
const TEXT_RAMP = [
  "--theme-text-primary",
  "--theme-text-secondary",
  "--theme-text-muted",
  "--theme-text-faint",
];

/** Semantic families that ship a two-step ink over a tinted fill. */
const SEMANTIC_FAMILIES = ["success", "warning", "danger", "evidence"];

/**
 * Ink and fill that are named as a pair by the token itself, so the pairing is not a guess: each
 * `-text` is only ever painted on its own `-bg`, and a reader hits all seven of these on an
 * ordinary article page.
 */
const NAMED_PAIRS: [ink: string, fill: string][] = [
  ["--theme-skip-link-text", "--theme-skip-link-bg"],
  ["--theme-autofill-text", "--theme-autofill-bg"],
  ["--theme-name-chip-text", "--theme-name-chip-bg"],
  ["--theme-search-highlight-text", "--theme-search-highlight-bg"],
  ["--theme-report-phase-onset-text", "--theme-report-phase-onset-bg"],
  ["--theme-report-phase-peak-text", "--theme-report-phase-peak-bg"],
  ["--theme-report-phase-offset-text", "--theme-report-phase-offset-bg"],
];

/**
 * Border and the surface it is drawn against. Both pairs identify a control's edge, which is what
 * puts them under 1.4.11; `--theme-border-subtle`, `--theme-divider` and `--theme-card-border` are
 * deliberately absent, because a card's edge identifies nothing a reader has to operate and 1.4.11
 * does not reach it. Asserting those would force decorative hairlines to 3:1 and repaint the whole
 * Fun surface stack for no accessibility gain.
 */
const BOUNDARY_PAIRS: [border: string, surface: string][] = [
  ["--theme-field-border", "--theme-field-surface"],
  ["--theme-field-on-chrome-border", "--theme-field-on-chrome-surface"],
];

/**
 * The section heading, over the canvas and over both flat card surfaces.
 *
 * `--theme-section-heading` was in none of the lists above, and the browser pass caught it at
 * **1.73:1** in Fun light on the default palette — `#f0abfc` on the `#fefdfe` canvas, a dark-mode
 * primitive left standing in the light block. It takes `TEXT_FLOOR` rather than the 3:1 large-text
 * allowance because it is not only large text: it paints the 30px/700 article headings *and*, via
 * `.theme-portal-group-heading` (`utilities-theme.css:3966`), small headings in the portal groups.
 * The normal-text floor is the one that governs both, so it is the one asserted.
 *
 * The grounds are the canvas plus `--theme-surface-soft` and `--theme-surface-strong`, which is
 * what an article card resolves to as a flat colour: `#fdfbfd` and `#fefcfe` in Fun light,
 * `--ei-surface` and `--ei-surface-raised` in Pro. Fun's `--theme-frosted-panel-bg` is a two-layer
 * gradient, so the card cannot be named more directly than this — see `flatFill`.
 *
 * `--theme-surface-muted` is the fourth ground and was the blind spot: it is the *darkest* of the
 * four in light mode, so it binds before the others, and omitting it let a colourway ship a heading
 * under the floor — canopy, and the green accent that wears it, at 4.41:1 on `#e6f4e8` — while this
 * suite stayed green. A browser pass over the resolved states found it.
 */
const SECTION_HEADING_PAIRS: [ink: string, ground: string][] = [
  ["--theme-section-heading", "--theme-body-bg"],
  ["--theme-section-heading", "--theme-surface-soft"],
  ["--theme-section-heading", "--theme-surface-strong"],
  ["--theme-section-heading", "--theme-surface-muted"],
];

/**
 * The accent family over the card surfaces.
 *
 * `accents.contrast.test.ts` already asserts this family against the **canvas**, which is the axis
 * that file owns. The card surfaces were asserted nowhere, and they are exactly where the browser
 * pass found `a.theme-accent-heading` and `a.theme-index-card-link` reading **2.66:1 to 4.39:1** in
 * Pro light. Both tokens paint ordinary link and heading text at body sizes, so the floor is 4.5.
 *
 * These are expected to fail today and the failing measurement is the deliverable, not a defect in
 * the assertion: accent lightness has site-wide visual consequences, so the repaint is a decision
 * to be taken deliberately over the whole accent ramp. Nothing here is to be resolved by moving a
 * value to suit this file or by lowering the floor.
 */
const ACCENT_CARD_PAIRS: [ink: string, ground: string][] = [
  ["--theme-accent-strong", "--theme-surface-soft"],
  ["--theme-accent-strong", "--theme-surface-strong"],
  ["--theme-accent", "--theme-surface-soft"],
  ["--theme-accent", "--theme-surface-strong"],
];

/**
 * `--theme-text-on-media` and `--theme-text-on-media-muted` are deliberately not here.
 *
 * They are painted on the media tile's scrim, and that scrim is
 * `bg-gradient-to-t from-black/80 via-black/35 to-transparent` on a component element
 * (`PublicFeedbackPrimitives.tsx:318`) laid over a thumbnail image. No root-level token expresses
 * it: the nearest candidate, `--theme-shadow-strong`, is the 62%-black (16% in light) used for
 * elevation shadows and the replication overlay, not this gradient, and the `to-transparent` stop
 * has no token at all because its ground is the photograph. Asserting either pair would mean
 * inventing a ground and then trusting the number it produced, which is worse than the gap. The
 * gap is recorded in the header instead.
 */

/**
 * Pro's Levelling System steps: five inks and five marks.
 *
 * Root-level in both schemes (`pro-theme.css` ~197-206 light, ~602-611 dark), so they are fully
 * measurable — they were simply unlisted. The inks paint the level labels inside
 * `.theme-effect-neutral-panel`, which makes them text at 4.5. The `-mark` steps are applied as
 * `background-color` on the level pips (`pro-theme.css` ~1690 onward), so they are graphical
 * objects under SC 1.4.11 and take the 3:1 floor rather than 4.5.
 */
const LEVEL_STEPS = [1, 2, 3, 4, 5];
const LEVEL_INKS = LEVEL_STEPS.map((step) => `--ei-level-${step}`);
const LEVEL_MARKS = LEVEL_STEPS.map((step) => `--ei-level-${step}-mark`);

/* -------------------------------------------------------------------------
 * The states.
 * ---------------------------------------------------------------------- */

type AppearancePoint = { label: string; tokens: Record<string, string> };

/**
 * The four states a reader reaches without opening anything: both visual styles, both schemes,
 * on the base palette. This is the same grid the accent suites measure, reused rather than
 * rebuilt so the files cannot drift apart on what "a state" is. The continuous hue/chroma axes
 * layer relative-colour rewrites over these states and are measured in `chromaStylesheet.test.ts`.
 */
const READER_STATES: AppearancePoint[] = GRID.map(({ label, tokens }) => ({ label, tokens }));

/* -------------------------------------------------------------------------
 * The cases.
 * ---------------------------------------------------------------------- */

type Case = {
  state: string;
  label: string;
  tokens: Record<string, string>;
  ink: string;
  ground: string;
  floor: number;
};

/**
 * One case per state per pair.
 *
 * `state`, `ink` and `ground` are carried as three separate fields purely so the reporter title can
 * interpolate them separately: vitest runs each `$field` through `objDisplay` with a ~38-character
 * limit, so a single combined label is truncated exactly where the token pair would have been and a
 * failure reads `'journal/fun/light — --theme-field-bor…'`. Split, every part survives. `label` is
 * the same three joined, for the assertion message, which is not truncated.
 */
function casesFor(states: AppearancePoint[], pairs: [string, string][], floor: number): Case[] {
  return states.flatMap((state) =>
    pairs.map(([ink, ground]) => ({
      state: state.label,
      label: `${state.label} — ${ink} on ${ground}`,
      tokens: state.tokens,
      ink,
      ground,
      floor,
    })),
  );
}

/** The text ramp against every surface, and the ghost step against the same set at its own floor. */
const RAMP_PAIRS = TEXT_RAMP.flatMap((ink) =>
  SURFACES.map((ground): [string, string] => [ink, ground]),
);
const GHOST_PAIRS = SURFACES.map((ground): [string, string] => ["--theme-text-ghost", ground]);

/**
 * A fill that can be measured as a flat colour, or null.
 *
 * In Fun the six `--theme-semantic-*-badge-bg` tokens are multi-stop gradients, and a gradient has
 * no single luminance to divide by — so those pairs are skipped here rather than thrown on, which
 * would take the whole suite down over a token that is not actually broken. They are not left
 * unmeasured: the audit sampled every stop of all six in the browser and the worst reading was
 * 7.91:1, comfortably over the 4.5 floor, so the skip hides no breach. Pro's badge fills are flat,
 * and the guard below pins that the skip never fires there.
 */
function flatFill(value: string | undefined): Rgb | null {
  if (value === undefined) return null;
  try {
    return parseColor(value);
  } catch {
    return null;
  }
}

/** Ink over ground, composited first so a translucent step is measured as it paints. */
function measure(tokens: Record<string, string>, inkToken: string, groundToken: string) {
  const ground = parseColor(tokens[groundToken]);
  const ink = composite(parseColorWithAlpha(tokens[inkToken]), ground);
  return { ink, ground, measured: contrastRatio(ink, ground) };
}

const SEMANTIC_PAIRS = SEMANTIC_FAMILIES.flatMap((family): [string, string][] => [
  [`--theme-${family}-text`, `--theme-${family}-bg`],
  [`--theme-${family}-text-strong`, `--theme-${family}-bg`],
]);

/**
 * The badge tones, read off the resolved tokens rather than listed, because a tone added to
 * `site-colors.css` without a line here would otherwise ship unmeasured. Sorted so the case order
 * is stable across states.
 */
const BADGE_TONES = Object.keys(GRID[0].tokens)
  .map((token) => /^--theme-semantic-([a-z]+)-badge-text$/.exec(token)?.[1])
  .filter((tone): tone is string => tone !== undefined)
  .sort();

const BADGE_PAIRS = BADGE_TONES.map((tone): [string, string] => [
  `--theme-semantic-${tone}-badge-text`,
  `--theme-semantic-${tone}-badge-bg`,
]);

/** The Pro half of the reader grid. `--ei-*` resolves to nothing under Fun, so only Pro is measured. */
const PRO_STATES = READER_STATES.filter((state) => state.label.startsWith("pro/"));

/**
 * The three Pro panels a level step is painted on, per scheme.
 *
 * Paper and surface in both schemes, then the third panel each scheme actually uses behind a level
 * row: the sunk `#efeee9` in light and the raised `#212121` in dark. Those two are the worst ground
 * for their scheme — sunk is the darkest light panel, so it is the low point for Pro light's dark
 * level inks, and raised is the lightest dark panel, so it is the low point for Pro dark's light
 * ones. Listing all three rather than only the worst means a future repaint that inverts a step
 * cannot slip through on a ground nobody measured.
 */
function proGrounds(label: string): string[] {
  return [
    "--ei-paper",
    "--ei-surface",
    label.endsWith("dark") ? "--ei-surface-raised" : "--ei-surface-sunk",
  ];
}

/** One case per Pro state per ink per panel; the grounds vary by scheme, so `casesFor` cannot serve. */
function proCases(inks: string[], floor: number): Case[] {
  return PRO_STATES.flatMap((state) =>
    inks.flatMap((ink) =>
      proGrounds(state.label).map((ground) => ({
        state: state.label,
        label: `${state.label} — ${ink} on ${ground}`,
        tokens: state.tokens,
        ink,
        ground,
        floor,
      })),
    ),
  );
}

/* -------------------------------------------------------------------------
 * The floors.
 * ---------------------------------------------------------------------- */

/**
 * The seven assertions, registered against a list of states.
 *
 * A function rather than two copies because the floors are identical for a state a reader reaches
 * with no surface saved and a state on a named surface — a surface is not a lower standard, it is
 * the same theme with its seeds re-seated — and two copies would let them drift.
 */
function registerFloors(states: AppearancePoint[]) {
  it.each(casesFor(states, RAMP_PAIRS, TEXT_FLOOR))(
    "$state keeps $ink legible on $ground",
    ({ label, tokens, ink, ground, floor }) => {
      const { ink: inkColour, ground: groundColour, measured } = measure(tokens, ink, ground);

      expect(
        measured,
        `${label}: ink ${toHex(inkColour)} on ${toHex(groundColour)} measures ${ratio(measured)}, ` +
          `below the ${floor} floor`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(casesFor(states, GHOST_PAIRS, GHOST_FLOOR))(
    "$state keeps the decorative $ink visible on $ground",
    ({ label, tokens, ink, ground, floor }) => {
      const { ink: inkColour, ground: groundColour, measured } = measure(tokens, ink, ground);

      expect(
        measured,
        `${label}: ghost ${toHex(inkColour)} on ${toHex(groundColour)} measures ${ratio(measured)}, ` +
          `below the ${floor} floor`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(casesFor(states, [...SEMANTIC_PAIRS, ...BADGE_PAIRS], TEXT_FLOOR))(
    "$state keeps $ink legible on the $ground fill",
    ({ label, tokens, ink, ground, floor }) => {
      // A gradient fill has no flat luminance; see `flatFill` for why skipping is the honest
      // reading and what was measured in its place.
      const fill = flatFill(tokens[ground]);
      if (fill === null) return;

      const inkColour = composite(parseColorWithAlpha(tokens[ink]), fill);
      const measured = contrastRatio(inkColour, fill);

      expect(
        measured,
        `${label}: ink ${toHex(inkColour)} on fill ${toHex(fill)} measures ${ratio(measured)}, ` +
          `below the ${floor} floor`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(casesFor(states, NAMED_PAIRS, TEXT_FLOOR))(
    "$state keeps $ink legible on its own $ground",
    ({ label, tokens, ink, ground, floor }) => {
      const { ink: inkColour, ground: groundColour, measured } = measure(tokens, ink, ground);

      expect(
        measured,
        `${label}: ink ${toHex(inkColour)} on fill ${toHex(groundColour)} measures ` +
          `${ratio(measured)}, below the ${floor} floor`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(casesFor(states, BOUNDARY_PAIRS, BOUNDARY_FLOOR))(
    "$state keeps $ink distinct from $ground",
    ({ label, tokens, ink, ground, floor }) => {
      // The border is the translucent one here, and compositing it is the whole assertion: read
      // opaque, Fun dark's white hairline measures 18.21:1 whatever its alpha, and the 36% white
      // the compositor produces measures 3.30:1 — the same token, six times the headroom.
      const { ink: border, ground: surface, measured } = measure(tokens, ink, ground);

      expect(
        measured,
        `${label}: border ${toHex(border)} on surface ${toHex(surface)} measures ` +
          `${ratio(measured)}, below the ${floor} floor SC 1.4.11 sets for a control boundary`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(casesFor(states, SECTION_HEADING_PAIRS, TEXT_FLOOR))(
    "$state keeps the $ink readable on $ground",
    ({ label, tokens, ink, ground, floor }) => {
      const { ink: inkColour, ground: groundColour, measured } = measure(tokens, ink, ground);

      expect(
        measured,
        `${label}: heading ${toHex(inkColour)} on ${toHex(groundColour)} measures ${ratio(measured)}, ` +
          `below the ${floor} floor — the heading is small text in .theme-portal-group-heading, ` +
          `so the large-text allowance does not apply`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(casesFor(states, ACCENT_CARD_PAIRS, TEXT_FLOOR))(
    "$state keeps $ink readable on the $ground card",
    ({ label, tokens, ink, ground, floor }) => {
      const { ink: inkColour, ground: groundColour, measured } = measure(tokens, ink, ground);

      expect(
        measured,
        `${label}: accent ${toHex(inkColour)} on card ${toHex(groundColour)} measures ` +
          `${ratio(measured)}, below the ${floor} floor — accents.contrast.test.ts covers this ` +
          `family on the canvas only, and the card is the uncovered ground`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );
}

describe("theme ramp floors", () => {
  it("finds every badge tone the sheet declares", () => {
    // The tone list is derived, so it can silently come back empty if the token naming changes.
    // Six tones ship today; the assertion is that the derivation found the family at all.
    expect(BADGE_TONES.length, `badge tones derived: ${BADGE_TONES.join(", ")}`).toBeGreaterThan(4);
  });

  it.each(PRO_STATES)(
    "measures every badge fill flat in $label",
    ({ label, tokens }) => {
      // The gradient skip is a Fun-only allowance. If a Pro badge fill ever becomes a gradient the
      // skip would start swallowing a measurable pair, so it is pinned here rather than trusted.
      const gradients = BADGE_PAIRS.filter(([, fill]) => flatFill(tokens[fill]) === null);

      expect(gradients.map(([, fill]) => fill), `${label}: unmeasurable Pro badge fills`).toEqual([]);
    },
  );

  registerFloors(READER_STATES);
});


/**
 * Pro's Levelling System ramp, in its own block because it is Pro-only and its grounds are Pro's
 * own panels rather than the shared `--theme-surface-*` set. It is reachable from the root, so it
 * was always measurable; it went unmeasured only because it was never listed, which is the whole
 * point of the blind-spot note in the header.
 */
describe("Pro Levelling System floors", () => {
  it("resolves the level ramp under Pro", () => {
    // The `--ei-*` family only exists behind `html[data-visual-style="pro"]`, so a mis-scoped state
    // list would resolve every token to undefined and every assertion below would throw rather than
    // measure. This pins that the ramp is actually present before anything is divided by it.
    const missing = [...LEVEL_INKS, ...LEVEL_MARKS, ...proGrounds("pro/light")].filter(
      (token) => PRO_STATES[0].tokens[token] === undefined,
    );

    expect(missing, `unresolved under ${PRO_STATES[0].label}`).toEqual([]);
  });

  it.each(proCases(LEVEL_INKS, TEXT_FLOOR))(
    "$state keeps the level label $ink readable on $ground",
    ({ label, tokens, ink, ground, floor }) => {
      const { ink: inkColour, ground: groundColour, measured } = measure(tokens, ink, ground);

      expect(
        measured,
        `${label}: level ink ${toHex(inkColour)} on ${toHex(groundColour)} measures ` +
          `${ratio(measured)}, below the ${floor} floor`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(proCases(LEVEL_MARKS, BOUNDARY_FLOOR))(
    "$state keeps the level mark $ink distinct from $ground",
    ({ label, tokens, ink, ground, floor }) => {
      // A mark is a `background-color` pip, not text: SC 1.4.11's 3:1 for a graphical object is the
      // floor, and 4.5 would be asserting a rule that does not exist for it.
      const { ink: markColour, ground: groundColour, measured } = measure(tokens, ink, ground);

      expect(
        measured,
        `${label}: level mark ${toHex(markColour)} on ${toHex(groundColour)} measures ` +
          `${ratio(measured)}, below the ${floor} floor SC 1.4.11 sets for a graphical object`,
      ).toBeGreaterThanOrEqual(floor);
    },
  );
});

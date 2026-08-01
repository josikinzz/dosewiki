import type { EssentialGroup, PaletteGroup, PaletteToken } from "./paletteTokens";

/**
 * The hue-seed group of the Theme Lab registry — the eleven OKLCH hue angles
 * `site-colors.css` derives most of its color from, kept beside the main
 * registry so `paletteTokens.ts` stays under its cleanup budget.
 *
 * Why this is a registry addition and not a styling refactor: the stylesheet
 * already writes almost every color as `oklch(L C var(--h-…))`. Roughly 200 of
 * its declarations name one of these eleven variables, so *the derivation
 * already lives in CSS* — re-seating a seed re-hues its whole family at
 * computed-value time, with no plumbing on this side at all. That is exactly
 * what the shipped presets do to become Abyss or Canopy; the seeds were simply
 * whitelisted for preset definitions and unreachable from the UI.
 *
 * A seed edit is an ordinary per-theme divergence entry like any other token
 * write, so a hue nudge on one look is "that look's precalculated base plus my
 * divergence" and reverting returns the seed to that look's own angle.
 *
 * **The effect is deliberately partial.** A handful of tokens are hand-pinned
 * literals in the stylesheet (the dark page-gradient top stop, the dark
 * active-tab fill, the light logo stops, avatar gradients, report bylines…)
 * because their hue sits off the seed family they belong to. Those do not
 * follow a seed. History: driving a re-hue purely from the seeds once left two
 * presets visibly wrong and the stragglers had to be re-pinned by hand. The
 * control says so rather than pretending otherwise — see {@link ANGLE_CAVEAT}.
 *
 * The type import is deliberately type-only: `paletteTokens.ts` imports this
 * module at runtime, so a value import back would close a cycle.
 */

/** What the angle control needs to know about one seed. */
export interface AngleSpec {
  /**
   * The authored angle in `site-colors.css`, used when the browser cannot
   * report a computed one (jsdom, or a token the stylesheet has not emitted
   * yet). Never written to storage on its own — only an angle the visitor
   * actually chose is an edit.
   */
  fallback: number;
}

/** Angles are a circle, so the track spans one full turn and 360 ≡ 0. */
export const ANGLE_MAX = 360;

/** Nudge step for the wrap-around buttons either side of the readout. */
export const ANGLE_NUDGE = 15;

/** Stated at the control, because a seed moves derived families only. */
export const ANGLE_CAVEAT =
  "Re-hues every color the theme derives from this seed. A few hand-pinned colors (some gradient stops, the logo, avatars) are literals and will not follow — expect a small number of stragglers to keep their old hue.";

const angle = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "angle",
  hint,
});

/**
 * One entry per `--h-*` seed declared in `src/styles/site-colors.css`, in the
 * order the stylesheet declares them (rose first, brand last). The list is
 * asserted against that stylesheet, so a seed added there fails the suite until
 * it is offered here.
 *
 * `fallback` is the authored angle, which is also the reference point the hint
 * counts derived declarations from.
 */
const SEEDS: { id: string; label: string; hint: string; fallback: number }[] = [
  {
    id: "--h-brand",
    label: "Brand",
    hint: "The signature fuchsia, and the busiest seed by far: accent text and links, card and panel rims, glows, the scrollbar, and the whole light-mode canvas and chrome.",
    fallback: 326,
  },
  {
    id: "--h-plum",
    label: "Surfaces",
    hint: "The dark canvas family: page gradient, frosted panels, fields, table rows, the header/footer rail, and the toggle pill.",
    fallback: 318,
  },
  {
    id: "--h-text",
    label: "Text & borders",
    hint: "The tint carried by the light-mode reading hierarchy, plus borders, dividers, and ambient shadows in both themes.",
    fallback: 316,
  },
  {
    id: "--h-violet",
    label: "Informational",
    hint: "Neutral info panels, active tabs, and inline reference controls.",
    fallback: 290,
  },
  {
    id: "--h-green",
    label: "Success & evidence",
    hint: "The safety ramp's success family. Keep it clearly apart from the brand hue.",
    fallback: 160,
  },
  {
    id: "--h-gold",
    label: "Caution",
    hint: "The caution family — callouts, badges, and the use-caution interaction card.",
    fallback: 68,
  },
  {
    id: "--h-orange",
    label: "Unsafe",
    hint: "The unsafe family — avoid badges and the avoid interaction card.",
    fallback: 48,
  },
  {
    id: "--h-rose",
    label: "Danger",
    hint: "The danger family — highest-risk cards, danger callouts and badges.",
    fallback: 14,
  },
  {
    id: "--h-blue",
    label: "Info",
    hint: "The neutral-information family used by info badges and callouts.",
    fallback: 260,
  },
  {
    id: "--h-yellow",
    label: "Code — booleans",
    hint: "Booleans and warning windows in the JSON / code viewer.",
    fallback: 82,
  },
  {
    id: "--h-cyan",
    label: "Code — numbers",
    hint: "Numeric values in the JSON / code viewer.",
    fallback: 232,
  },
];

const SPECS: Record<string, AngleSpec> = Object.fromEntries(
  SEEDS.map((seed) => [seed.id, { fallback: seed.fallback }] as const),
);

export const HUE_GROUP: PaletteGroup = {
  id: "hues",
  title: "Hue seeds",
  // Expanded on open: this is the highest-leverage group in the registry — one
  // drag here is worth a hundred token edits — and it reads as nothing at all
  // while collapsed.
  major: true,
  blurb:
    "The angles the palette is derived from. Nudging one turns every color the theme builds from it — the brand seed alone drives roughly eighty declarations. A few hand-pinned colors are literals and keep their own hue.",
  tokens: SEEDS.map((seed) => angle(seed.id, seed.label, seed.hint)),
};

/** Ids in this group, in registry order. */
export const HUE_TOKEN_IDS: readonly string[] = HUE_GROUP.tokens.map((token) => token.id);

/** The plain-language entry point: the three seeds every shipped look re-seats. */
export const HUE_ESSENTIALS: EssentialGroup = {
  id: "essentials-hues",
  title: "Whole-theme hue",
  blurb:
    "Spin the whole site to another color. These three are what every shipped palette re-seats to become itself; a few hand-pinned colors stay where they are.",
  items: [
    {
      id: "--h-brand",
      label: "Brand hue",
      hint: "Turns the signature pink — links, rims, glows, the scrollbar, and the light-mode page — to any other color.",
    },
    {
      id: "--h-plum",
      label: "Surface hue",
      hint: "Turns the dark canvas: page gradient, panels, fields, and the header rail.",
    },
    {
      id: "--h-text",
      label: "Text hue",
      hint: "Turns the tint in text, borders, dividers, and soft shadows.",
    },
  ],
};

/** The angle bounds for a hue seed, or undefined when it is not one. */
export function getAngleSpec(id: string): AngleSpec | undefined {
  return SPECS[id];
}

/** Bring any angle onto the circle: 400 → 40, -20 → 340, 360 → 0. */
export function normalizeAngle(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % ANGLE_MAX) + ANGLE_MAX) % ANGLE_MAX;
}

/**
 * Read a seed's value as a number of degrees.
 *
 * Seeds are authored bare (`--h-brand: 326`) because that is the form
 * `oklch()`'s hue argument takes throughout the stylesheet, but a computed
 * value can come back with an explicit `deg`, so both are understood. Anything
 * else — a `calc()`, an empty computed value — returns null and the caller
 * falls back to the seed's authored angle rather than guessing zero, which
 * would read as "this theme is already red".
 */
export function parseAngle(value: string): number | null {
  const match = /^\s*(-?\d*\.?\d+)\s*(deg)?\s*$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return normalizeAngle(amount);
}

/** Write an angle back as CSS: bare degrees, the form the stylesheet uses. */
export function formatAngle(degrees: number): string {
  return String(Math.round(normalizeAngle(degrees) * 10) / 10);
}

/** The angle a seed is wearing right now, falling back to its authored value. */
export function angleValue(id: string, value: string): number {
  return parseAngle(value) ?? getAngleSpec(id)?.fallback ?? 0;
}

/** A representative color at this angle — what the catalog chip and the
 *  control's preview paint, so the number reads as a hue rather than a number. */
export function hueSwatchColor(degrees: number, lightness = 68, chroma = 0.18): string {
  return `oklch(${lightness}% ${chroma} ${formatAngle(degrees)})`;
}

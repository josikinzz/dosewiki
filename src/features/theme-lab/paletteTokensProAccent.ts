import type { PaletteGroup, PaletteToken } from "./paletteTokens";

/**
 * The Pro accent-seed group of the Theme Lab registry — the nine `--ei-*`
 * declarations that make up the Pro half of an accent, kept beside the main
 * registry so `paletteTokens.ts` stays under its cleanup budget.
 *
 * These are the same nine seeds `src/theme/accents.ts` carries per colour
 * scheme (`PRO_ACCENT_SEED_NAMES`), in that list's `light` order: the
 * four-step accent ramp, the on-charcoal step, the three tinted washes, and
 * the ink that sits on a filled accent. Defaults are read live from
 * `src/styles/pro-theme.css` at runtime, so the labels here can never carry a
 * stale value.
 *
 * Registration is not cosmetic. The panel only offers tokens the registry
 * lists, and a copied palette is exactly the visitor's own edits, so an
 * omission here would leave the Pro half of an accent unreachable in the editor
 * and absent from every exported palette while the Fun half travelled intact.
 *
 * `--ei-fade` is deliberately absent, and asserted absent. It sits in the
 * same authored block as the washes, but it is not accent: it is the paper
 * canvas at 88% alpha. Offering it would let an imported palette recolour
 * the page rather than the accent on it.
 *
 * The type import is deliberately type-only: `paletteTokens.ts` imports this
 * module at runtime, so a value import back would close a cycle.
 */

const color = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "color",
  hint,
});

export const PRO_ACCENT_GROUP: PaletteGroup = {
  id: "pro-accent",
  title: "Pro accent seeds",
  blurb:
    "Pro's --ei-* accent family — the half of an accent that src/theme/accents.ts carries per colour scheme. Only paints under the Pro visual style. Paper (--ei-fade) sits in the same authored block but is not accent, so it is not here.",
  tokens: [
    color("--ei-accent", "Pro accent — base", "The link colour on paper. Pro budgets it at 7.4:1 on charcoal."),
    color("--ei-accent-strong", "Pro accent — strong", "The emphatic step. Pro budgets it at 9.2:1 on charcoal."),
    color("--ei-accent-soft", "Pro accent — soft"),
    color("--ei-accent-muted", "Pro accent — muted"),
    color(
      "--ei-accent-on-dark",
      "Pro accent — on charcoal",
      "The step the charcoal header and footer rails wear. Authored once, in the day block, and read in both schemes — but an accent's blocks are per-scheme, so an accent states it in both halves at one value.",
    ),
    color("--ei-selection", "Pro selection wash"),
    color("--ei-ring-soft", "Pro ring — soft"),
    color("--ei-highlight", "Pro search-hit fill"),
    color(
      "--ei-on-accent",
      "Pro ink on accent",
      "Ink ON a filled accent, so it follows the fill's lightness rather than the accent's hue: white over a dark fill, near-black over a light one.",
    ),
  ],
};

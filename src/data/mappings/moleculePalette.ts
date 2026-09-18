/**
 * Molecule colourways — the element palette applied to RDKit-rendered structure SVGs.
 *
 * Structure diagrams render through `<img>` (`AppImage` → `next/image`), so CSS cannot
 * reach individual atoms: the palette has to be baked into the SVG bytes. RDKit writes
 * literal hexes inline (`style='…stroke:#F0ABFC…'` on bond paths, `fill='#FDA4AF'` on the
 * atom-label glyph paths) and emits no element metadata at all — the class attributes only
 * carry bond/atom *indices*. **Colour is therefore the only element signal available**, and
 * every recolour in this project is a literal hex substitution.
 *
 * Two visual styles, three colourways:
 *   * Fun uses the dose.wiki fuchsia palette already baked into canonical SVGs.
 *   * Pro light uses desaturated CPK hues against the paper canvas.
 *   * Pro dark keeps those element identities but raises their luminance against
 *     the charcoal canvas.
 *
 * This module is the single source of truth for both Pro colourways. It is a
 * pure string transform (no DOM) used by `src/app/api/molecules/**`, which
 * recolours Postgres molecule overrides (substances and `class:` skeletons) at
 * serve time. Postgres stores only the canonical Fun bytes.
 */
import { SITE_FLAVOR_CONFIG, isEffectIndex, type SiteFlavorConfig } from "../../config/siteFlavor";
import type { ColorScheme } from "../../theme";

/**
 * Effect Index element palettes: restrained CPK hues tuned for each canvas.
 *
 * `rGroup` is not an element — RDKit paints Markush attachment labels with a
 * dedicated colour, and teal reads as "variable site" in Pro. `surface`
 * replaces opaque background fills embedded in legacy SVGs.
 */
export const EFFECT_INDEX_MOLECULE_PALETTES = {
  light: {
    carbon: "#333333",
    nitrogen: "#2f4a8f",
    oxygen: "#b0413e",
    sulfur: "#9a7d20",
    phosphorus: "#b06a2c",
    fluorine: "#4a8f6f",
    chlorine: "#3d7d52",
    bromine: "#8a4230",
    iodine: "#6a4b8f",
    rGroup: "#3d9991",
    surface: "#f6f5f1",
  },
  dark: {
    carbon: "#f2f2f0",
    nitrogen: "#91aef2",
    oxygen: "#ef8580",
    sulfur: "#d8bc5d",
    phosphorus: "#e2a06b",
    fluorine: "#8ed0b2",
    chlorine: "#7fc495",
    bromine: "#d78a72",
    iodine: "#b9a0df",
    rGroup: "#6fc4bb",
    surface: "#131313",
  },
} as const satisfies Record<ColorScheme, Record<string, string>>;

type EffectIndexMoleculeColorKey = keyof (typeof EFFECT_INDEX_MOLECULE_PALETTES)["light"]
export type MoleculeColorway = "brand" | "pro-light" | "pro-dark";

/**
 * Source hex (lowercase, no `#`) → Effect Index hex.
 *
 * Three source palettes are covered, because a molecule SVG reaching this transform may
 * have come from any of them:
 *
 *   1. **Brand** — what the `/dev` molecule editor saves into Postgres. Decoded from the
 *      retired `scripts/chemistry/render_molecules.py` substance renderer, whose style
 *      contract `renderMoleculeSvg.ts` now implements.
 *   2. **RDKit standard** — the textbook colourway the same pipeline rendered with
 *      `--palette standard` (now only reachable via hand-pasted overrides).
 *   3. **Legacy dataset** — the pre-RDKit artwork literals enumerated by
 *      `scripts/util/recolorMolecules.mjs`. Nothing shipping today uses them; they are kept
 *      so a hand-edited override pasted from the old art still recolours. Each is mapped by
 *      composing that script's legacy→brand step with this table's brand→Effect Index step,
 *      so the grouping decisions stay identical rather than being re-guessed here.
 *
 * Known lossy edge: the brand palette collapses fluorine and phosphorus into one amber
 * (`#fbbf24`), so a brand-sourced SVG cannot distinguish them. Fluorine wins (63 substances
 * carry F, 3 carry P).
 */
const SOURCE_HEX_TO_COLOR_KEY: Readonly<Record<string, EffectIndexMoleculeColorKey>> = {
  // ---- Brand palette (the retired Python renderer's PALETTE) ----
  f0abfc: "carbon", // fuchsia-300 — carbon / H / bonds / default
  c4b5fd: "nitrogen", // violet-300
  fda4af: "oxygen", // rose-300
  fbbf24: "fluorine", // amber-400 — F *and* P in the brand palette; see note above
  bef264: "sulfur", // lime-300
  "6ee7b7": "chlorine", // emerald-300
  fb7185: "bromine", // rose-400
  e879f9: "iodine", // fuchsia-400
  c084fc: "rGroup", // purple-400 — Markush R-group labels on class skeletons
  eef2ff: "surface", // indigo-50 — brand stand-in for white
  // Brand targets that only the legacy recolour script ever emitted.
  a5b4fc: "nitrogen", // indigo-300, legacy target for #0000ff
  f43f5e: "oxygen", // rose-500, legacy target for #660000
  fcd34d: "sulfur", // amber-300, legacy target for #666633 (alpha preserved separately)

  // ---- RDKit standard palette (--palette standard) ----
  "000000": "carbon",
  "0000ff": "nitrogen",
  ff0000: "oxygen",
  "33cccc": "fluorine",
  ff7f00: "phosphorus",
  cccc00: "sulfur",
  "00cc00": "chlorine",
  "7f4c19": "bromine",
  a01eef: "iodine",
  ffffff: "surface",

  // ---- Legacy dataset literals (scripts/util/recolorMolecules.mjs) ----
  f5d0fe: "carbon", // → brand #f0abfc
  "333333": "carbon", // → brand #f0abfc (and the Effect Index carbon value itself)
  "333399": "nitrogen", // → brand #c4b5fd
  "009900": "chlorine", // → brand #6ee7b7
  "996600": "fluorine", // → brand #fbbf24
  "666600": "sulfur", // → brand #bef264
  "666633": "sulfur", // → brand #fcd34dcc; the alpha is re-attached below
  "660099": "iodine", // → brand #e879f9
  "663333": "bromine", // → brand #fb7185
  ec0000: "bromine", // → brand #fb7185
  "660000": "oxygen", // → brand #f43f5e
};

/**
 * Sources whose replacement is not simply `palette[key]`.
 *
 * `#666633` mapped to `#fcd34dcc` in the legacy script, so its Effect Index counterpart keeps
 * that translucency even though the source literal is opaque. `#ffffff99` was grouped with
 * `#333333` (ink, not background) there, so it must resolve to translucent *carbon* — the
 * generic 8-digit rule below would otherwise read it as translucent white and send it to
 * `surface`. Both entries take precedence over {@link SOURCE_HEX_TO_COLOR_KEY}.
 */
const SOURCE_HEX_EXCEPTIONS: Readonly<
  Record<string, { key: EffectIndexMoleculeColorKey; alpha: string }>
> = {
  "666633": { key: "sulfur", alpha: "cc" },
  ffffff99: { key: "carbon", alpha: "99" },
};

/**
 * Named CSS colours the legacy artwork used. Matched only when they sit in a paint position
 * (`fill:`, `stroke='`, …) so the words cannot be rewritten anywhere else in the document.
 */
const NAMED_COLOR_TO_COLOR_KEY: Readonly<Record<string, EffectIndexMoleculeColorKey>> = {
  black: "carbon",
  red: "oxygen",
  white: "surface",
};

/**
 * A `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` token. The alternation is ordered longest-first
 * and the trailing lookahead requires the token to end, so `#ffffff99` is never read as
 * `#ffffff` followed by `99`, and a malformed 7-digit run matches nothing at all.
 */
const HEX_TOKEN_RE = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-f])/gi;

/** `rgb(r, g, b)`, the one non-hex numeric form the legacy artwork used. */
const RGB_TOKEN_RE = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi;

/** A named colour in a paint position: `stroke:black`, `fill='red'`, `stop-color: white`. */
const NAMED_COLOR_RE = new RegExp(
  String.raw`\b(fill|stroke|color|stop-color|flood-color|lighting-color)(\s*[:=]\s*["']?)(` +
    Object.keys(NAMED_COLOR_TO_COLOR_KEY).join("|") +
    String.raw`)\b`,
  "gi",
);

/** Expand `#rgb`/`#rgba` shorthand so every lookup key is 6 or 8 digits. */
function expandShorthandHex(digits: string): string {
  if (digits.length !== 3 && digits.length !== 4) {
    return digits;
  }
  return digits
    .split("")
    .map((digit) => digit + digit)
    .join("");
}

function paletteHex(key: EffectIndexMoleculeColorKey, colorScheme: ColorScheme): string {
  return EFFECT_INDEX_MOLECULE_PALETTES[colorScheme][key];
}

/**
 * Resolve one colour token's digits to an Effect Index hex, or `null` to leave it alone.
 *
 * An 8-digit token is looked up whole first (so the documented alpha'd literals keep their
 * legacy grouping), then by its RGB prefix with the original alpha re-attached — that is what
 * makes an arbitrary hand-authored `#F0ABFC80` recolour instead of surviving as fuchsia.
 */
function resolveHexDigits(rawDigits: string, colorScheme: ColorScheme): string | null {
  const digits = expandShorthandHex(rawDigits.toLowerCase());

  const exception = SOURCE_HEX_EXCEPTIONS[digits];
  if (exception) {
    return `${paletteHex(exception.key, colorScheme)}${exception.alpha}`;
  }

  const direct = SOURCE_HEX_TO_COLOR_KEY[digits];
  if (direct) {
    return paletteHex(direct, colorScheme);
  }

  // An 8-digit literal the tables do not name: recolour the RGB half and keep
  // the original alpha channel.
  if (digits.length === 8) {
    const mapped = SOURCE_HEX_TO_COLOR_KEY[digits.slice(0, 6)];
    return mapped ? `${paletteHex(mapped, colorScheme)}${digits.slice(6)}` : null;
  }

  return null;
}

function toHexDigits(r: number, g: number, b: number): string | null {
  if (r > 255 || g > 255 || b > 255) {
    return null;
  }
  return [r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("");
}

/**
 * Elements whose paint is a coverage channel rather than artwork colour, matched
 * whole so their contents survive the transform byte-for-byte.
 *
 * `renderMoleculeSvg.applyBoldRibbon` wraps every plain bond line in a luminance
 * `<mask>` — a `white` field with `black` halo shapes — so a bold bond can cut a
 * genuinely transparent gap where it crosses another bond. Those two literals are
 * mask arithmetic, not colours: recolouring them sends `white` to the near-black
 * dark `surface` (`#131313`) and `black` to the near-white dark `carbon`
 * (`#f2f2f0`), which inverts the mask and drops the whole bond skeleton to a few
 * percent alpha while wedges and the ribbon (drawn outside the group) stay opaque.
 * `<clipPath>` children carry paint attributes for the same non-visual reason.
 *
 * Gradients and filters stay recolourable: only these two elements are skipped, not
 * all of `<defs>`.
 */
const CHANNEL_ELEMENT_RE = /<(mask|clipPath)\b[\s\S]*?<\/\1\s*>/gi;

/**
 * Rewrite every recognised source colour in a molecule SVG to the Effect Index palette,
 * leaving {@link CHANNEL_ELEMENT_RE} regions untouched.
 *
 * Pure string transform: unrecognised colours pass through untouched, and the result is
 * idempotent (no Effect Index output value is itself a source that maps elsewhere).
 */
export function recolorMoleculeSvgToEffectIndex(
  svg: string,
  colorScheme: ColorScheme = "light",
): string {
  // Alternating slices: even indices are colourable document text, odd indices are
  // channel elements copied through verbatim.
  const slices: string[] = [];
  let cursor = 0;
  for (const block of svg.matchAll(CHANNEL_ELEMENT_RE)) {
    slices.push(svg.slice(cursor, block.index), block[0]);
    cursor = block.index + block[0].length;
  }
  slices.push(svg.slice(cursor));

  return slices
    .map((slice, index) =>
      index % 2 === 1
        ? slice
        : slice
            .replace(HEX_TOKEN_RE, (match, digits: string) =>
              resolveHexDigits(digits, colorScheme) ?? match)
            .replace(RGB_TOKEN_RE, (match, r: string, g: string, b: string) => {
              const digits = toHexDigits(Number(r), Number(g), Number(b));
              if (!digits) {
                return match;
              }
              return resolveHexDigits(digits, colorScheme) ?? match;
            })
            .replace(
              NAMED_COLOR_RE,
              (match, property: string, separator: string, name: string) => {
                const key = NAMED_COLOR_TO_COLOR_KEY[name.toLowerCase()];
                return key ? `${property}${separator}${paletteHex(key, colorScheme)}` : match;
              },
            ),
    )
    .join("");
}

/** Resolve an optional image-route request onto a concrete byte colourway. */
export function resolveMoleculeColorway(
  requested: string | null,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): MoleculeColorway {
  if (requested === "pro-light" || requested === "pro-dark") {
    return requested;
  }
  return isEffectIndex(config) ? "pro-light" : "brand";
}

/** Apply one resolved colourway to canonical Fun SVG bytes. */
export function applyMoleculeColorway(svg: string, colorway: MoleculeColorway): string {
  if (colorway === "brand") {
    return svg;
  }
  return recolorMoleculeSvgToEffectIndex(
    svg,
    colorway === "pro-dark" ? "dark" : "light",
  );
}

/**
 * Every colour literal {@link recolorMoleculeSvgToEffectIndex} recognises, lowercase and
 * `#`-prefixed. Exposed so tests can assert full coverage rather than restating the table.
 */
export const RECOLORABLE_MOLECULE_HEXES: readonly string[] = Object.freeze([
  ...Object.keys(SOURCE_HEX_TO_COLOR_KEY),
  ...Object.keys(SOURCE_HEX_EXCEPTIONS),
].map((digits) => `#${digits}`));

/**
 * The dose.wiki brand palette. No Effect Index molecule may contain any of these —
 * tests assert every brand hex is rewritten.
 */
export const BRAND_MOLECULE_HEXES: readonly string[] = Object.freeze([
  "#f0abfc",
  "#c4b5fd",
  "#fda4af",
  "#fbbf24",
  "#bef264",
  "#6ee7b7",
  "#fb7185",
  "#e879f9",
  "#c084fc",
  "#eef2ff",
  "#a5b4fc",
  "#f43f5e",
  "#fcd34d",
  "#f5d0fe",
]);


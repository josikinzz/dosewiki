import { BASE_ACCENT_PRO_SEEDS } from "./accents";

/**
 * The accent axis's one remaining authored block-pair, compiled into plain CSS.
 *
 * The named accent colourways are retired — the reader's accent is the continuous hue axis
 * now (`--dw-accent-hue`, rotated by the generated chroma stylesheet) — so the only thing
 * left to serialise is the base accent's Pro half: dose.wiki's plum `--ei-*` seeds, which Pro
 * needs because `pro-theme.css`'s authored seeds are Effect Index's teal. The checked-in
 * stylesheet is emitted by `npm run generate:accent-css`, and `accents.axis.test.ts` fails if
 * the file drifts from what the definitions produce.
 */

/**
 * The retired accent axis's root attribute. Nothing writes it any more; it survives because
 * the base Pro block is keyed on its *absence*, which keeps the block at the (0,3,1) it always
 * had — a step above `pro-theme.css`'s own palette blocks, so it wins from anywhere in the
 * bundle — and unmatchable on any root that somehow still carries a stale value.
 */
export const ACCENT_ATTRIBUTE = "data-accent";

/** Path of the generated stylesheet, relative to the repository root. */
export const ACCENT_STYLESHEET_PATH = "src/styles/accent-tokens.generated.css";

/**
 * The base accent's Pro block in one scheme, keyed by the attribute's absence: bare
 * `:not()`, so it keeps (0,3,1) and out-ranks the Pro palette it re-tints.
 */
export function accentDefaultProBlockSelector(theme: string): string {
  return `html[data-visual-style="pro"]:not([${ACCENT_ATTRIBUTE}])[data-theme="${theme}"]`;
}

function block(selector: string, declarations: Readonly<Record<string, string>>): string {
  const body = Object.entries(declarations)
    .map(([token, value]) => `  ${token}: ${value};`)
    .join("\n");
  return `${selector} {\n${body}\n}\n`;
}

const HEADER = `/* GENERATED FILE — do not edit by hand.
   Source: src/theme/accents.ts
   Regenerate: npm run generate:accent-css

   The base accent's Pro seeds, per colour scheme, so dose.wiki's Pro wears the publication's
   own plum instead of pro-theme.css's authored teal — that sheet is Effect Index's
   presentation, shared with dose.wiki's Pro style. The block is keyed on the absence of
   ${ACCENT_ATTRIBUTE} (the retired accent axis's attribute, which nothing writes any more):
   bare :not(), so it keeps the (0,3,1) that out-ranks the Pro palette it re-tints. The Fun
   half emits nothing because Fun's authored palette IS the base accent. Effect Index never
   imports this file, so it keeps the authored teal byte for byte. */
`;

/**
 * The whole generated stylesheet. Deterministic: dark before light, seed order as authored,
 * so regenerating without changing a seed is a no-op diff.
 */
export function buildAccentStylesheetCss(): string {
  const body = (["dark", "light"] as const)
    .map((theme) => block(accentDefaultProBlockSelector(theme), BASE_ACCENT_PRO_SEEDS[theme]))
    .join("\n");
  return `${HEADER}\n/* Default — Fun: authored; Pro: --ei-* seeds */\n${body}`;
}

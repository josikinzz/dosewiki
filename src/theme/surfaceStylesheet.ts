import { CHROMA_SUPPORT_PROBE } from "./appearanceChroma";
import funTokenFallbacks from "./surfaceFunTokenFallbacks.generated.json";
import funTokens from "./surfaceFunTokens.generated.json";

/**
 * The surface axis's one remaining payload, compiled into plain CSS: the base (Orchid)
 * colourway's Fun tokens, fully resolved to literals so a first paint never waits on a
 * `var()` chain. The named surface colourways are retired — the reader's surface is the
 * continuous hue axis now (`--dw-surface-hue`, rotated by the generated chroma stylesheet) —
 * and the base surface under Pro is `pro-theme.css` as authored, so no Pro block is emitted.
 *
 * A token whose authored value is a relative-colour or colour-mix recipe ships twice, the
 * way `site-colors.css` authors it: the baked literal in the block, then the recipe in a
 * trailing `@supports` block on the same selector. This sheet out-ranks the authored one, so
 * without that shape it would hand Safari 16.x (angle-typed or absent relative colour
 * syntax) an invalid value and blank every frosted panel the authored fallback had rescued.
 */

/**
 * The retired surface axis's root attribute. Nothing writes it any more; it survives in the
 * base block's `:not()` because a bare `:not()` carries the specificity of its argument,
 * keeping the block at the (0,2,1) the cascade was balanced around — level with
 * `pro-theme.css`'s own per-scheme palette blocks, which this sheet is imported after.
 */
export const SURFACE_ATTRIBUTE = "data-surface";

export const SURFACE_STYLESHEET_PATH = "src/styles/surface-tokens.generated.css";

/**
 * The base surface's Fun block in one scheme: `html:not([data-surface])[data-theme="…"]` at
 * (0,2,1). `:where(:not([data-visual-style="pro"]))` is how the Fun block stays off a Pro
 * page without buying specificity it does not need elsewhere: it makes the block unmatchable
 * under Pro rather than out-ranked.
 */
export function surfaceBaseBlockSelector(theme: string): string {
  return `html:not([${SURFACE_ATTRIBUTE}])[data-theme="${theme}"]:where(:not([data-visual-style="pro"]))`;
}

type SchemeTokens = Readonly<Record<string, string>>;

function block(selector: string, declarations: SchemeTokens, indent = ""): string {
  const entries = Object.entries(declarations);
  if (!entries.length) return "";
  const body = entries.map(([key, value]) => `${indent}  ${key}: ${value};`).join("\n");
  return `${indent}${selector} {\n${body}\n${indent}}\n`;
}

/** One scheme: the base block with fallbacks substituted, then the recipes under the probe. */
function schemeBlocks(selector: string, tokens: SchemeTokens, fallbacks: SchemeTokens): string {
  const recipes = Object.fromEntries(
    Object.keys(fallbacks).filter((key) => key in tokens).map((key) => [key, tokens[key]]),
  );
  const base = block(selector, { ...tokens, ...fallbacks });
  const guarded = block(selector, recipes, "  ");
  return guarded
    ? `${base}\n@supports (color: ${CHROMA_SUPPORT_PROBE}) {\n${guarded}}\n`
    : base;
}

export function buildSurfaceStylesheetCss(): string {
  const base = funTokens.orchid as Record<"dark" | "light", SchemeTokens>;
  const fallbacks = funTokenFallbacks.orchid as Record<"dark" | "light", SchemeTokens>;
  const body = (["dark", "light"] as const)
    .map((theme) => schemeBlocks(surfaceBaseBlockSelector(theme), base[theme], fallbacks[theme]))
    .filter(Boolean)
    .join("\n");
  return `/* GENERATED FILE — Source: src/theme/surfaces.ts. Regenerate: npm run generate:surface-css */\n\n/* Orchid */\n${body}`;
}

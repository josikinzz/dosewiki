import funTokens from "./surfaceFunTokens.generated.json";

/**
 * The surface axis's one remaining payload, compiled into plain CSS: the base (Orchid)
 * colourway's Fun tokens, fully resolved to literals so a first paint never waits on a
 * `var()` chain. The named surface colourways are retired — the reader's surface is the
 * continuous hue axis now (`--dw-surface-hue`, rotated by the generated chroma stylesheet) —
 * and the base surface under Pro is `pro-theme.css` as authored, so no Pro block is emitted.
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

function block(selector: string, declarations: Readonly<Record<string, string>>): string {
  const entries = Object.entries(declarations);
  if (!entries.length) return "";
  return `${selector} {\n${entries.map(([key, value]) => `  ${key}: ${value};`).join("\n")}\n}\n`;
}

export function buildSurfaceStylesheetCss(): string {
  const base = funTokens.orchid as Record<"dark" | "light", Record<string, string>>;
  const body = (["dark", "light"] as const)
    .map((theme) => block(surfaceBaseBlockSelector(theme), base[theme]))
    .filter(Boolean)
    .join("\n");
  return `/* GENERATED FILE — Source: src/theme/surfaces.ts. Regenerate: npm run generate:surface-css */\n\n/* Orchid */\n${body}`;
}

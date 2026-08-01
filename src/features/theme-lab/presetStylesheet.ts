import { PALETTE_PRESETS, type PalettePreset } from "./palettePresets";

/**
 * Shipped presets, compiled into plain CSS.
 *
 * The lab used to render a preset by injecting its whole override map into a
 * `<style>` element after hydration, which meant a returning visitor's first
 * paint was always the stock look. Compiling every preset into the global
 * stylesheet instead means the browser already has the palette before it has
 * run a line of application code: the pre-paint bootstrap only has to name
 * which one to wear (`html[data-palette="…"]`).
 *
 * The preset definitions stay the single source of truth — the generated
 * stylesheet is emitted from {@link buildPresetStylesheetCss} by
 * `npm run generate:palette-css`, and a test fails the build if the checked-in
 * file drifts from what the presets produce.
 */

/**
 * Root attribute naming the shipped preset the visitor is wearing. Every preset
 * is compiled into the global stylesheet under it, so setting this one
 * attribute is the whole of "apply a preset" — no CSS has to be generated, and
 * the pre-paint bootstrap can do it before the body exists.
 *
 * Declared here rather than beside the DOM helpers that write it because the
 * build step that emits the stylesheet runs in Node, with no `document` in
 * scope at all.
 */
export const PALETTE_ATTRIBUTE = "data-palette";

/** Path of the generated stylesheet, relative to the repository root. */
export const PRESET_STYLESHEET_PATH = "src/styles/palette-presets.generated.css";

/**
 * Selector for one preset's block in one theme.
 *
 * Two attributes on purpose: (0,2,1) puts the compiled block above the authored
 * `html[data-theme="…"]` token blocks in `site-colors.css` (0,1,1) — and exactly
 * level with the lab's own injected user layer, which then wins on source order
 * because it is appended to `<head>` after the stylesheet.
 */
export function presetBlockSelector(presetId: string, theme: string): string {
  return `html[${PALETTE_ATTRIBUTE}="${presetId}"][data-theme="${theme}"]`;
}

function block(selector: string, declarations: Record<string, string>): string {
  const entries = Object.entries(declarations);
  if (entries.length === 0) return "";
  const body = entries.map(([token, value]) => `  ${token}: ${value};`).join("\n");
  return `${selector} {\n${body}\n}\n`;
}

function presetCss(preset: PalettePreset): string {
  const themes = Object.keys(preset.overrides).sort();
  const blocks = themes
    .map((theme) => block(presetBlockSelector(preset.id, theme), preset.overrides[theme] ?? {}))
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return `/* ${preset.name} — ${preset.tagline} */\n${blocks.join("\n")}`;
}

const HEADER = `/* GENERATED FILE — do not edit by hand.
   Source: src/features/theme-lab/palettePresets.ts
   Regenerate: npm run generate:palette-css

   One attribute-scoped block per shipped preset per theme, so a saved palette
   paints from the stylesheet before any script runs. The Theme Lab's
   pre-paint bootstrap only sets html[${PALETTE_ATTRIBUTE}]; the visitor's own
   edits ride in the injected #palette-lab-overrides element at matching
   specificity and win on source order. */
`;

/**
 * The whole generated stylesheet. Deterministic: presets in declaration order,
 * themes sorted, so regenerating without changing a preset is a no-op diff.
 *
 * Presets with no overrides (the shipped default look is the authored CSS
 * as-is) emit nothing at all — an unknown or retired `data-palette` value then
 * renders exactly what the default preset renders, with no block to match.
 */
export function buildPresetStylesheetCss(presets: readonly PalettePreset[] = PALETTE_PRESETS) {
  const body = presets.map(presetCss).filter(Boolean).join("\n");
  return `${HEADER}\n${body}`;
}

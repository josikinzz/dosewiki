import { CHROME_DARK_CLASS } from "@/features/theme-lab/presetStylesheet";
import { PALETTE_PRESETS } from "@/features/theme-lab/palettePresets";
import { ACCENTS, DEFAULT_ACCENT_ID, type Accent } from "./accents";

/**
 * The accent axis, compiled into plain CSS.
 *
 * An accent is two override maps — a Fun colourway and a set of Pro `--ei-*` seeds — and
 * both are pure custom-property declarations, so the whole axis compiles to attribute-scoped
 * blocks. Nothing has to run: the browser already holds every accent before it has parsed a
 * line of application code, and the pre-paint bootstrap only names which one to wear.
 *
 * {@link ACCENTS} stays the single source of truth; this module only serialises it. The
 * checked-in stylesheet is emitted by `npm run generate:accent-css`, and `accents.axis.test.ts`
 * fails if the file drifts from what the definitions produce.
 */

/**
 * Root attribute naming the accent the visitor is wearing.
 *
 * Declared here rather than beside the DOM helpers that write it because the build step that
 * emits the stylesheet runs in Node, with no `document` in scope at all.
 */
export const ACCENT_ATTRIBUTE = "data-accent";

/** Path of the generated stylesheet, relative to the repository root. */
export const ACCENT_STYLESHEET_PATH = "src/styles/accent-tokens.generated.css";

/**
 * The zero-specificity guard that keeps a Fun block off a Pro root.
 *
 * `:where()` contributes nothing to specificity, so the Fun block stays at the (0,2,1) the
 * cascade ladder pins for it while becoming unable to match a Pro page at all. It is not
 * optional: this sheet is imported AFTER `pro-theme.css`, and a Fun block is level with the
 * Pro palette, so without the guard a colourway's `--theme-*` overrides would win the tie on
 * source order and repaint a Pro page in the colourway's own canvas. `site-colors.css` guards
 * its authored dark-chrome island the same way, for the same reason.
 */
const NOT_PRO = ':where(:not([data-visual-style="pro"]))';

/**
 * Selector for one accent's Fun block in one scheme.
 *
 * (0,2,1), which is level with the generated colourway blocks and with the Pro palette. The
 * tie is broken by source order, and this sheet is imported last, so an accent re-seats a
 * colourway the reader also has saved. It stays below the Theme Lab's user layer, which
 * reaches (0,4,1) by naming `data-theme` four times.
 */
export function accentFunBlockSelector(accentId: string, theme: string): string {
  return `html[${ACCENT_ATTRIBUTE}="${accentId}"][data-theme="${theme}"]${NOT_PRO}`;
}

/**
 * Selector for one accent's Pro block in one scheme.
 *
 * (0,3,1): one attribute above the Pro palette it overrides, because a tie decided by source
 * order would make the accent's position in the bundle load-bearing. Still a step below the
 * Lab's (0,4,1) user layer — `proTheme.test.ts` pins that whole ladder as arithmetic.
 */
export function accentProBlockSelector(accentId: string, theme: string): string {
  return `html[data-visual-style="pro"][${ACCENT_ATTRIBUTE}="${accentId}"][data-theme="${theme}"]`;
}

/**
 * Every selector one accent's Fun block is emitted under.
 *
 * A dark block is worn twice: by the root in dark mode, and by a {@link CHROME_DARK_CLASS}
 * subtree while the root is light — the dark header banner over a light page. Without the
 * island selector a light Fun page would keep an *unaccented* header, because the authored
 * island block in `site-colors.css` would be the only one matching it.
 *
 * Pro gets no island: its chrome rails are charcoal in both schemes, painted through
 * `.app-header` / `.app-footer` scoped tokens rather than by wearing the dark palette, and
 * the authored island selector excludes Pro outright.
 */
function accentFunBlockSelectors(accentId: string, theme: string): string[] {
  const own = accentFunBlockSelector(accentId, theme);
  if (theme !== "dark") return [own];
  return [own, `${accentFunBlockSelector(accentId, "light")} .${CHROME_DARK_CLASS}`];
}

function block(selectors: readonly string[], declarations: Record<string, string>): string {
  const entries = Object.entries(declarations);
  if (entries.length === 0) return "";
  const body = entries.map(([token, value]) => `  ${token}: ${value};`).join("\n");
  return `${selectors.join(",\n")} {\n${body}\n}\n`;
}

/**
 * One accent's blocks: the Fun colourway first, then the Pro seeds.
 *
 * The Fun half is read out of {@link PALETTE_PRESETS} at build time rather than copied into
 * the accent table, so editing a colourway moves its accent with it and the two cannot drift
 * into disagreeing about what Blue is. An accent naming a colourway that no longer exists is
 * a build error here rather than a silently empty block.
 */
function accentCss(accent: Accent): string {
  if (accent.id === DEFAULT_ACCENT_ID) return "";

  const blocks: string[] = [];

  if (accent.funPresetId) {
    const preset = PALETTE_PRESETS.find((candidate) => candidate.id === accent.funPresetId);
    if (!preset) {
      throw new Error(`Accent "${accent.id}" names unknown colourway "${accent.funPresetId}".`);
    }
    for (const theme of Object.keys(preset.overrides).sort()) {
      blocks.push(block(accentFunBlockSelectors(accent.id, theme), preset.overrides[theme] ?? {}));
    }
  }

  if (accent.pro) {
    for (const theme of ["dark", "light"] as const) {
      blocks.push(block([accentProBlockSelector(accent.id, theme)], { ...accent.pro[theme] }));
    }
  }

  const body = blocks.filter(Boolean);
  if (body.length === 0) return "";
  return `/* ${accent.label} — Fun: ${accent.funPresetId ?? "authored"}; Pro: --ei-* seeds */\n${body.join("\n")}`;
}

const HEADER = `/* GENERATED FILE — do not edit by hand.
   Source: src/theme/accents.ts
   Regenerate: npm run generate:accent-css

   One attribute-scoped block per accent, per visual style, per colour scheme, so a saved
   accent paints from the stylesheet before any script runs. The bootstrap only sets
   html[${ACCENT_ATTRIBUTE}]; the default accent sets nothing at all and has no block here,
   which is why a first paint with no attribute is already correct. The Theme Lab's own
   injected overrides out-rank every block below on specificity alone.

   Every Fun block carries ${NOT_PRO}. That is measured, not
   stylistic: this sheet loads after pro-theme.css, and a Fun block is (0,2,1) — level with
   the Pro palette — so at equal specificity the later sheet wins. Without the guard a Pro
   page wearing an accent painted the Fun colourway's canvas: Abyss's navy #020a12 instead of
   Pro's paper #f6f5f1, and roughly forty more --theme-* tokens with it. :where() adds zero
   specificity, so the guard buys that back without moving the block's rank. */
`;

/**
 * The whole generated stylesheet. Deterministic: accents in declaration order, Fun before
 * Pro, schemes sorted, so regenerating without changing an accent is a no-op diff.
 *
 * The default accent emits nothing — no colourway to name and no Pro seeds to restate — so
 * an unknown or retired `data-accent` value renders exactly what the default renders, with
 * no block to match.
 *
 * Every Fun block is emitted with the {@link NOT_PRO} guard, and it is emitted here rather
 * than written by hand so an accent added later inherits it and cannot forget it. The reason
 * is a measurement: this sheet is imported after `pro-theme.css` (a Fun accent has to beat a
 * saved colourway, which ties it at (0,2,1)), and a Fun block ties the Pro palette too, so
 * the later sheet wins. Unguarded, a Pro page wearing Blue painted Abyss's navy canvas
 * #020a12 instead of Pro's paper #f6f5f1. `accents.axis.test.ts` asserts the canvas per visual
 * style, which is the case that fails if the guard is ever dropped.
 */
export function buildAccentStylesheetCss(accents: readonly Accent[] = ACCENTS) {
  const body = accents.map(accentCss).filter(Boolean).join("\n");
  return `${HEADER}\n${body}`;
}

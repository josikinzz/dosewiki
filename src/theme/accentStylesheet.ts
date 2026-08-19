import { CHROME_DARK_CLASS } from "@/theme/chromeDark";
import { ACCENTS, BASE_ACCENT_ID, type Accent } from "./accents";
import funTokens from "./accentFunTokens.generated.json";

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
 * (0,2,1), which is level with the generated surface blocks and with the Pro palette. The tie
 * is broken by source order, and this sheet is imported last, so an accent re-tints the
 * surface the reader picked rather than the other way round. It stays below the Theme Lab's
 * user layer, which reaches (0,4,1) by naming `data-theme` four times.
 */
export function accentFunBlockSelector(accentId: string, theme: string): string {
  return `html[${ACCENT_ATTRIBUTE}="${accentId}"][data-theme="${theme}"]${NOT_PRO}`;
}
export function accentDefaultFunBlockSelector(theme: string): string {
  return `html:not([${ACCENT_ATTRIBUTE}])[data-theme="${theme}"]${NOT_PRO}`;
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
 * Selector for the DEFAULT accent's Pro block in one scheme.
 *
 * The default accent is keyed by the *absence* of `data-accent`, because that is what the
 * bootstrap writes for it, so its Pro block cannot name a value. It still has to exist: the
 * `--ei-*` seeds `pro-theme.css` authors are Effect Index's teal, and dose.wiki's Pro wearing
 * them meant the publication's own Pro style rendered another publication's colour while its Fun
 * rendered plum. This block re-seats them to Orchid's own hue, and Effect Index is untouched
 * because `src/app/_styles/effectindex.ts` imports `styles.css` and `pro-theme.css` and never
 * this sheet — the isolation is a missing import, not a flag anyone can flip.
 *
 * (0,3,1), the same rank as {@link accentProBlockSelector}, so the default sits in the ladder
 * exactly where a named accent does and no source-order tie decides it. That rank is why the
 * `:not()` is BARE: a bare `:not()` takes the specificity of its most specific argument, so
 * `:not([data-accent])` contributes one attribute the way `[data-accent="blue"]` does.
 * `:where(:not([data-accent]))` would contribute nothing, dropping the block to (0,2,1) — level
 * with the Pro palette it exists to override, decided by import order. That is not a style
 * preference; it decides the winner.
 */
export function accentDefaultProBlockSelector(theme: string): string {
  return `html[data-visual-style="pro"]:not([${ACCENT_ATTRIBUTE}])[data-theme="${theme}"]`;
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
function accentFunBlockSelectors(accentId: string, theme: string, isDefault = false): string[] {
  const own = isDefault
    ? accentDefaultFunBlockSelector(theme)
    : accentFunBlockSelector(accentId, theme);
  if (theme !== "dark") return [own];
  const light = isDefault
    ? accentDefaultFunBlockSelector("light")
    : accentFunBlockSelector(accentId, "light");
  return [own, `${light} .${CHROME_DARK_CLASS}`];
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
 *
 * The default accent takes both halves of that treatment unchanged and differs in one thing: its
 * Pro block is keyed by {@link accentDefaultProBlockSelector} rather than by its id, because the
 * bootstrap writes no attribute for it. Its Fun half then emits nothing on its own — the default
 * names no colourway, since Fun's authored palette IS the default — so no `data-accent="default"`
 * selector reaches the sheet from either half.
 */
function accentCss(accent: Accent): string {
  const isDefault = accent.id === BASE_ACCENT_ID;
  const blocks: string[] = [];
  if (!isDefault) {
    for (const theme of ["dark", "light"] as const) {
      blocks.push(
        block(
          accentFunBlockSelectors(accent.id, theme),
          funTokens[accent.id][theme] as Record<string, string>,
        ),
      );
    }
  }

  if (accent.pro) {
    for (const theme of ["dark", "light"] as const) {
      const selector = isDefault
        ? accentDefaultProBlockSelector(theme)
        : accentProBlockSelector(accent.id, theme);
      blocks.push(block([selector], { ...accent.pro[theme] }));
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
   html[${ACCENT_ATTRIBUTE}], and for the default accent it removes the attribute instead of
   naming it — so no selector below names the default by value, and a search for one finds
   nothing on purpose. The default's Fun half is the authored palette and emits nothing; its Pro
   half is keyed by the absence itself, :not([${ACCENT_ATTRIBUTE}]) — bare, so it keeps the
   (0,3,1) every other Pro block has — because pro-theme.css seeds Effect Index's teal and
   dose.wiki's Pro wears its own hue. Effect Index never imports this file. The Theme Lab's own
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
 * The default accent names no value in any selector it emits, so nothing here carries
 * `data-accent="default"`. A stale or retired id therefore matches no block at all — including,
 * on Pro, the default's own block, which is keyed on the attribute's *absence* and so cannot
 * match a root that carries a value. Fun then renders the authored palette, which is what the
 * default renders; Pro renders `pro-theme.css`'s authored teal rather than the default's plum.
 * The gap is narrow by construction: the bootstrap validates against the accent set and removes
 * the attribute when the saved value is unknown, and `applyAppearanceToDocument` writes only
 * resolved ids, so a value no selector names reaches the root only by hand in a devtools pane.
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

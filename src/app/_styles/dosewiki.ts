/**
 * dose.wiki style entry, resolved through the `@site-styles` alias in `next.config.ts`.
 *
 * Order is the contract. The shared sheet establishes the layers, the generated palette
 * presets re-seed the Fun palette on top of them, and the Pro presentation comes next
 * because it is unlayered: unlayered rules beat every layered rule, and among unlayered
 * rules at equal specificity the later sheet wins. Pro is inert until <html> carries
 * data-visual-style="pro", so a Fun reader pays for the bytes and nothing else.
 *
 * The accent axis comes LAST, after Pro, and the reason is specificity arithmetic rather
 * than taste. An accent's Fun block is (0,2,1) — level with a generated colourway block —
 * so it can only re-tint a colourway the reader also has saved by winning the tie on source
 * order, which means landing after `palette-presets.generated.css`, and Pro sits between the
 * two. Being after Pro costs nothing: an accent's Pro block is (0,3,1), a step above the Pro
 * palette it overrides, so it would win from anywhere in the bundle, and every Fun block
 * carries `:where(:not([data-visual-style="pro"]))` precisely so that arriving after Pro
 * cannot let a colourway repaint a Pro page. Both sheets stay below the Theme Lab's runtime
 * user layer, which reaches (0,4,1) by naming data-theme four times.
 *
 * `effectindex.ts` deliberately does NOT import the accent sheet: that publication locks the
 * axis, so `data-accent` is never written there and every byte would be dead.
 */
import "../../styles.css";
import "../../styles/palette-presets.generated.css";
import "../../styles/pro-theme.css";
import "../../styles/surface-tokens.generated.css";
import "../../styles/accent-tokens.generated.css";

/**
 * dose.wiki style entry, resolved through the `@site-styles` alias in `next.config.ts`.
 *
 * Order is the contract, and it now spans two delivery mechanisms. The bundled rungs here:
 * the authored Fun tokens in `styles.css`, then the surface axis, then the accent axis.
 * The Pro presentation (`pro-theme.css`) and the light scheme (`theme-light-mode.css`) are
 * NOT imported any more: both are attribute-gated (inert without
 * html[data-visual-style="pro"] / html[data-theme="light"]), so the default fun+dark reader
 * was paying ~148 KB for rules no selector could match. They ship as static copies in
 * public/ (`npm run generate:appearance-sheets`), attached as late `<link>`s — light-mode,
 * then Pro, then the generated chroma sheet — for exactly the readers whose appearance
 * needs them (`src/theme/appearanceSheets.ts` documents the three attachment paths). The
 * Theme Lab's runtime user layer needs no position in any of this because it reaches
 * (0,4,1) by naming `data-theme` four times and so out-ranks every block below it from
 * wherever it lands.
 *
 * Pro landing AFTER the bundle instead of mid-chain is safe by construction, not by luck.
 * It is unlayered, so it still beats every layered rule; among unlayered rules it now wins
 * source-order ties it used to lose to the sheets below, but no such tie exists: every Fun
 * block in the surface sheet carries `:where(:not([data-visual-style="pro"]))` and cannot
 * match a Pro root at all, the accent sheet's Pro block is (0,3,1) — a step above the Pro
 * palette's (0,2,1), decided by specificity rather than order — and `fun-flat-glow.css`
 * shares no equal-specificity declaration with it (measured, not assumed). What Pro DOES
 * still win by source order is its deliberate re-overrides of equal-specificity light-mode
 * rules, which is why the light link must always precede the Pro link.
 *
 * Surface before accent is specificity arithmetic rather than taste: both Fun blocks are
 * (0,2,1) — level with each other — so their relative order is what lets the accent tint
 * the surface instead of having the surface overwrite the accent. Both sheets emit only
 * the base Orchid/Default colourway now; every other look is the hue/saturation rotation
 * the generated chroma stylesheet applies on top.
 *
 * `effectindex.ts` deliberately does NOT import the accent sheet: that publication locks
 * the axis, so dose.wiki's plum Pro seeds would be dead bytes over its authored teal.
 *
 * `fun-flat-glow.css` is last and lowest-stakes: it re-seats the accent bloom recipes on
 * `body` for every route except the homepage, so nothing above it has to know the rule
 * exists. Effect Index does not import it — that publication is Pro-locked and Pro has no
 * bloom to remove.
 */
import "../../styles.css";
import "../../styles/surface-tokens.generated.css";
import "../../styles/accent-tokens.generated.css";
import "../../styles/fun-flat-glow.css";
// The reader's font axis. dose.wiki-only on the accent sheet's reasoning: Effect Index
// locks the axis, so the blocks would be dead bytes over its authored Titillium. Position
// in the bundle is immaterial — the chosen-face blocks out-specify the Pro re-seat rather
// than out-ordering it (see the header comment in the sheet) — but it sits last as the
// most derived rung of the chain.
import "../../styles/font-type.css";

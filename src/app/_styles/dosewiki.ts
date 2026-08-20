/**
 * dose.wiki style entry, resolved through the `@site-styles` alias in `next.config.ts`.
 *
 * Order is the contract. Four rungs, each able to re-tint the one before it: the authored Fun
 * tokens in `styles.css`, then Pro, then the surface axis, then the accent axis. The Theme Lab's
 * runtime user layer is a fifth rung, injected rather than imported, and it needs no position in
 * this list because it reaches (0,4,1) by naming `data-theme` four times and so out-ranks every
 * block below it from wherever it lands.
 *
 * Pro comes second because it is unlayered: unlayered rules beat every layered rule, and among
 * unlayered rules at equal specificity the later sheet wins. Pro is inert until <html> carries
 * data-visual-style="pro", so a Fun reader pays for the bytes and nothing else.
 *
 * Surface before accent, and both after Pro, is specificity arithmetic rather than taste. The
 * base surface's Fun block and the base accent's Fun block are both (0,2,1) — level with each
 * other and with the Pro palette — so their relative order is what decides who wins: the accent
 * lands later, which is what lets the accent tint the surface instead of having the surface
 * overwrite the accent. Being after Pro costs neither of them anything, because every Fun block
 * carries `:where(:not([data-visual-style="pro"]))` and so cannot match a Pro root at all, while
 * the accent's Pro block is (0,3,1), a step above the Pro palette it re-seats. Both sheets emit
 * only the base Orchid/Default colourway now; every other look is the hue/saturation rotation
 * the generated chroma stylesheet applies on top.
 *
 * `effectindex.ts` deliberately does NOT import the accent sheet: that publication locks the
 * axis, so dose.wiki's plum Pro seeds would be dead bytes over its authored teal.
 *
 * `fun-flat-glow.css` is last and lowest-stakes: it re-seats the accent bloom recipes on
 * `body` for every route except the homepage, so nothing above it has to know the rule
 * exists. Effect Index does not import it — that publication is Pro-locked and Pro has no
 * bloom to remove.
 */
import "../../styles.css";
import "../../styles/pro-theme.css";
import "../../styles/surface-tokens.generated.css";
import "../../styles/accent-tokens.generated.css";
import "../../styles/fun-flat-glow.css";

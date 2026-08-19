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
 * Surface before accent, and both after Pro, is specificity arithmetic rather than taste. A
 * surface's Fun block and an accent's Fun block are both (0,2,1) — level with each other and
 * with the Pro palette — so their relative order is what decides who wins: the accent lands
 * later, which is what lets a reader tint the surface they chose instead of having the surface
 * overwrite the accent. Being after Pro costs neither of them anything, because every Fun block
 * carries `:where(:not([data-visual-style="pro"]))` and so cannot match a Pro root at all, while
 * their Pro blocks are (0,3,1), a step above the Pro palette they re-seat.
 *
 * `effectindex.ts` deliberately does NOT import the accent sheet: that publication locks the
 * axis, so `data-accent` is never written there and every byte would be dead.
 */
import "../../styles.css";
import "../../styles/pro-theme.css";
import "../../styles/surface-tokens.generated.css";
import "../../styles/accent-tokens.generated.css";

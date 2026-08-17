/**
 * dose.wiki style entry, resolved through the `@site-styles` alias in `next.config.ts`.
 *
 * Order is the contract. The shared sheet establishes the layers, the generated palette
 * presets re-seed the Fun palette on top of them, and the Pro presentation comes LAST
 * because it is unlayered: unlayered rules beat every layered rule, and among unlayered
 * rules at equal specificity the later sheet wins. Pro is inert until <html> carries
 * data-visual-style="pro", so a Fun reader pays for the bytes and nothing else.
 */
import "../../styles.css";
import "../../styles/palette-presets.generated.css";
import "../../styles/pro-theme.css";

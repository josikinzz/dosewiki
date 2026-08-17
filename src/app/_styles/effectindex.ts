/**
 * Effect Index style entry, resolved through the `@site-styles` alias in `next.config.ts`.
 *
 * Same two-step as the dose.wiki entry minus the Fun palette presets, which this
 * publication never wears: the shared sheet first, the unlayered Pro presentation last so
 * it wins the cascade. The attribute it keys on is always "pro" here, because this
 * flavor's appearance policy locks the style.
 */
import "../../styles.css";
import "../../styles/pro-theme.css";

/**
 * Effect Index style entry, resolved through the `@site-styles` alias in `next.config.ts`.
 *
 * Only the shared sheet: the Pro presentation and the light scheme this publication locks
 * and defaults to are no longer bundled anywhere. Both arrive as server-rendered `<link>`s
 * in the layout head instead — this flavor's appearance policy locks the style to "pro"
 * and defaults the scheme to "light", so the server always knows both sheets are needed
 * and renders them parser-visible (`src/theme/appearanceSheets.ts`). A reader whose saved
 * scheme is dark simply never matches the light sheet's `[data-theme="light"]` selectors,
 * exactly as when it travelled in the bundle.
 */
import "../../styles.css";

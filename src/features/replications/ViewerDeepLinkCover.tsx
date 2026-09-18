import { REPLICATION_VIEWER_PARAM } from "./galleryUrlState";

/**
 * The deep-link cover: a black full-viewport sheet baked into the static HTML
 * of every surface that opens the shared replication viewer from `?viewer=`.
 *
 * Those routes are statically rendered on the hourly ISR window, so the server
 * cannot vary the payload on the query string — the same constraint that put
 * the browse state behind `useSearchParams`. Without the cover a deep link
 * paints the masonry/index first and only covers it once hydration opens the
 * overlay dialog. Instead, the cover ships hidden in every payload and the
 * inline reveal script below — the same pre-paint slot as the theme bootstrap
 * in `src/app/layout.tsx` — turns it on while the document is still parsing,
 * so a deep link's first paint is black and the index markup that follows it
 * in document order can never flash.
 *
 * Lifecycle, owned by the client component that renders it:
 *  - viewer param absent or resolving to no known work → the consumer calls
 *    `dismissViewerDeepLinkCover()` from its resolution effect, dropping the
 *    cover so the index shows with the existing "no longer available" notice;
 *  - viewer param valid → the cover stays put underneath the opaque dialog
 *    (z-[70], above the cover's z-[69]) through its fade-in, and is dismissed
 *    when the viewer closes.
 *
 * Fail-safes against a stranded black screen: without JavaScript the script
 * never runs and the cover stays hidden; if the reveal ran but hydration never
 * completes, the CSS timeout animation lifts the cover on its own. `/dev`
 * routes carry a nonce-based script-src that blocks this inline script — the
 * cover simply stays hidden there, which is the harmless direction.
 */

/** Kept in lockstep with the literal `data-replication-viewer-cover=""` in the JSX below. */
const COVER_ATTRIBUTE = "data-replication-viewer-cover";

/**
 * The reveal flag lives on <html> — the same channel as the theme bootstrap —
 * because React never renders that attribute, so flipping it pre-paint cannot
 * create a hydration mismatch the way writing to the cover's own React-managed
 * `style` attribute would.
 */
const REVEAL_FLAG = "data-viewer-deep-link";

const REVEAL_SCRIPT =
  `try{if(new URLSearchParams(location.search).has("${REPLICATION_VIEWER_PARAM}"))` +
  `document.documentElement.setAttribute("${REVEAL_FLAG}","")}catch(e){}`;

/**
 * display:none elements do not run animations, so the escape-hatch countdown
 * starts only once the reveal flag actually shows the cover.
 */
const COVER_CSS =
  `html[${REVEAL_FLAG}] [${COVER_ATTRIBUTE}]{display:block}` +
  "@keyframes replication-viewer-cover-timeout{to{visibility:hidden}}";

/**
 * Render once per viewer-opening surface, ahead of the markup it must cover.
 * The `<script>` sibling must stay after the sheet: it runs synchronously the
 * moment the parser reaches it, before any later markup can paint.
 */
export function ViewerDeepLinkCover() {
  return (
    <>
      <style>{COVER_CSS}</style>
      <div
        data-replication-viewer-cover=""
        aria-hidden
        className="fixed inset-0 z-[69] hidden bg-black"
        style={{
          animation: "replication-viewer-cover-timeout 0s linear 10s forwards",
        }}
      />
      <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
    </>
  );
}

/**
 * Drop every cover on the page by clearing the reveal flag. Idempotent — safe
 * to call from resolution effects and close handlers alike, whether or not the
 * reveal ever ran. The covers themselves stay in the DOM untouched: React owns
 * them, and only the CSS reveal rule keyed on the flag ever shows them.
 */
export function dismissViewerDeepLinkCover() {
  document.documentElement.removeAttribute(REVEAL_FLAG);
}

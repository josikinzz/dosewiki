/**
 * Iconify glyphs inlined as an SVG sprite.
 *
 * The coverage table draws up to 4,600 cells. Rendering each one through the
 * shared `Icon` component would mount thousands of client components that each
 * resolve their artwork over the network, so the handful of icons the table
 * needs are embedded once as `<symbol>` definitions and referenced per cell with
 * `<use>`. The rest of the page — the page header, the section column headers —
 * still uses the normal `Icon` component and its runtime resolution.
 *
 * Path data is copied verbatim from the Iconify API. To refresh or swap an icon:
 *
 *     curl -s 'https://api.iconify.design/ph.json?icons=quotes-fill'
 *
 * and paste the returned `body`, keeping `viewBox` aligned with the source set's
 * dimensions (`ph` is 256×256, `qlementine-icons` is 16×16).
 */
export interface CoverageGlyph {
  /** The Iconify name this artwork came from. */
  iconifyName: string;
  viewBox: string;
  body: string;
}

export const COVERAGE_GLYPHS = {
  emptySlot: {
    iconifyName: "qlementine-icons:empty-slot-16",
    viewBox: "0 0 16 16",
    body: '<path fill="currentColor" d="M4 2c-1.1 0-2 .895-2 2v.5a.5.5 0 0 0 1 0V4a1 1 0 0 1 1-1h.5a.5.5 0 0 0 0-1zm10 2.5V4c0-1.1-.895-2-2-2h-.5a.5.5 0 0 0 0 1h.5a1 1 0 0 1 1 1v.5a.5.5 0 0 0 1 0M12 14h-.5a.5.5 0 0 1 0-1h.5a1 1 0 0 0 1-1v-.5a.5.5 0 0 1 1 0v.5c0 1.1-.895 2-2 2M2 12c0 1.1.895 2 2 2h.5a.5.5 0 0 0 0-1H4a1 1 0 0 1-1-1v-.5a.5.5 0 0 0-1 0zm5-9.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5m-4 5a.5.5 0 0 0-1 0v1a.5.5 0 0 0 1 0zm4 6a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5m7-6a.5.5 0 0 0-1 0v1a.5.5 0 0 0 1 0z"/>',
  },
  quotes: {
    iconifyName: "ph:quotes-fill",
    viewBox: "0 0 256 256",
    body: '<path fill="currentColor" d="M116 72v88a48.05 48.05 0 0 1-48 48a8 8 0 0 1 0-16a32 32 0 0 0 32-32v-8H40a16 16 0 0 1-16-16V72a16 16 0 0 1 16-16h60a16 16 0 0 1 16 16m100-16h-60a16 16 0 0 0-16 16v64a16 16 0 0 0 16 16h60v8a32 32 0 0 1-32 32a8 8 0 0 0 0 16a48.05 48.05 0 0 0 48-48V72a16 16 0 0 0-16-16"/>',
  },
  warningCircle: {
    iconifyName: "ph:warning-circle-fill",
    viewBox: "0 0 256 256",
    body: '<path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m-8 56a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0Zm8 104a12 12 0 1 1 12-12a12 12 0 0 1-12 12"/>',
  },
} as const satisfies Record<string, CoverageGlyph>;

export type CoverageGlyphKey = keyof typeof COVERAGE_GLYPHS;

/**
 * Edge length of a status glyph, in pixels.
 *
 * Applied as SVG `width`/`height` attributes rather than utility classes: an
 * SVG with no intrinsic size falls back to 300×150, so a class that fails to
 * reach the stylesheet would not shrink the mark, it would detonate the row.
 */
export const GLYPH_SIZE = 15;

/** DOM id for a sprite symbol, referenced as `<use href="#...">`. */
export function coverageGlyphId(key: CoverageGlyphKey): string {
  return `coverage-glyph-${key}`;
}

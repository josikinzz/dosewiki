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
  sealCheck: {
    iconifyName: "ph:seal-check-fill",
    viewBox: "0 0 256 256",
    body: '<path fill="currentColor" d="M225.86 102.82c-3.77-3.94-7.67-8-9.14-11.57c-1.36-3.27-1.44-8.69-1.52-13.94c-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52c-3.56-1.47-7.63-5.37-11.57-9.14C146.28 23.51 138.44 16 128 16s-18.27 7.51-25.18 14.14c-3.94 3.77-8 7.67-11.57 9.14c-3.25 1.36-8.69 1.44-13.94 1.52c-9.76.15-20.82.31-28.51 8s-7.8 18.75-8 28.51c-.08 5.25-.16 10.67-1.52 13.94c-1.47 3.56-5.37 7.63-9.14 11.57C23.51 109.72 16 117.56 16 128s7.51 18.27 14.14 25.18c3.77 3.94 7.67 8 9.14 11.57c1.36 3.27 1.44 8.69 1.52 13.94c.15 9.76.31 20.82 8 28.51s18.75 7.85 28.51 8c5.25.08 10.67.16 13.94 1.52c3.56 1.47 7.63 5.37 11.57 9.14c6.9 6.63 14.74 14.14 25.18 14.14s18.27-7.51 25.18-14.14c3.94-3.77 8-7.67 11.57-9.14c3.27-1.36 8.69-1.44 13.94-1.52c9.76-.15 20.82-.31 28.51-8s7.85-18.75 8-28.51c.08-5.25.16-10.67 1.52-13.94c1.47-3.56 5.37-7.63 9.14-11.57c6.63-6.9 14.14-14.74 14.14-25.18s-7.51-18.27-14.14-25.18m-52.2 6.84l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 11.32"/>',
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

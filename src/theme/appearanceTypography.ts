/**
 * Runtime surface of the reader's reading-type axes: text size, letter spacing and
 * line height. Paragraph spacing is deliberately NOT an axis: the rhythm between the
 * article's text blocks is a fixed site value (2x the font size, see
 * `.theme-article-flow` / the `.prose` stack), not a reader preference.
 *
 * The runtime only writes on the root — up to three custom properties and one engage
 * attribute — and the
 * pre-paint bootstrap inlines the same constants and domains, so the two writers cannot
 * disagree about what a stored number means. Kept deliberately tiny and free of heavy
 * imports for the same reason `appearanceChroma.ts` is: this module is inlined into
 * `src/theme/index.ts`, whose bootstrap ships on every page of both publications.
 *
 * A reader who never moved a slider stores nothing and paints nothing: the absence of
 * each root write IS the site default, so a future default change reaches every reader
 * who never chose. The axes therefore engage only for a reader with at least one saved
 * value — a locked publication (Effect Index) and an untouched reader render the authored
 * type exactly as before.
 */

/**
 * The text size axis is a unitless SCALE over the site's font sizes, written to
 * `--dw-reader-text-scale` on the root. The consumption side (base.css) multiplies the
 * Tailwind `--text-*` variables and the repo's `--type-size-*` tokens by it, so every
 * font size moves while every rem-based margin, padding, gap and container stays put —
 * reading comfort without reproducing browser zoom. It also keeps the fixed paragraph
 * rhythm ("2x the font size") honest: 2rem is authored against the unchanged root, so
 * the rhythm does not drift when the reader scales their text.
 */
export const TEXT_SIZE_PROPERTY = "--dw-reader-text-scale";
export const TEXT_SIZE_RANGE = [0.8, 1.3] as const;

/**
 * Letter spacing rides the existing body tracking token: writing it at the root
 * out-ranks every stylesheet re-seat of the same property (the Pro and face blocks set
 * it to zero), which is exactly the precedence a reader's explicit choice should have.
 * A saved value is an em number; the authored body tracking is -0.01em.
 */
export const READER_TRACKING_PROPERTY = "--type-tracking-body";
export const READER_TRACKING_RANGE = [-0.05, 0.15] as const;

/**
 * Line height must beat the per-paragraph Tailwind leading utilities on the reading
 * surface, which a bare custom property cannot do — so the axis also engages an
 * attribute that lifts one rule above them. Unitless, per the CSS line-height grammar.
 */
export const READER_LEADING_ATTRIBUTE = "data-reader-leading";
export const READER_LEADING_PROPERTY = "--dw-reader-leading";
export const READER_LEADING_RANGE = [1.2, 2.2] as const;

/** Where each slider rests while the reader has never saved a value. */
export const DEFAULT_TEXT_SIZE = 1;
/** Lexend's generous letterfit is the default face's whole point, so it rests at zero. */
export const DEFAULT_LETTER_SPACING_LEXEND = 0;
export const DEFAULT_LETTER_SPACING_STANDARD = -0.01;
export const DEFAULT_LINE_HEIGHT = 1.7;

/**
 * A stored axis number is a finite decimal inside its slider domain; anything else
 * reads as null — "the reader never saved one" — with the same null-vs-default split
 * the chroma parsers carry. NaN fails every comparison, so a blocked or missing read
 * resolves to null rather than to the domain edge.
 */
export function parseAxisNumber(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function clampAxisNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type ReaderTypeCoordinates = {
  /** Unitless scale on the TEXT_SIZE_RANGE, or null when the axis is locked. */
  readonly textSize: number | null;
  /** em on the READER_TRACKING_RANGE, or null under a lock. */
  readonly letterSpacing: number | null;
  /** Unitless on the READER_LEADING_RANGE, or null under a lock. */
  readonly lineHeight: number | null;
};

/**
 * Write the reading-type axes to the root. A number is always present on an unlocked
 * axis the reader has saved; null means "this axis is locked" or "back to the site
 * default" — both remove the write. All three null (Effect Index, or a reader who
 * tuned nothing) leaves the document carrying no reader type at all, so the authored
 * sheet renders exactly as before this axis existed. Synchronous by design: one call
 * is one write batch; the provider rAF-throttles its calls during a slider drag.
 *
 * The written values carry their CSS units — a bare unitless number for the text-scale
 * (it multiplies other lengths) and for the unitless leading, em on tracking. A bare
 * number would substitute into `letter-spacing` as an invalid value and silently knock
 * the whole property back to its inherited value — which is exactly the "the slider
 * does nothing" failure, so the unit is part of the write, not the consumer's job.
 */
export function applyReaderTypeToDocument({
  textSize,
  letterSpacing,
  lineHeight,
}: ReaderTypeCoordinates): void {
  const root = document.documentElement;

  if (textSize === null) {
    root.style.removeProperty(TEXT_SIZE_PROPERTY);
  } else {
    root.style.setProperty(TEXT_SIZE_PROPERTY, String(textSize));
  }

  if (letterSpacing === null) {
    root.style.removeProperty(READER_TRACKING_PROPERTY);
  } else {
    root.style.setProperty(READER_TRACKING_PROPERTY, `${letterSpacing}em`);
  }

  if (lineHeight === null) {
    root.removeAttribute(READER_LEADING_ATTRIBUTE);
    root.style.removeProperty(READER_LEADING_PROPERTY);
  } else {
    root.setAttribute(READER_LEADING_ATTRIBUTE, "");
    root.style.setProperty(READER_LEADING_PROPERTY, String(lineHeight));
  }
}
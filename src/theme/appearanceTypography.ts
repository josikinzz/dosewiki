export const TEXT_SIZE_PROPERTY = "--dw-reader-text-scale";
export const TEXT_SIZE_RANGE = [0.8, 1.3] as const;

export const READER_TRACKING_PROPERTY = "--type-tracking-body";
export const READER_TRACKING_RANGE = [-0.05, 0.15] as const;

export const READER_LEADING_ATTRIBUTE = "data-reader-leading";
export const READER_LEADING_PROPERTY = "--dw-reader-leading";
export const READER_LEADING_RANGE = [1.2, 2.2] as const;

export const DEFAULT_TEXT_SIZE = 1;
export const DEFAULT_LETTER_SPACING_LEXEND = 0;
export const DEFAULT_LETTER_SPACING_STANDARD = -0.01;
export const DEFAULT_LINE_HEIGHT = 1.7;

export function parseAxisNumber(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function clampAxisNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type ReaderTypeCoordinates = {
  readonly textSize: number | null;
  readonly letterSpacing: number | null;
  readonly lineHeight: number | null;
};

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
import {
  STUB_THRESHOLD,
  type ArticleStubReason,
} from "@/schema/substance/articleStubPolicy";
import type { CoverageGlyphKey } from "./coverageGlyphs";
import type {
  CoverageBibliographyState,
  CoverageCitationStatus,
  CoverageContentStatus,
} from "./coverageModel";

/**
 * Cell tone.
 *
 * The table exists to find gaps, so gaps are what carry colour. A section that
 * is written and cited is the unremarkable case and recedes to a quiet mark —
 * 4,600 cells of green would drown the handful of cells worth acting on.
 */
export type CoverageTone = "success" | "warning" | "quiet" | "blank";

export interface CoverageStatusDisplay {
  label: string;
  /** Shown in the legend, and as the cell tooltip. */
  description: string;
  tone: CoverageTone;
  /** Omitted for statuses drawn as a plain mark rather than an icon. */
  glyph?: CoverageGlyphKey;
  /** Character drawn when there is no glyph. */
  mark?: string;
}

export const COVERAGE_CONTENT_DISPLAY: Record<
  CoverageContentStatus,
  CoverageStatusDisplay
> = {
  filled: {
    label: "Written",
    description: "The section has publishable content.",
    tone: "quiet",
    mark: "•",
  },
  empty: {
    label: "Empty",
    description: "The section has no content and renders a gap notice.",
    tone: "warning",
    glyph: "emptySlot",
  },
};

export const COVERAGE_CITATION_DISPLAY: Record<
  CoverageCitationStatus,
  CoverageStatusDisplay
> = {
  cited: {
    label: "Cited",
    description: "The section carries citation markers.",
    tone: "success",
    glyph: "quotes",
  },
  bare: {
    label: "No citations",
    description:
      "A citation pass has run over this article and this section still came away with none.",
    tone: "warning",
    glyph: "warningCircle",
  },
  unattempted: {
    label: "No pass yet",
    description:
      "The article has no structured bibliography, so no citation pass has reached this section.",
    tone: "quiet",
    mark: "–",
  },
  "not-applicable": {
    label: "No content",
    description: "The section is empty, so there is nothing to cite.",
    tone: "blank",
  },
};

/**
 * The stub column, reusing the warning vocabulary rather than inventing a
 * status of its own. A non-stub article is the unremarkable case and draws
 * nothing, matching how `not-applicable` recedes in the citation view.
 */
export const COVERAGE_STUB_DISPLAY: Record<
  "stub" | "complete",
  CoverageStatusDisplay
> = {
  stub: {
    label: "Stub",
    description: `The article page banners this as a stub: ${STUB_THRESHOLD} or more editorial sections are empty, or it publishes no dosage or duration data.`,
    tone: "warning",
    glyph: "warningCircle",
  },
  complete: {
    label: "Not a stub",
    description: "The article clears the stub threshold.",
    tone: "blank",
  },
};

/**
 * The manual review column. Reviewed articles are the ones worth celebrating
 * — with most of the corpus still waiting, colouring the unreviewed majority
 * would drown the table, so the finished state carries the mark instead.
 */
export const COVERAGE_REVIEW_DISPLAY: Record<
  "reviewed" | "unreviewed",
  CoverageStatusDisplay
> = {
  reviewed: {
    label: "Reviewed",
    description:
      "An editor has completed the manual review of this article (marked in the dev editor).",
    tone: "success",
    glyph: "sealCheck",
  },
  unreviewed: {
    label: "Not reviewed",
    description: "Manual editorial review has not been completed yet.",
    tone: "quiet",
    mark: "–",
  },
};

/** Why the stub policy flagged an article, phrased for a cell tooltip. */
export const COVERAGE_STUB_REASON_LABEL: Record<ArticleStubReason, string> = {
  "missing-sections": `${STUB_THRESHOLD} or more editorial sections empty`,
  "no-dosage": "no dosage or duration data",
};

export const COVERAGE_BIBLIOGRAPHY_DISPLAY: Record<
  CoverageBibliographyState,
  { label: string; description: string }
> = {
  structured: {
    label: "Pass run",
    description: "The article carries a structured bibliography.",
  },
  legacy: {
    label: "Legacy only",
    description:
      "The article still has pre-pipeline citation lists, which is not a citation pass.",
  },
  none: {
    label: "No sources",
    description: "The article has no bibliography of any kind.",
  },
};

/** Text colour per tone, via the shared `dose-*` token aliases. */
export const COVERAGE_TONE_CLASS: Record<CoverageTone, string> = {
  success: "text-dose-success",
  warning: "text-dose-warning",
  quiet: "text-dose-text-ghost",
  blank: "text-dose-text-ghost",
};

import { GLYPH_SIZE, coverageGlyphId } from "./coverageGlyphs";
import { cn } from "@/lib/utils";
import {
  COVERAGE_CITATION_DISPLAY,
  COVERAGE_CONTENT_DISPLAY,
  COVERAGE_REVIEW_DISPLAY,
  COVERAGE_STUB_DISPLAY,
  COVERAGE_TONE_CLASS,
  type CoverageStatusDisplay,
} from "./coverageStatusDisplay";

function LegendRow({ display }: { display: CoverageStatusDisplay }) {
  const toneClass = COVERAGE_TONE_CLASS[display.tone];

  return (
    <li className="flex items-baseline gap-3">
      <span className="flex w-4 shrink-0 justify-center">
        {display.glyph ? (
          <svg
            aria-hidden
            width={GLYPH_SIZE}
            height={GLYPH_SIZE}
            className={cn("block translate-y-0.5", toneClass)}
            focusable="false"
          >
            <use href={`#${coverageGlyphId(display.glyph)}`} />
          </svg>
        ) : (
          <span aria-hidden className={toneClass}>
            {display.mark ?? " "}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="theme-text-primary text-sm font-semibold">
          {display.label}
        </span>{" "}
        <span className="theme-text-faint text-sm">{display.description}</span>
      </span>
    </li>
  );
}

/**
 * The two status vocabularies, side by side.
 *
 * Both are shown at once rather than following the active view, because the
 * point of the citation column is the contrast between its three "uncited"
 * states, and that only reads when they can be compared.
 */
export function CoverageLegend() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <h3 className="theme-text-faint mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]">
          Content coverage
        </h3>
        <ul className="space-y-2">
          {Object.entries(COVERAGE_CONTENT_DISPLAY).map(([key, display]) => (
            <LegendRow key={key} display={display} />
          ))}
        </ul>
      </div>
      <div>
        <h3 className="theme-text-faint mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]">
          Citation coverage
        </h3>
        <ul className="space-y-2">
          {Object.entries(COVERAGE_CITATION_DISPLAY).map(([key, display]) => (
            <LegendRow key={key} display={display} />
          ))}
        </ul>
      </div>
      <div>
        <h3 className="theme-text-faint mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]">
          Article columns
        </h3>
        <ul className="space-y-2">
          <li className="flex items-baseline gap-3">
            <span className="theme-text-faint flex w-4 shrink-0 justify-center text-xs tabular-nums">
              /
            </span>
            <span className="min-w-0">
              <span className="theme-text-primary text-sm font-semibold">
                ROA
              </span>{" "}
              <span className="theme-text-faint text-sm">
                Routes carrying an empty table, over routes the article claims.
                Counts both a route that renders nothing at all — dropped from
                the tab strip, so the ROA is claimed in the data and shown
                nowhere — and one whose dosage or duration half is an all-null
                scaffold behind a populated other half. A dosage section counted
                as written can still be mostly hollow.
              </span>
            </span>
          </li>
          {Object.entries(COVERAGE_STUB_DISPLAY).map(([key, display]) => (
            <LegendRow key={key} display={display} />
          ))}
          {Object.entries(COVERAGE_REVIEW_DISPLAY).map(([key, display]) => (
            <LegendRow key={key} display={display} />
          ))}
        </ul>
      </div>
    </div>
  );
}

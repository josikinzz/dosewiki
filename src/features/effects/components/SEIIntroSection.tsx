import { Fragment, memo } from "react";
import { applyPlaceholders } from "@/data/content/about";
import {
  SEI_INTRO_COPY_FALLBACK,
  type SEIIntroCopy,
} from "./seiIntroCopy";

export { SEI_INTRO_COPY_FALLBACK, type SEIIntroCopy };

/**
 * Renders the one accent-emphasised phrase a lead paragraph may carry.
 *
 * The lead is stored as plain prose with `**…**` around the phrase that has
 * always rendered in the accent treatment, so an editor can move or reword it
 * without the component hardcoding which words are emphasised. Only this one
 * inline form is understood — it is not general Markdown.
 */
function renderAccentEmphasis(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="theme-accent-emphasis font-semibold">
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

interface SEIIntroSectionProps {
  effectCount: number;
  /** Optional tab-specific intro blob text */
  tabBlob?: string;
  /** Editable prose; falls back to the strings this section shipped with. */
  copy?: SEIIntroCopy;
}

// Shared visual contract with the Substance Index intro (CategoryIntro) so the
// two index definitions read as the same element: a left-aligned ~70ch reading
// column on the secondary text token, with the bold lead-in carrying the accent
// emphasis. Kept in sync by hand — both surfaces use these exact utilities.
const introColumnClass =
  "mx-auto mt-6 mb-10 flex max-w-[70ch] flex-col px-4 text-left sm:mt-7";
const introParagraphClass =
  "theme-text-secondary text-pretty text-[0.96875rem] leading-[1.62] sm:text-base sm:leading-[1.66]";

/**
 * Intro section for the Subjective Effect Index.
 *
 * Rendered on the category tabs (Sensory/Cognitive/Physical) as a single
 * tab-specific blob, and on the "More Info" tab as the index's full
 * three-paragraph thesis. The "All Effects" tab renders nothing — the grid
 * opens straight into the categories.
 *
 * Visual treatment is unified with the Substance Index intro (CategoryIntro):
 * a centered ~70ch column, left-aligned prose, and the shared gradient hairline
 * rule above.
 */
export const SEIIntroSection = memo(function SEIIntroSection({
  effectCount,
  tabBlob,
  copy = SEI_INTRO_COPY_FALLBACK,
}: SEIIntroSectionProps) {
  // On the category tabs a tab-specific blob replaces the general intro,
  // mirroring how the Substance Index swaps its intro copy per category tab.
  if (tabBlob) {
    return (
      <div className={introColumnClass}>
        <span
          aria-hidden
          className="theme-horizontal-divider"
        />
        <p className={`mt-4 ${introParagraphClass}`}>{tabBlob}</p>
      </div>
    );
  }

  return (
    <div className={introColumnClass}>
      {/* Hairline rule: shared with the Substance Index intro — the site's
          gradient index divider, spanning the reading column and sitting flush
          above the left-aligned prose. */}
      <span
        aria-hidden
        className="theme-horizontal-divider"
      />

      {/* Main intro paragraph */}
      <p className={`mt-4 ${introParagraphClass}`}>
        {renderAccentEmphasis(applyPlaceholders(copy.lead, { effectCount }))}
      </p>

      <div className="mt-4 space-y-4">
        <p className={introParagraphClass}>{copy.method}</p>

        <p className={introParagraphClass}>{copy.organisation}</p>
      </div>
    </div>
  );
});

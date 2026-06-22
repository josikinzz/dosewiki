import { useState, memo } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";

interface SEIIntroSectionProps {
  effectCount: number;
  /** Optional tab-specific intro blob text */
  tabBlob?: string;
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
 * Intro section for the Subjective Effect Index with expandable content.
 *
 * Contains the main description paragraph always visible, with additional
 * context shown on toggle. Tab-specific intro blobs can be passed for
 * Sensory/Cognitive/Physical tabs.
 *
 * Visual treatment is unified with the Substance Index intro (CategoryIntro):
 * a centered ~70ch column, left-aligned prose, and the shared gradient hairline
 * rule above. The first-sentence + see-more pill is kept here because the
 * "All Effects" intro runs to three paragraphs; the single-paragraph tab blobs
 * — like the Substance Index definitions — show in full.
 */
export const SEIIntroSection = memo(function SEIIntroSection({
  effectCount,
  tabBlob,
}: SEIIntroSectionProps) {
  const [expanded, setExpanded] = useState(false);

  // On the "All Effects" tab no tab-specific blob is provided, so the generic
  // Subjective Effect Index intro shows. On the other tabs we swap it out for
  // just that tab's blob, mirroring how the Substance Index swaps its intro
  // copy per category tab.
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
        The{" "}
        <span className="theme-accent-emphasis font-semibold">
          Subjective Effect Index
        </span>{" "}
        is a comprehensive catalogue of {effectCount} subjective effects that may
        occur under the influence of psychoactive substances.
        {!expanded && (
          <span className="ml-2 inline-flex align-middle">
            <ExpandButton
              isExpanded={false}
              onToggle={() => setExpanded(true)}
              variant="faint"
              ariaLabel="Expand Subjective Effect Index introduction"
            />
          </span>
        )}
      </p>

      {/* Expandable content */}
      {expanded && (
        <div className="mt-4 space-y-4">
          <p className={introParagraphClass}>
            The effects are accompanied by detailed descriptions written in a
            consistent style that avoids flowery metaphors, using simple and
            accessible language to serve as a universal terminology for
            communicating experiences that are difficult to convey.
          </p>

          <p className={introParagraphClass}>
            Effects are organised into categories based on the senses they affect
            and their behavior, with many broken down into leveling systems,
            subcomponents, and style variations. Image, video, and audio
            replications supplement text-based descriptions.
            <span className="ml-2 inline-flex align-middle">
              <ExpandButton
                isExpanded={true}
                onToggle={() => setExpanded(false)}
                variant="faint"
                ariaLabel="Collapse Subjective Effect Index introduction"
              />
            </span>
          </p>
        </div>
      )}
    </div>
  );
});

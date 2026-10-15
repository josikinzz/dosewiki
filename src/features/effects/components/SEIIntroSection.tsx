import { Fragment, memo } from "react";
import { applyPlaceholders } from "@/data/content/about";
import {
  SEI_INTRO_COPY_FALLBACK,
  type SEIIntroCopy,
} from "./seiIntroCopy";

export { SEI_INTRO_COPY_FALLBACK, type SEIIntroCopy };

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
  tabBlob?: string;
  copy?: SEIIntroCopy;
}

const introColumnClass =
  "mx-auto mt-6 mb-10 flex max-w-[70ch] flex-col px-4 text-left sm:mt-7";
const introParagraphClass =
  "theme-text-secondary text-pretty text-[0.96875rem] leading-[1.62] sm:text-base sm:leading-[1.66]";

export const SEIIntroSection = memo(function SEIIntroSection({
  effectCount,
  tabBlob,
  copy = SEI_INTRO_COPY_FALLBACK,
}: SEIIntroSectionProps) {
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
      <span
        aria-hidden
        className="theme-horizontal-divider"
      />

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

"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/**
 * The sitewide red beta disclaimer: shimmering danger-toned sentence flanked by
 * construction glyphs, with only "our docs" linking to /docs/how.
 *
 * One copy of the markup for its two homes — the Substance Index page header
 * description and the substance-article top slot, where it replaces the stored
 * "citation system overhaul" warning-banner preset once the citation audit has
 * stripped a refuted marker on that article (`substanceHasCitationNeeded`).
 * The shimmer and its reduced-motion/`background-clip` fallbacks live in
 * `.theme-beta-shimmer` (src/styles/utilities-theme.css).
 *
 * The construction glyphs hang just outside the sentence: the wrapper shrinks
 * to fit the copy (one line where it fits, wrapping only when the viewport
 * forces it), and the icons are absolutely positioned in the side padding so
 * narrow viewports never push them to the container edges.
 *
 * Below `md` the copy always wraps, and the parent's `text-balance` would leave
 * lines far shorter than the box, stranding the icons at the box edges. There
 * the shell caps its width and wraps `pretty` so lines fill the box, and the
 * icons grow to suit the taller multi-line block.
 */
export function BetaDisclaimer({ className }: { className?: string }) {
  const t = useT();

  return (
    <span
      className={cn(
        "theme-beta-disclaimer-shell relative mx-auto block w-fit px-7",
        "max-md:max-w-[24rem] max-md:px-10 max-md:[text-wrap:pretty]",
        className,
      )}
    >
      <Icon
        icon="lucide:construction"
        size="1.25rem"
        className="theme-beta-disclaimer-icon absolute left-0 top-1/2 -translate-y-1/2 max-md:h-7 max-md:w-7"
      />
      <span className="theme-beta-shimmer">
        {t("dose.wiki is still in beta. Entries may contain inaccuracies and/or lack citations. See")}{" "}
        <SmartLink
          href="/docs/how"
          className="theme-beta-disclaimer underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {t("our docs")}
        </SmartLink>{" "}
        {t("for more info.")}
      </span>
      <Icon
        icon="lucide:construction"
        size="1.25rem"
        className="theme-beta-disclaimer-icon absolute right-0 top-1/2 -translate-y-1/2 max-md:h-7 max-md:w-7"
      />
    </span>
  );
}

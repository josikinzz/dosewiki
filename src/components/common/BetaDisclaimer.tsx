import Link from "next/link";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

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
 */
export function BetaDisclaimer({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <Icon
        icon="lucide:construction"
        size="1.05em"
        className="theme-beta-disclaimer-icon self-center"
      />
      <span className="theme-beta-shimmer">
        dose.wiki is still in beta. Entries may contain inaccuracies. See{" "}
        <Link
          href="/docs/how"
          className="theme-beta-disclaimer underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          our docs
        </Link>{" "}
        for more info.
      </span>
      <Icon
        icon="lucide:construction"
        size="1.05em"
        className="theme-beta-disclaimer-icon self-center"
      />
    </span>
  );
}

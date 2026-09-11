"use client";

import { Icon } from "@/components/common/Icon";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { quietLinkClassName } from "@/components/common/ProseLink";

/**
 * The quiet roadmap note that the Subjective Effect Index is being replaced.
 *
 * One copy of the markup for its two homes: under the title on the Subjective
 * Effect Index page and at the top of every substance article's Subjective
 * Effects section. Deliberately not the red `BetaDisclaimer` register: that
 * colour says "may be wrong", this says "will be rebuilt", and on an article it
 * sits next to the amber stub panel, so a third loud tone would stack warnings.
 *
 * Only the lab name links out, to mindstate.design; the sentence carries the
 * whole message on its own.
 */
// The caption link treatment, shared with the guide line beside a substance's
// effects so the two quiet captions never drift apart.
const linkClassName = cn(quietLinkClassName, "whitespace-nowrap");

export function SEIRoadmapNotice({
  className,
  shimmer = false,
}: {
  className?: string;
  /** The Substance Index-style sweep. On for the SEI page, off on articles. */
  shimmer?: boolean;
}) {
  const t = useT();
  // One sentence, one key: the lab name is a link, so the translated sentence
  // is split around its placeholder rather than assembled from fragments.
  const [beforeLab, afterLab] = t(
    "Legacy content. A statistically backed ontology from {{lab}} is coming soon.",
  ).split("{{lab}}");
  return (
    <p
      className={cn(
        "theme-text-faint inline-flex items-start gap-1.5 text-xs leading-5 text-pretty",
        className,
      )}
    >
      <Icon icon="lucide:route" size="0.875rem" className="mt-[0.2rem] shrink-0" aria-hidden />
      <span className={shimmer ? "theme-sei-notice-shimmer" : undefined}>
        {beforeLab}
        <a
          href="https://mindstate.design"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          <span
            aria-hidden
            className="theme-mindstate-favicon ml-0.5 mr-1 inline-block size-3 shrink-0 bg-current align-[-0.125em]"
          />
          Mindstate Design Labs
        </a>
        {afterLab}
      </span>
    </p>
  );
}

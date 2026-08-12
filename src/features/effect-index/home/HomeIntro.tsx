"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { renderInlineCopy } from "@/components/common/InlineCopy";
import { applyPlaceholders } from "@/data/content/about";
import { homePanelLinkClassName } from "./HomePanel";
import {
  EFFECT_INDEX_HOME_INTRO_FALLBACK,
  type EffectIndexHomeIntroCopy,
} from "./homeIntroCopy";

/**
 * The Effect Index homepage's intro block, ported from the old site's
 * `components/home/Description.vue`.
 *
 * Copy is verbatim from the original with one deliberate cut: the lead sentence read
 * "Effect Index, which is currently under construction, is a resource dedicated to…" and the
 * construction clause is dropped at the site owner's request. Everything else is word for
 * word, including the effect count being read live rather than hardcoded.
 *
 * The three paragraphs are now editable copy (`effect-index-home-intro-*`), stored as prose
 * carrying inline `[label](/href)` links and `{{effectCount}}`. They are rendered through
 * `renderInlineCopy` with this block's own link class rather than through a Markdown
 * renderer, so an edit cannot change the paragraph markup or the link treatment. With no
 * stored row the shipped strings render, unchanged.
 *
 * The two collapsed paragraphs stay in the document and are toggled with the `hidden`
 * attribute rather than being conditionally mounted: they carry the page's only description
 * of the documentation method, and a crawler that never clicks "read more" should still see
 * it.
 */

const BUTTON_CLASS = "uppercase tracking-[0.1em]";

interface HomeIntroProps {
  /** Live count of effect articles, quoted mid-sentence. */
  effectCount: number;
  /** Editable prose; falls back to the strings this section shipped with. */
  copy?: EffectIndexHomeIntroCopy;
}

const LEAD_STRONG_CLASS = "theme-text-primary font-semibold";

export function HomeIntro({
  effectCount,
  copy = EFFECT_INDEX_HOME_INTRO_FALLBACK,
}: HomeIntroProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const expandedId = useId();

  return (
    <section className="theme-text-secondary text-[1.0625rem] leading-7">
      <p>
        {renderInlineCopy(applyPlaceholders(copy.lead, { effectCount }), {
          linkClassName: homePanelLinkClassName,
          strongClassName: LEAD_STRONG_CLASS,
        })}
      </p>

      <div id={expandedId} hidden={!isExpanded} className="mt-4 space-y-4">
        <p>{renderInlineCopy(copy.method, { linkClassName: homePanelLinkClassName })}</p>
        <p>{renderInlineCopy(copy.organisation, { linkClassName: homePanelLinkClassName })}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={BUTTON_CLASS}
          aria-expanded={isExpanded}
          aria-controls={expandedId}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          read {isExpanded ? "less" : "more"}
        </Button>

        <Button asChild variant="secondary" size="sm" className={BUTTON_CLASS}>
          <Link href="/about">About Us</Link>
        </Button>
      </div>
    </section>
  );
}

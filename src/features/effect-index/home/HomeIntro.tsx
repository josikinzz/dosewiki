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

const BUTTON_CLASS = "uppercase tracking-[0.1em]";

interface HomeIntroProps {
  effectCount: number;
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

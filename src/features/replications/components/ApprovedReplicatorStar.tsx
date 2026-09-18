"use client";

import { Icon } from "@/components/common/Icon";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { APPROVED_REPLICATOR_LABEL } from "../replicationVocabulary";

/**
 * The mark beside an approved replicator's name on the /replications index: a
 * filled accent star that says what it means to assistive tech and on hover.
 * It sits inside the name's own link or heading, so it inherits the line box
 * and adds only its glyph width; `className` sizes it to the type it follows.
 * The Artist Page spells the same status out as a pill instead, which is where
 * a reader who wonders what the star means ends up.
 */
export function ApprovedReplicatorStar({ className }: { className?: string }) {
  const t = useT();
  return (
    <span
      className={cn("theme-icon-accent inline-flex shrink-0 items-center", className)}
      title={t(APPROVED_REPLICATOR_LABEL)}
      data-testid="approved-replicator-star"
    >
      {/* Lucide paths ship `fill="none"` inline, which beats an inherited fill. */}
      <Icon
        icon="lucide:star"
        className="h-[1em] w-[1em] [&_path]:fill-current"
        size="1em"
      />
      <span className="sr-only">{t(APPROVED_REPLICATOR_LABEL)}</span>
    </span>
  );
}

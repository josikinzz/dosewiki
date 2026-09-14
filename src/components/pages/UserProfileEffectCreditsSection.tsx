"use client";

import { ExpandableList } from "@/components/common/ArticleExpandable";
import { PublicPill } from "@/components/common/PublicTokens";
import { PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import type { ContributorEffectCredit } from "@/types/effectCredits";
import { useT } from "@/i18n/client";

/**
 * The effect articles a contributor is credited on, as a tag list.
 *
 * ## Why a slice plus the standard count-pill expander
 *
 * The corpus makes this a two-extremes problem rather than a layout: measured on
 * production, the credited names are 225, 185, 124, 104 and 96 articles, then a
 * long tail of 7, 2, 2, 1, 1, 1 and 1. Anything that reads well at one entry has
 * to survive 225, and 225 tags dumped inline is roughly forty rows — it would
 * bury the bio, the works carousel and the reports underneath it.
 *
 * So the section shows a bounded run of tags and puts the remainder behind the
 * shared `ExpandableList` count pill — the same centered `+N` expander the
 * substance-article sections (hero names, pharmacology, history & culture) use,
 * so both article surfaces read identically. That gives:
 *
 * - **1 entry** — one tag, no expander, no count-vs-list redundancy.
 * - **~10** — the whole list inline; the reader never has to open anything.
 * - **225** — five rows of tags and a centered "+201" pill, so the section
 *   costs a fixed amount of page whatever the number is.
 *
 * `PREVIEW_LIMIT` is 24 because of that distribution, not by feel: it is above
 * the entire tail, so seven of the twelve credited names render complete and
 * only the five large contributors ever see an expander at all.
 *
 * This replaced an earlier native `<details>` disclosure (DW-15). The trade-off
 * is deliberate: the pill needs JavaScript and the collapsed remainder is no
 * longer reachable by in-page find — a regression the owner accepted in
 * exchange for visual parity with the substance-article expanders.
 */

const PREVIEW_LIMIT = 24;

interface UserProfileEffectCreditsSectionProps {
  credits: readonly ContributorEffectCredit[];
  /** Whose credits these are; used to name the list for assistive tech. */
  contributorName: string;
}

function EffectCreditTags({
  credits,
  ariaLabel,
}: {
  credits: readonly ContributorEffectCredit[];
  ariaLabel?: string;
}) {
  return (
    // A plain wrapped run rather than `PublicChipNav`: that recipe is a filter
    // nav and emits a landmark, and two landmarks for one contributor's credits
    // would clutter the page's landmark list. The pill itself is the shared one.
    <ul aria-label={ariaLabel} className="flex list-none flex-wrap gap-1.5">
      {credits.map((credit) => (
        <li key={credit.slug} className="min-w-0">
          <PublicPill
            as="a"
            href={publicHref.effect(credit.slug)}
            size="sm"
            className={cn(
              "max-w-full cursor-pointer transition-opacity hover:opacity-90",
              focusRingClassName,
            )}
          >
            {/* The effect's display name, never its slug — the slug is a URL
                detail and "object-alteration" is not what the article is called. */}
            <span className="truncate">{credit.name}</span>
          </PublicPill>
        </li>
      ))}
    </ul>
  );
}

export function UserProfileEffectCreditsSection({
  credits,
  contributorName,
}: UserProfileEffectCreditsSectionProps) {
  const t = useT();
  // A contributor credited on no article renders no section at all, the same way
  // the works carousel and the trip reports section stay absent rather than
  // showing an empty shell.
  if (credits.length === 0) {
    return null;
  }

  return (
    <section className="space-y-5">
      <PublicSectionHeading
        icon={icons.bookOpenText}
        title={t("Effect articles")}
        titleElement="h2"
        actions={
          <PublicPill tone="neutral" size="sm">
            {credits.length}
          </PublicPill>
        }
      />

      <ExpandableList
        ariaLabelBase={t("effect articles")}
        items={credits}
        collapsedCount={Math.max(credits.length - PREVIEW_LIMIT, 0)}
      >
        {({ items }) => (
          <EffectCreditTags
            credits={items}
            ariaLabel={t("Effect articles {{name}} contributed to", { name: contributorName })}
          />
        )}
      </ExpandableList>
    </section>
  );
}

import { DisclosureCard } from "@/components/common/DisclosureCard";
import { PublicPill } from "@/components/common/PublicTokens";
import { PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import type { ContributorEffectCredit } from "@/types/effectCredits";

/**
 * The effect articles a contributor is credited on, as a tag list.
 *
 * ## Why a slice plus a native disclosure
 *
 * The corpus makes this a two-extremes problem rather than a layout: measured on
 * production, the credited names are 225, 185, 124, 104 and 96 articles, then a
 * long tail of 7, 2, 2, 1, 1, 1 and 1. Anything that reads well at one entry has
 * to survive 225, and 225 tags dumped inline is roughly forty rows — it would
 * bury the bio, the works carousel and the reports underneath it.
 *
 * So the section shows a bounded run of tags and puts the remainder behind a
 * native `<details>` (the shared `DisclosureCard`, which is the repo's existing
 * no-JavaScript disclosure). That gives:
 *
 * - **1 entry** — one tag, no disclosure, no count-vs-list redundancy.
 * - **~10** — the whole list inline; the reader never has to open anything.
 * - **225** — five rows of tags and a labelled "the other 201", so the section
 *   costs a fixed amount of page whatever the number is.
 *
 * `PREVIEW_LIMIT` is 24 because of that distribution, not by feel: it is above
 * the entire tail, so seven of the twelve credited names render complete and
 * only the five large contributors ever see a disclosure at all.
 *
 * It is deliberately not a bespoke "show more" widget. `<details>` works with
 * JavaScript disabled, is keyboard- and screen-reader-native, and lets in-page
 * find (Ctrl-F) reach the hidden tags in browsers that implement
 * `hidden=until-found`. The client-side `ExpandButton` used by the reports and
 * changelog sections exists because those render whole cards it must remeasure;
 * a tag has nothing to remeasure.
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
  // A contributor credited on no article renders no section at all, the same way
  // the works carousel and the trip reports section stay absent rather than
  // showing an empty shell.
  if (credits.length === 0) {
    return null;
  }

  const preview = credits.slice(0, PREVIEW_LIMIT);
  const remainder = credits.slice(PREVIEW_LIMIT);

  return (
    <section className="space-y-5">
      <PublicSectionHeading
        icon={icons.bookOpenText}
        title="Effect articles"
        titleElement="h2"
        actions={
          <PublicPill tone="neutral" size="sm">
            {credits.length}
          </PublicPill>
        }
      />

      <div className="space-y-3">
        <EffectCreditTags
          credits={preview}
          ariaLabel={`Effect articles ${contributorName} contributed to`}
        />

        {remainder.length > 0 ? (
          // "The other N" rather than "N more", because a <details> summary keeps
          // its label once opened and "201 more" then describes nothing.
          <DisclosureCard variant="subtle" summary={`The other ${remainder.length}`}>
            <EffectCreditTags credits={remainder} />
          </DisclosureCard>
        ) : null}
      </div>
    </section>
  );
}

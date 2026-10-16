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

const PREVIEW_LIMIT = 24;

interface UserProfileEffectCreditsSectionProps {
  credits: readonly ContributorEffectCredit[];
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

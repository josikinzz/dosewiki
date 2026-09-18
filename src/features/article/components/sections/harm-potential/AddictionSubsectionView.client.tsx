"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/common/Icon";
import { ArticleSectionGroup } from "@/components/common/ArticleSection";
import { useT } from "@/i18n/client";
import type { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";

type Item = {
  level: NormalizedHarmPotential["addiction"]["psychological"]["level"];
  content: ReactNode;
};

export function AddictionSubsectionView({
  psychological,
  physical,
}: {
  psychological?: Item;
  physical?: Item;
}) {
  const t = useT();
  if (!psychological && !physical) return null;
  return (
    <ArticleSectionGroup
      heading={t("Addiction & Dependence")}
      icon="jam:repeat"
      spacing="loose"
      className="theme-section-group-divider"
      headingClassName="text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8"
      iconClassName="scale-110"
    >
      <div className="space-y-4">
        {psychological && (
          <section className="pl-5 pt-5 first:pt-0 sm:pl-6">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h4 className="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">
                <Icon
                  icon="icon-park-outline:emotion-unhappy"
                  size={16}
                  className="theme-icon-accent"
                />
                {t("Psychological")}
              </h4>
              <RiskLevelBadge level={psychological.level} />
            </div>
            {psychological.content}
          </section>
        )}
        {physical && (
          <section className="pl-5 pt-5 first:pt-0 sm:pl-6">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h4 className="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">
                <Icon
                  icon="covid:graph-cured-decreasing"
                  size={16}
                  className="theme-icon-accent"
                />
                {t("Physical")}
              </h4>
              <RiskLevelBadge level={physical.level} />
            </div>
            {physical.content}
          </section>
        )}
      </div>
    </ArticleSectionGroup>
  );
}

import { Icon } from "@/components/common/Icon";
import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";
import type { SubstanceArticle } from "@/schema";
import { ArticleText } from "../../CitedText";
import { ArticleSectionGroup } from "@/components/common/ArticleSection";

interface AddictionSubsectionProps {
  addiction: NormalizedHarmPotential['addiction'];
  article: SubstanceArticle;
}

export function AddictionSubsection({ addiction, article }: AddictionSubsectionProps) {
  const hasPsychological = !!addiction.psychological.description;
  const hasPhysical = !!addiction.physical_dependence.description;

  if (!hasPsychological && !hasPhysical) return null;

  return (
    <ArticleSectionGroup
      heading="Addiction & Dependence"
      icon="jam:repeat"
      spacing="loose"
      className="theme-section-group-divider"
      headingClassName="text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8"
      iconClassName="scale-110"
    >
      <div className="space-y-4">
        {hasPsychological && (
          <section className="pl-5 pt-5 first:pt-0 sm:pl-6">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h4 className="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">
                <Icon icon="icon-park-outline:emotion-unhappy" size={16} className="text-dose-accent-soft" />
                Psychological
              </h4>
              <RiskLevelBadge level={addiction.psychological.level} />
            </div>
            <ArticleText
              text={addiction.psychological.description}
              article={article}
              tone="muted"
              className="theme-text-muted mb-3 text-xs italic leading-relaxed"
            />
          </section>
        )}

        {hasPhysical && (
          <section className="pl-5 pt-5 first:pt-0 sm:pl-6">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h4 className="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">
                <Icon icon="covid:graph-cured-decreasing" size={16} className="text-dose-accent-soft" />
                Physical
              </h4>
              <RiskLevelBadge level={addiction.physical_dependence.level} />
            </div>
            <ArticleText
              text={addiction.physical_dependence.description}
              article={article}
              tone="muted"
              className="theme-text-muted mb-3 text-xs italic leading-relaxed"
            />
          </section>
        )}
      </div>
    </ArticleSectionGroup>
  );
}

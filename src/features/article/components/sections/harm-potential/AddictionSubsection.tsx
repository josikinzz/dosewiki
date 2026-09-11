import { Icon } from "@/components/common/Icon";
import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";
import type { SubstanceArticle } from "@/schema";
import { ArticleText } from "../../CitedText";
import { ArticleSectionGroup } from "@/components/common/ArticleSection";
import { EditableHarmText } from "./EditableHarmText";
import { useT } from "@/i18n/client";

interface AddictionSubsectionProps {
  addiction: NormalizedHarmPotential['addiction'];
  article: SubstanceArticle;
}

export function AddictionSubsection({ addiction, article }: AddictionSubsectionProps) {
  const t = useT();
  const hasPsychological = !!addiction.psychological.description;
  const hasPhysical = !!addiction.physical_dependence.description;

  if (!hasPsychological && !hasPhysical) return null;

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
        {hasPsychological && (
          <section className="pl-5 pt-5 first:pt-0 sm:pl-6">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h4 className="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">
                <Icon icon="icon-park-outline:emotion-unhappy" size={16} className="theme-icon-accent" />
                {t("Psychological")}
              </h4>
              {/* `level` renders as a canonical badge, so it is not editable. */}
              <RiskLevelBadge level={addiction.psychological.level} />
            </div>
            <EditableHarmText
              article={article}
              label={t("Psychological dependence description")}
              path="harm_potential.addiction.psychological.description"
              value={addiction.psychological.description}
            >
              <ArticleText
                text={addiction.psychological.description}
                article={article}
                tone="muted"
                className="theme-text-muted mb-3 text-xs italic leading-relaxed"
              />
            </EditableHarmText>
          </section>
        )}

        {hasPhysical && (
          <section className="pl-5 pt-5 first:pt-0 sm:pl-6">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h4 className="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">
                <Icon icon="covid:graph-cured-decreasing" size={16} className="theme-icon-accent" />
                {t("Physical")}
              </h4>
              <RiskLevelBadge level={addiction.physical_dependence.level} />
            </div>
            <EditableHarmText
              article={article}
              label={t("Physical dependence description")}
              path="harm_potential.addiction.physical_dependence.description"
              value={addiction.physical_dependence.description}
            >
              <ArticleText
                text={addiction.physical_dependence.description}
                article={article}
                tone="muted"
                className="theme-text-muted mb-3 text-xs italic leading-relaxed"
              />
            </EditableHarmText>
          </section>
        )}
      </div>
    </ArticleSectionGroup>
  );
}

import { Icon } from "@/components/common/Icon";
import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";
import type { SubstanceArticle } from "@/schema";
import { CitedText } from "../../CitedText";
import { ArticleSubsectionCard, ArticleSubsectionHeader } from "@/components/common/ArticleSection";

interface AddictionSubsectionProps {
  addiction: NormalizedHarmPotential['addiction'];
  article: SubstanceArticle;
}

export function AddictionSubsection({ addiction, article }: AddictionSubsectionProps) {
  const hasPsychological = !!addiction.psychological.description;
  const hasPhysical = !!addiction.physical_dependence.description;

  if (!hasPsychological && !hasPhysical) return null;

  return (
    <ArticleSubsectionCard className="flex flex-col gap-4">
      <ArticleSubsectionHeader icon="jam:repeat" heading="Addiction & Dependence" />

      {hasPsychological && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon icon="icon-park-outline:emotion-unhappy" size={18} className="text-fuchsia-300" />
              <span className="text-sm font-semibold text-white">Psychological</span>
            </div>
            <RiskLevelBadge level={addiction.psychological.level} />
          </div>
          <p className="text-sm leading-relaxed text-white/80">
            <CitedText text={addiction.psychological.description} article={article} />
          </p>
        </div>
      )}

      {hasPsychological && hasPhysical && (
        <div className="h-px bg-white/[0.06]" />
      )}

      {hasPhysical && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon icon="covid:graph-cured-decreasing" size={18} className="text-fuchsia-300" />
              <span className="text-sm font-semibold text-white">Physical</span>
            </div>
            <RiskLevelBadge level={addiction.physical_dependence.level} />
          </div>
          <p className="text-sm leading-relaxed text-white/80">
            <CitedText text={addiction.physical_dependence.description} article={article} />
          </p>
        </div>
      )}
    </ArticleSubsectionCard>
  );
}

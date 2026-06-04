import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";
import type { SubstanceArticle } from "@/schema";
import { CitedText } from "../../CitedText";
import { ArticleSubsectionCard, ArticleSubsectionHeader } from "@/components/common/ArticleSection";

interface RisksSubsectionProps {
  risks: NormalizedHarmPotential['risks'];
  article: SubstanceArticle;
}

export function PsychosisRiskSubsection({ risks, article }: RisksSubsectionProps) {
  const { psychosis } = risks;
  const hasPsychosis = (psychosis.description || "").trim().length > 0;

  if (!hasPsychosis) return null;

  return (
    <ArticleSubsectionCard className="flex flex-col gap-3">
      <ArticleSubsectionHeader icon="tabler:mood-crazy-happy" heading="Psychosis Risk">
        <RiskLevelBadge level={psychosis.level} />
      </ArticleSubsectionHeader>
      <p className="text-sm leading-relaxed text-white/80">
        <CitedText text={psychosis.description} article={article} />
      </p>
    </ArticleSubsectionCard>
  );
}

export function SeizureRiskSubsection({ risks, article }: RisksSubsectionProps) {
  const { seizure } = risks;
  const hasSeizure = (seizure.description || "").trim().length > 0;

  if (!hasSeizure) return null;

  return (
    <ArticleSubsectionCard className="flex flex-col gap-3">
      <ArticleSubsectionHeader icon="mage:zap" heading="Seizure Risk">
        <RiskLevelBadge level={seizure.level} />
      </ArticleSubsectionHeader>
      <p className="text-sm leading-relaxed text-white/80">
        <CitedText text={seizure.description} article={article} />
      </p>
    </ArticleSubsectionCard>
  );
}

// Legacy export for backward compatibility - now just renders both subsections
export function RisksSubsection({ risks, article }: RisksSubsectionProps) {
  const { psychosis, seizure } = risks;

  const hasPsychosis = (psychosis.description || "").trim().length > 0;
  const hasSeizure = (seizure.description || "").trim().length > 0;

  if (!hasPsychosis && !hasSeizure) return null;

  return (
    <>
      <PsychosisRiskSubsection risks={risks} article={article} />
      <SeizureRiskSubsection risks={risks} article={article} />
    </>
  );
}

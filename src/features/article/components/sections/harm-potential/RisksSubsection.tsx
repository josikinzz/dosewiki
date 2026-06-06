import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";
import type { SubstanceArticle } from "@/schema";
import { ArticleText } from "../../CitedText";
import { ArticleSubsectionHeader } from "@/components/common/ArticleSection";

interface RisksSubsectionProps {
  risks: NormalizedHarmPotential['risks'];
  article: SubstanceArticle;
}

export function PsychosisRiskSubsection({ risks, article }: RisksSubsectionProps) {
  const { psychosis } = risks;
  const hasPsychosis = (psychosis.description || "").trim().length > 0;

  if (!hasPsychosis) return null;

  return (
    <section className="theme-section-group-divider space-y-4">
      <ArticleSubsectionHeader
        icon="tabler:mood-crazy-happy"
        heading="Psychosis Risk"
        headingClassName="text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8"
        iconClassName="scale-110"
      >
        <RiskLevelBadge level={psychosis.level} />
      </ArticleSubsectionHeader>
      <ArticleText text={psychosis.description} article={article} tone="muted" />
    </section>
  );
}

export function SeizureRiskSubsection({ risks, article }: RisksSubsectionProps) {
  const { seizure } = risks;
  const hasSeizure = (seizure.description || "").trim().length > 0;

  if (!hasSeizure) return null;

  return (
    <section className="theme-section-group-divider space-y-4">
      <ArticleSubsectionHeader
        icon="mage:zap"
        heading="Seizure Risk"
        headingClassName="text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8"
        iconClassName="scale-110"
      >
        <RiskLevelBadge level={seizure.level} />
      </ArticleSubsectionHeader>
      <ArticleText text={seizure.description} article={article} tone="muted" />
    </section>
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

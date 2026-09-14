import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";
import type { SubstanceArticle } from "@/schema";
import { ArticleText } from "../../CitedText";
import { ArticleSubsectionHeader } from "@/components/common/ArticleSection";
import { EditableHarmText } from "./EditableHarmText";
import { useT } from "@/i18n/client";

interface RisksSubsectionProps {
  risks: NormalizedHarmPotential['risks'];
  article: SubstanceArticle;
}

export function PsychosisRiskSubsection({ risks, article }: RisksSubsectionProps) {
  const t = useT();
  const { psychosis } = risks;
  const hasPsychosis = (psychosis.description || "").trim().length > 0;

  if (!hasPsychosis) return null;

  return (
    <section className="theme-section-group-divider space-y-4">
      <ArticleSubsectionHeader
        icon="tabler:mood-crazy-happy"
        heading={t("Psychosis Risk")}
        headingClassName="text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8"
        iconClassName="scale-110"
      >
        {/* `level` renders as a canonical badge, so it is not editable. */}
        <RiskLevelBadge level={psychosis.level} />
      </ArticleSubsectionHeader>
      <EditableHarmText
        article={article}
        label={t("Psychosis risk description")}
        path="harm_potential.psychosis.description"
        value={psychosis.description}
      >
        <ArticleText text={psychosis.description} article={article} tone="muted" />
      </EditableHarmText>
    </section>
  );
}

export function SeizureRiskSubsection({ risks, article }: RisksSubsectionProps) {
  const t = useT();
  const { seizure } = risks;
  const hasSeizure = (seizure.description || "").trim().length > 0;

  if (!hasSeizure) return null;

  return (
    <section className="theme-section-group-divider space-y-4">
      <ArticleSubsectionHeader
        icon="mage:zap"
        heading={t("Seizure Risk")}
        headingClassName="text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8"
        iconClassName="scale-110"
      >
        <RiskLevelBadge level={seizure.level} />
      </ArticleSubsectionHeader>
      <EditableHarmText
        article={article}
        label={t("Seizure risk description")}
        path="harm_potential.seizure.description"
        value={seizure.description}
      >
        <ArticleText text={seizure.description} article={article} tone="muted" />
      </EditableHarmText>
    </section>
  );
}


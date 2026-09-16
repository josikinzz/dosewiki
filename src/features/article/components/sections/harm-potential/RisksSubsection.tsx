import { getArticleValueByPath } from "@/data/schema/fieldPath";
import type { SubstanceArticle } from "@/schema";
import { ArticleText } from "../../CitedText";
import { msg } from "@/i18n/messages";
import type { NormalizedHarmPotential } from "./HarmPotentialUtils";
import {
  PsychosisRiskSubsectionView,
  SeizureRiskSubsectionView,
} from "./RisksSubsectionView.client";
import { EditableHarmText } from "./EditableHarmText";

interface RisksSubsectionProps {
  risks: NormalizedHarmPotential["risks"];
  article: SubstanceArticle;
}

function projectRisk(
  article: SubstanceArticle,
  kind: "psychosis" | "seizure",
  risk: NormalizedHarmPotential["risks"]["psychosis"],
) {
  const value = risk.description || "";
  if (!value.trim()) return null;
  const path = `harm_potential.${kind}.description`;
  const label =
    kind === "psychosis"
      ? msg("Psychosis risk description")
      : msg("Seizure risk description");
  const rendered = <ArticleText text={value} article={article} tone="muted" />;
  return {
    level: risk.level,
    content: (
      <EditableHarmText
        editable={getArticleValueByPath(article, path) === value}
        label={label}
        path={path}
        value={value}
      >
        {rendered}
      </EditableHarmText>
    ),
  };
}

export function PsychosisRiskSubsection({
  risks,
  article,
}: RisksSubsectionProps) {
  const risk = projectRisk(article, "psychosis", risks.psychosis);
  return risk ? <PsychosisRiskSubsectionView risk={risk} /> : null;
}

export function SeizureRiskSubsection({
  risks,
  article,
}: RisksSubsectionProps) {
  const risk = projectRisk(article, "seizure", risks.seizure);
  return risk ? <SeizureRiskSubsectionView risk={risk} /> : null;
}

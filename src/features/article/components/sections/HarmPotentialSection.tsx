import { memo } from "react";
import type { SubstanceArticle } from "@/schema";
import { hasHarmPotentialContent } from "@server/article/normalization.mjs";
import { ArticleText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";
import { HarmPotentialSectionView } from "./HarmPotentialSectionView.client";
import { AddictionSubsection } from "./harm-potential/AddictionSubsection";
import { normalizeHarmPotential } from "./harm-potential/HarmPotentialUtils";
import {
  PsychosisRiskSubsection,
  SeizureRiskSubsection,
} from "./harm-potential/RisksSubsection";
import { ToxicitySubsection } from "./harm-potential/ToxicitySubsection";

interface HarmPotentialSectionProps {
  article: SubstanceArticle;
}

export const HarmPotentialSection = memo(function HarmPotentialSection({
  article,
}: HarmPotentialSectionProps) {
  if (!hasHarmPotentialContent(article.harm_potential))
    return <ArticleGapNotice article={article} section="harm_potential" />;

  const normalized = normalizeHarmPotential(article) ?? {
    addiction: {
      psychological: { level: null, description: "" },
      physical_dependence: { level: null, description: "" },
    },
    toxicity: {
      lethal_dosage: { ld50: [], notes: "" },
      ld50: [],
      ld50String: "",
      organ_toxicity: [],
      organToxicityString: "",
      carcinogenicity: { level: null, description: "" },
      antibiotic_function: { level: null, description: "" },
    },
    risks: {
      psychosis: { level: null, description: "" },
      seizure: { level: null, description: "" },
    },
  };
  const rawSummary = (
    article.harm_potential as { summary?: string } | undefined
  )?.summary;
  const summary = typeof rawSummary === "string" ? rawSummary.trim() : "";

  return (
    <HarmPotentialSectionView
      summary={
        summary ? (
          <ArticleText text={summary} article={article} tone="muted" />
        ) : undefined
      }
    >
      <AddictionSubsection addiction={normalized.addiction} article={article} />
      <ToxicitySubsection toxicity={normalized.toxicity} article={article} />
      <PsychosisRiskSubsection risks={normalized.risks} article={article} />
      <SeizureRiskSubsection risks={normalized.risks} article={article} />
    </HarmPotentialSectionView>
  );
});

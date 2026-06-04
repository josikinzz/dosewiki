"use client";

import { memo } from "react";
import type { SubstanceArticle } from "@/schema";
import {
  ArticleSection,
  ArticleSubsectionCard,
} from "@/components/common/ArticleSection";
import { normalizeHarmPotential } from "./harm-potential/HarmPotentialUtils";
import { AddictionSubsection } from "./harm-potential/AddictionSubsection";
import { ToxicitySubsection } from "./harm-potential/ToxicitySubsection";
import {
  PsychosisRiskSubsection,
  SeizureRiskSubsection,
} from "./harm-potential/RisksSubsection";
import { ArticleText } from "../CitedText";

interface HarmPotentialSectionProps {
  article: SubstanceArticle;
}

export const HarmPotentialSection = memo(function HarmPotentialSection({
  article,
}: HarmPotentialSectionProps) {
  const normalizedHP = normalizeHarmPotential(article);
  const harmPotentialSummary =
    typeof (article.harm_potential as { summary?: string } | undefined)
      ?.summary === "string"
      ? (article.harm_potential as { summary?: string }).summary!.trim()
      : "";

  if (!normalizedHP && !harmPotentialSummary) return null;

  const { addiction, toxicity, risks } = normalizedHP ?? {
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

  return (
    <ArticleSection
      id="harm-potential"
      icon="lucide:ambulance"
      heading="Harm Potential"
      className="theme-article-priority-section rounded-2xl px-4 pb-5"
      headerClassName="theme-safety-priority-heading"
    >
      <div className="flex flex-col gap-6">
        {harmPotentialSummary && (
          <ArticleSubsectionCard>
            <ArticleText text={harmPotentialSummary} article={article} />
          </ArticleSubsectionCard>
        )}
        <AddictionSubsection addiction={addiction} article={article} />
        <ToxicitySubsection toxicity={toxicity} article={article} />
        <PsychosisRiskSubsection risks={risks} article={article} />
        <SeizureRiskSubsection risks={risks} article={article} />
      </div>
    </ArticleSection>
  );
});

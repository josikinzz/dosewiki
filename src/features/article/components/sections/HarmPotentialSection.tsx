import { memo } from "react";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle } from "@/schema";
import { normalizeHarmPotential } from "./harm-potential/HarmPotentialUtils";
import { AddictionSubsection } from "./harm-potential/AddictionSubsection";
import { ToxicitySubsection } from "./harm-potential/ToxicitySubsection";
import { PsychosisRiskSubsection, SeizureRiskSubsection } from "./harm-potential/RisksSubsection";

interface HarmPotentialSectionProps {
  article: SubstanceArticle;
}

export const HarmPotentialSection = memo(function HarmPotentialSection({
  article,
}: HarmPotentialSectionProps) {
  const normalizedHP = normalizeHarmPotential(article);

  if (!normalizedHP) return null;

  const { addiction, toxicity, risks } = normalizedHP;

  return (
    <div className="space-y-6 pt-12">
      <SectionHeader icon="lucide:ambulance" title="Harm Potential" />

      <div className="flex flex-col gap-8">
        <AddictionSubsection addiction={addiction} />
        <ToxicitySubsection toxicity={toxicity} />
        <PsychosisRiskSubsection risks={risks} />
        <SeizureRiskSubsection risks={risks} />
      </div>
    </div>
  );
});

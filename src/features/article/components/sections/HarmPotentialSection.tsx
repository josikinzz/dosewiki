import { memo } from "react";
import { IconBadge } from "@/components/common/IconBadge";
import { SectionCard } from "@/components/common/SectionCard";
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
    <SectionCard delay={0}>
      <h2 className="mb-6 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:ambulance" label="Harm Potential" />
        Harm Potential
      </h2>

      <div className="flex flex-col gap-8">
        <AddictionSubsection addiction={addiction} />
        <ToxicitySubsection toxicity={toxicity} />
        <PsychosisRiskSubsection risks={risks} />
        <SeizureRiskSubsection risks={risks} />
      </div>
    </SectionCard>
  );
});

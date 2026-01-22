import { memo } from "react";
import { IconBadge } from "@/components/common/IconBadge";
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
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-fuchsia-500/20 blur-xl rounded-full" />
          <h2 className="relative flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300 whitespace-nowrap">
            <IconBadge icon="lucide:ambulance" />
            <span className="drop-shadow-sm">Harm Potential</span>
          </h2>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
      </div>

      <div className="flex flex-col gap-8">
        <AddictionSubsection addiction={addiction} />
        <ToxicitySubsection toxicity={toxicity} />
        <PsychosisRiskSubsection risks={risks} />
        <SeizureRiskSubsection risks={risks} />
      </div>
    </div>
  );
});

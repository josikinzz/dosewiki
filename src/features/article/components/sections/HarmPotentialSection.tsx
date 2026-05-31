"use client";

import { memo } from "react";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle } from "@/schema";
import { normalizeHarmPotential } from "./harm-potential/HarmPotentialUtils";
import { AddictionSubsection } from "./harm-potential/AddictionSubsection";
import { ToxicitySubsection } from "./harm-potential/ToxicitySubsection";
import { PsychosisRiskSubsection, SeizureRiskSubsection } from "./harm-potential/RisksSubsection";
import { CitedText } from "../CitedText";

interface HarmPotentialSectionProps {
  article: SubstanceArticle;
}

export const HarmPotentialSection = memo(function HarmPotentialSection({
  article,
}: HarmPotentialSectionProps) {
  const normalizedHP = normalizeHarmPotential(article);
  const harmPotentialSummary = typeof (article.harm_potential as { summary?: string } | undefined)?.summary === "string"
    ? (article.harm_potential as { summary?: string }).summary!.trim()
    : "";

  if (!normalizedHP && !harmPotentialSummary) return null;

  const { addiction, toxicity, risks } = normalizedHP ?? {
    addiction: { psychological: { level: null, description: "" }, physical_dependence: { level: null, description: "" } },
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
    <div id="harm-potential" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:ambulance" title="Harm Potential" />

      <div className="flex flex-col gap-6">
        {harmPotentialSummary && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-sm leading-relaxed text-white/80">
              <CitedText text={harmPotentialSummary} article={article} />
            </p>
          </div>
        )}
        <AddictionSubsection addiction={addiction} />
        <ToxicitySubsection toxicity={toxicity} />
        <PsychosisRiskSubsection risks={risks} />
        <SeizureRiskSubsection risks={risks} />
      </div>
    </div>
  );
});

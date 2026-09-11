"use client";

// A client boundary only for `useT`: the section still just shapes data and
// lays out its subsections. The parts that need the browser (the toxicity
// card grid's masonry measurements, the inline-edit affordances) remain client
// components of their own.
import { memo } from "react";
import type { SubstanceArticle } from "@/schema";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import {
  ArticleSection,
} from "@/components/common/ArticleSection";
import { hasHarmPotentialContent } from "@server/article/normalization.mjs";
import { normalizeHarmPotential } from "./harm-potential/HarmPotentialUtils";
import { AddictionSubsection } from "./harm-potential/AddictionSubsection";
import { ToxicitySubsection } from "./harm-potential/ToxicitySubsection";
import {
  PsychosisRiskSubsection,
  SeizureRiskSubsection,
} from "./harm-potential/RisksSubsection";
import { ArticleText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";
import { useT } from "@/i18n/client";

interface HarmPotentialSectionProps {
  article: SubstanceArticle;
}

export const HarmPotentialSection = memo(function HarmPotentialSection({
  article,
}: HarmPotentialSectionProps) {
  const t = useT();
  const normalizedHP = normalizeHarmPotential(article);
  const harmPotentialSummary =
    typeof (article.harm_potential as { summary?: string } | undefined)
      ?.summary === "string"
      ? (article.harm_potential as { summary?: string }).summary!.trim()
      : "";

  // Same predicate the manifest and the table of contents use, so the page can
  // never render a section the rest of the article thinks is absent.
  if (!hasHarmPotentialContent(article.harm_potential)) {
    return <ArticleGapNotice article={article} section="harm_potential" />;
  }

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
      icon={SUBSTANCE_SECTION_ICONS["harm-potential"]}
      heading={t("Harm Potential")}
    >
      {harmPotentialSummary && (
        <ArticleText text={harmPotentialSummary} article={article} tone="muted" />
      )}
      <div className="space-y-8">
        <AddictionSubsection addiction={addiction} article={article} />
        <ToxicitySubsection toxicity={toxicity} article={article} />
        <PsychosisRiskSubsection risks={risks} article={article} />
        <SeizureRiskSubsection risks={risks} article={article} />
      </div>
    </ArticleSection>
  );
});

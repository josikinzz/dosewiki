"use client";

import { memo, type ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import type { TripReport } from "@/types/tripReport";
import { HeroSection } from "./sections/HeroSection";
import { DosageDurationSection } from "./sections/DosageDurationSection";
import { SubjectiveEffectsSection } from "./sections/SubjectiveEffectsSection";
import { PharmacologySection } from "./sections/PharmacologySection";
import { InteractionsSection } from "./sections/InteractionsSection";
import { ToleranceSection } from "./sections/ToleranceSection";
import { HistoryCultureSection } from "./sections/HistoryCultureSection";
import { HarmPotentialSection } from "./sections/HarmPotentialSection";
import { ReagentSection } from "./sections/ReagentSection";
import { LegalitySection } from "./sections/LegalitySection";
import { CitationsSection } from "./sections/CitationsSection";
import { TripReportsSection } from "./sections/TripReportsSection";
import { TableOfContentsSection } from "./sections/TableOfContentsSection";

export interface ArticleLayoutProps {
  article: SubstanceArticle;
  /** Called when a category badge is clicked */
  onSelectCategory?: (categoryKey: string) => void;
  /** Called when an effect is clicked */
  onSelectEffect?: (effect: string) => void;
  /** Called when a mechanism of action is clicked */
  onSelectMechanism?: (slug: string, qualifier?: string) => void;
  /** Called when a classification (psychoactive/chemical) is clicked */
  onSelectClassification?: (type: "psychoactive" | "chemical", label: string) => void;
  /** Called when an interaction substance is clicked */
  onSelectInteraction?: (substance: string) => void;
  /** Called when a trip report is clicked */
  onSelectReport?: (slug: string) => void;
  fromSubstanceSlug?: string;
  relatedTripReports?: TripReport[];
  tripReportsSection?: ReactNode;
}

/**
 * Unified article layout component that renders a substance article
 * using section components from /sections/.
 *
 * This component is used for both the public article pages and the
 * Generator preview tab, ensuring consistent visual design.
 */
export const ArticleLayout = memo(function ArticleLayout({
  article,
  onSelectCategory,
  onSelectEffect,
  onSelectMechanism,
  onSelectClassification,
  onSelectInteraction,
  onSelectReport,
  fromSubstanceSlug,
  relatedTripReports,
  tripReportsSection,
}: ArticleLayoutProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-8">
      <HeroSection
        article={article}
        onSelectCategory={onSelectCategory}
        onSelectClassification={onSelectClassification}
        showPreviewBadge={false}
      />
      <TableOfContentsSection article={article} />
      <DosageDurationSection article={article} />
      <SubjectiveEffectsSection
        article={article}
        onSelectEffect={onSelectEffect}
      />
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "900px" }}>
        <ReagentSection article={article} />
      </div>
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "1200px" }}>
        <PharmacologySection
          article={article}
          onSelectMechanism={onSelectMechanism}
        />
      </div>
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "1000px" }}>
        <InteractionsSection
          article={article}
          onSelectInteraction={onSelectInteraction}
        />
      </div>
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "900px" }}>
        <ToleranceSection article={article} />
      </div>
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "1000px" }}>
        <HarmPotentialSection article={article} />
      </div>
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "1200px" }}>
        <HistoryCultureSection article={article} />
      </div>
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "900px" }}>
        {tripReportsSection ?? (
          <TripReportsSection
            article={article}
            reports={relatedTripReports}
            fromSubstanceSlug={fromSubstanceSlug}
            onSelectReport={onSelectReport}
          />
        )}
      </div>
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "900px" }}>
        <LegalitySection article={article} />
      </div>
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "1200px" }}>
        <CitationsSection article={article} />
      </div>
    </div>
  );
});

export default ArticleLayout;

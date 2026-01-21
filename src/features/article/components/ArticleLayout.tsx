import { memo } from "react";
import type { SubstanceArticle } from "@/schema";
import {
  HeroSection,
  DosageDurationSection,
  SubjectiveEffectsSection,
  PharmacologySection,
  InteractionsSection,
  ToleranceSection,
  HistoryCultureSection,
  HarmPotentialSection,
  ReagentSection,
  LegalitySection,
  CitationsSection,
  TripReportsSection,
} from "./sections";

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
}: ArticleLayoutProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-8">
      <HeroSection
        article={article}
        onSelectCategory={onSelectCategory}
        onSelectClassification={onSelectClassification}
        showPreviewBadge={false}
      />
      <DosageDurationSection article={article} />
      <SubjectiveEffectsSection
        article={article}
        onSelectEffect={onSelectEffect}
      />
      <ReagentSection article={article} />
      <PharmacologySection
        article={article}
        onSelectMechanism={onSelectMechanism}
      />
      <InteractionsSection
        article={article}
        onSelectInteraction={onSelectInteraction}
      />
      <ToleranceSection article={article} />
      <HarmPotentialSection article={article} />
      <HistoryCultureSection article={article} />
      <TripReportsSection article={article} onSelectReport={onSelectReport} />
      <LegalitySection article={article} />
      <CitationsSection article={article} />
    </div>
  );
});

export default ArticleLayout;

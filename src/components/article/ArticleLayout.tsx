import { memo } from "react";
import type { SubstanceArticle } from "../../schema";
import {
  PreviewHeroSection,
  PreviewDosageDurationCard,
  PreviewPharmacologySection,
  PreviewSubjectiveEffectsSection,
  PreviewInteractionsSection,
  PreviewToleranceSection,
  PreviewHarmPotentialSection,
  PreviewReagentSection,
  PreviewLegalitySection,
  PreviewCitationsSection,
} from "../dev/tools/generator/preview";

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
}

/**
 * Unified article layout component that renders a substance article
 * using the Preview* section components.
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
}: ArticleLayoutProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-8">
      <PreviewHeroSection
        article={article}
        onSelectCategory={onSelectCategory}
        onSelectClassification={onSelectClassification}
        showPreviewBadge={false}
      />
      <PreviewDosageDurationCard article={article} />
      <PreviewSubjectiveEffectsSection
        article={article}
        onSelectEffect={onSelectEffect}
      />
      <PreviewPharmacologySection
        article={article}
        onSelectMechanism={onSelectMechanism}
      />
      <PreviewInteractionsSection
        article={article}
        onSelectInteraction={onSelectInteraction}
      />
      <PreviewToleranceSection article={article} />
      <PreviewHarmPotentialSection article={article} />
      <PreviewReagentSection article={article} />
      <PreviewLegalitySection article={article} />
      <PreviewCitationsSection article={article} />
    </div>
  );
});

export default ArticleLayout;

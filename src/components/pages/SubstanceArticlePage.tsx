/**
 * Public-facing substance article page using the unified ArticleLayout.
 *
 * This component displays a substance article using the Preview* section
 * components for a consistent, modern layout.
 */

import { memo } from "react";
import type { SubstanceArticle } from "../../schema";
import { ArticleLayout } from "../article/ArticleLayout";

interface SubstanceArticlePageProps {
  article: SubstanceArticle;
  onSelectCategory: (categoryKey: string) => void;
  onSelectEffect: (effect: string) => void;
  onSelectMechanism: (mechanismSlug: string, qualifierSlug?: string) => void;
  onSelectClassification: (type: "psychoactive" | "chemical", label: string) => void;
  onSelectInteraction?: (substance: string) => void;
}

export const SubstanceArticlePage = memo(function SubstanceArticlePage({
  article,
  onSelectCategory,
  onSelectEffect,
  onSelectMechanism,
  onSelectClassification,
  onSelectInteraction,
}: SubstanceArticlePageProps) {
  // Handle interaction click - navigate to interactions page with this substance
  const handleInteractionClick = (substance: string) => {
    if (onSelectInteraction) {
      onSelectInteraction(substance);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b0818] via-[#130e2b] to-[#0f0a1f]">
      <ArticleLayout
        article={article}
        onSelectCategory={onSelectCategory}
        onSelectEffect={onSelectEffect}
        onSelectMechanism={onSelectMechanism}
        onSelectClassification={onSelectClassification}
        onSelectInteraction={handleInteractionClick}
      />
    </main>
  );
});

export default SubstanceArticlePage;

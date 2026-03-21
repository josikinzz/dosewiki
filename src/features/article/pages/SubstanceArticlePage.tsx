/**
 * Public-facing substance article page using the unified ArticleLayout.
 *
 * The Next public route preloads the article on the server, so this component
 * stays purely presentational and avoids bundling client-side Convex fetch code.
 */

"use client";

import { memo, type ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import type { TripReport } from "@/types/tripReport";
import { ArticleLayout } from "../components/ArticleLayout";

interface SubstanceArticlePageProps {
  article: SubstanceArticle;
  onSelectCategory?: (categoryKey: string) => void;
  onSelectEffect?: (effect: string) => void;
  onSelectMechanism?: (mechanismSlug: string, qualifierSlug?: string) => void;
  onSelectClassification?: (type: "psychoactive" | "chemical", label: string) => void;
  onSelectInteraction?: (substance: string) => void;
  onSelectReport?: (slug: string) => void;
  fromSubstanceSlug?: string;
  relatedTripReports?: TripReport[];
  tripReportsSection?: ReactNode;
}

function SubstanceArticleContent({
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
}: SubstanceArticlePageProps) {
  const handleInteractionClick = (substance: string) => {
    if (onSelectInteraction) {
      onSelectInteraction(substance);
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <ArticleLayout
        article={article}
        onSelectCategory={onSelectCategory}
        onSelectEffect={onSelectEffect}
        onSelectMechanism={onSelectMechanism}
        onSelectClassification={onSelectClassification}
        onSelectInteraction={handleInteractionClick}
        onSelectReport={onSelectReport}
        fromSubstanceSlug={fromSubstanceSlug}
        relatedTripReports={relatedTripReports}
        tripReportsSection={tripReportsSection}
      />
    </main>
  );
}

export const SubstanceArticlePage = memo(function SubstanceArticlePage({
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
}: SubstanceArticlePageProps) {
  return (
    <SubstanceArticleContent
      article={article}
      onSelectCategory={onSelectCategory}
      onSelectEffect={onSelectEffect}
      onSelectMechanism={onSelectMechanism}
      onSelectClassification={onSelectClassification}
      onSelectInteraction={onSelectInteraction}
      onSelectReport={onSelectReport}
      fromSubstanceSlug={fromSubstanceSlug}
      relatedTripReports={relatedTripReports}
      tripReportsSection={tripReportsSection}
    />
  );
});

export default SubstanceArticlePage;

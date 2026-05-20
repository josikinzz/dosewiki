"use client";

import { memo, useMemo, type ReactNode } from "react";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { resolveMoleculeAssetsForArticle } from "@/data/mappings/moleculeAssets";
import type { SubstanceArticle } from "@/schema";
import type { SubstanceContent } from "@/types/content";
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
  content?: SubstanceContent;
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

interface DeferredSectionProps {
  children: ReactNode;
}

const DeferredSection = memo(function DeferredSection({
  children,
}: DeferredSectionProps) {
  return <div className="theme-article-section-bleed">{children}</div>;
});

/**
 * Unified article layout component that renders a substance article
 * using section components from /sections/.
 *
 * This component is used for both the public article pages and the
 * Generator preview tab, ensuring consistent visual design.
 */
export const ArticleLayout = memo(function ArticleLayout({
  article,
  content,
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
  const chemistryPresentation = useMemo(
    () => content?.chemistryPresentation ?? buildArticleChemistryPresentation(article),
    [article, content?.chemistryPresentation],
  );
  const moleculeAssets = useMemo(
    () => {
      if (content?.moleculeAssets) {
        return content.moleculeAssets;
      }

      return resolveMoleculeAssetsForArticle({
        id: article.id,
        title: article.title,
        identification: article.identification,
      }).assets;
    },
    [article, content?.moleculeAssets],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-8">
      <HeroSection
        article={article}
        chemistryPresentation={chemistryPresentation}
        moleculeAsset={moleculeAssets[0]}
        moleculeAssets={moleculeAssets}
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
      <DeferredSection>
        <ReagentSection article={article} chemistryPresentation={chemistryPresentation} />
      </DeferredSection>
      <DeferredSection>
        <PharmacologySection
          article={article}
          onSelectMechanism={onSelectMechanism}
        />
      </DeferredSection>
      <DeferredSection>
        <InteractionsSection
          article={article}
          onSelectInteraction={onSelectInteraction}
        />
      </DeferredSection>
      <DeferredSection>
        <ToleranceSection article={article} />
      </DeferredSection>
      <DeferredSection>
        <HarmPotentialSection article={article} />
      </DeferredSection>
      <DeferredSection>
        <HistoryCultureSection article={article} />
      </DeferredSection>
      <DeferredSection>
        {tripReportsSection ?? (
          <TripReportsSection
            reports={relatedTripReports}
            fromSubstanceSlug={fromSubstanceSlug}
            onSelectReport={onSelectReport}
          />
        )}
      </DeferredSection>
      <DeferredSection>
        <LegalitySection article={article} />
      </DeferredSection>
      <DeferredSection>
        <CitationsSection article={article} />
      </DeferredSection>
    </div>
  );
});

export default ArticleLayout;

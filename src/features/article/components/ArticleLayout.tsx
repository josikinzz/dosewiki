import { type ReactNode } from "react";
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
  fromSubstanceSlug?: string;
  relatedTripReports?: TripReport[];
  tripReportsSection?: ReactNode;
}

interface DeferredSectionProps {
  children: ReactNode;
}

function DeferredSection({ children }: DeferredSectionProps) {
  return <div className="theme-article-section-bleed">{children}</div>;
}

/**
 * Unified article layout component that renders a substance article
 * using section components from /sections/.
 *
 * This component is used for both the public article pages and the
 * Generator preview tab, ensuring consistent visual design.
 */
export function ArticleLayout({
  article,
  content,
  fromSubstanceSlug,
  relatedTripReports,
  tripReportsSection,
}: ArticleLayoutProps) {
  const chemistryPresentation = content?.chemistryPresentation ?? buildArticleChemistryPresentation(article);
  const moleculeAssets = content?.moleculeAssets ?? resolveMoleculeAssetsForArticle({
    id: article.id,
    title: article.title,
    identification: article.identification,
  }).assets;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 pb-16 pt-8">
      <div className="flex flex-col gap-6">
        <HeroSection
          article={article}
          chemistryPresentation={chemistryPresentation}
          moleculeAsset={moleculeAssets[0]}
          moleculeAssets={moleculeAssets}
          showPreviewBadge={false}
        />
        <TableOfContentsSection article={article} />
      </div>

      <div className="flex flex-col gap-14 sm:gap-16 lg:gap-20">
        <DosageDurationSection article={article} />
        <SubjectiveEffectsSection article={article} />
        <DeferredSection>
          <ReagentSection article={article} chemistryPresentation={chemistryPresentation} />
        </DeferredSection>
        <DeferredSection>
          <PharmacologySection article={article} />
        </DeferredSection>
        <DeferredSection>
          <InteractionsSection article={article} />
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
    </div>
  );
}

export default ArticleLayout;

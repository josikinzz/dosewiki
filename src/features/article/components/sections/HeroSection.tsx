import { memo, type ReactNode } from "react";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import type { ArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import type { SubstanceArticle } from "@/schema";
import type { MoleculeAsset } from "@/types/content";
import { ArticleStubBanner } from "./ArticleGapNotice";
import { HeroSectionView } from "./HeroSectionView.client";
import { HeroSummaryContent } from "./HeroSummaryContent";

interface HeroSectionProps {
  article: SubstanceArticle;
  chemistryPresentation?: ArticleChemistryPresentation;
  moleculeAsset?: MoleculeAsset;
  moleculeAssets?: MoleculeAsset[];
  /** Pre-rendered summary content for server article routes. */
  summaryContent?: ReactNode;
  onSelectCategory?: (categoryKey: string) => void;
  onSelectClassification?: (
    type: "psychoactive" | "chemical",
    label: string,
  ) => void;
  linkableCategoryKeys?: readonly string[];
  showPreviewBadge?: boolean;
}

/** Server-compatible projection boundary around the interactive hero layout. */
export const HeroSection = memo(function HeroSection({
  article,
  chemistryPresentation: providedChemistryPresentation,
  moleculeAsset,
  moleculeAssets,
  summaryContent,
  onSelectCategory,
  onSelectClassification,
  linkableCategoryKeys,
  showPreviewBadge = true,
}: HeroSectionProps) {
  const chemistryPresentation =
    providedChemistryPresentation ?? buildArticleChemistryPresentation(article);
  const resolvedMoleculeAsset = moleculeAsset ?? moleculeAssets?.[0];
  const hasSummary = Boolean(article.summary?.trim());

  return (
    <HeroSectionView
      title={article.title}
      identification={article.identification}
      classification={article.classification}
      indexCategories={article.index_categories}
      chemistryPresentation={chemistryPresentation}
      moleculeAsset={moleculeAsset}
      moleculeAssets={moleculeAssets}
      hasSummary={hasSummary}
      summaryContent={
        summaryContent ?? (
          <HeroSummaryContent
            article={article}
            hasMolecule={Boolean(resolvedMoleculeAsset?.url)}
          />
        )
      }
      stubBanner={
        <ArticleStubBanner
          article={article}
          className="mt-4 type-reading-measure"
        />
      }
      onSelectCategory={onSelectCategory}
      onSelectClassification={onSelectClassification}
      linkableCategoryKeys={linkableCategoryKeys}
      showPreviewBadge={showPreviewBadge}
    />
  );
});

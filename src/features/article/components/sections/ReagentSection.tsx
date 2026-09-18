import { memo } from "react";
import {
  buildArticleChemistryPresentation,
  type ArticleChemistryPresentation,
} from "@/data/builders/articleChemistryPresentation";
import {
  reagentDataToDisplayEntries,
  staticReagentRecordsToDisplayEntries,
  type NormalizedReagentData,
} from "@/lib/reagentTesting";
import type { SubstanceArticle } from "@/schema";
import { slugify } from "@/utils/slug";
import { ArticleText } from "../CitedText";
import {
  ReagentSectionFallback,
  ReagentSectionView,
} from "./ReagentSectionView.client";

interface ReagentSectionProps {
  article: SubstanceArticle;
  chemistryPresentation?: ArticleChemistryPresentation;
  substanceSlug?: string;
  externalReagentData?: NormalizedReagentData | null;
}

/** Server-compatible projection boundary around the expand/fallback controllers. */
export const ReagentSection = memo(function ReagentSection({
  article,
  chemistryPresentation: providedChemistryPresentation,
  substanceSlug,
  externalReagentData,
}: ReagentSectionProps) {
  const chemistryPresentation =
    providedChemistryPresentation ?? buildArticleChemistryPresentation(article);
  const reagentTesting = chemistryPresentation.reagentTesting;
  const staticEntries = reagentTesting.hasStaticData
    ? staticReagentRecordsToDisplayEntries(reagentTesting.staticEntries)
    : [];
  const intro = (
    <ArticleText cited={false} tone="muted">
      Expected colorimetric results for common reagent tests. Colors show
      reaction change over 1–2 minutes.
    </ArticleText>
  );

  if (externalReagentData === undefined) {
    const lookupIdentifier = reagentTesting.shouldFetchApiData
      ? (substanceSlug ?? slugify(article.title))
      : "";
    return (
      <ReagentSectionFallback
        lookupIdentifier={lookupIdentifier}
        staticEntries={staticEntries}
        intro={intro}
      />
    );
  }

  const entries = reagentTesting.hasStaticData
    ? staticEntries
    : reagentDataToDisplayEntries(externalReagentData);
  return <ReagentSectionView entries={entries} intro={intro} />;
});

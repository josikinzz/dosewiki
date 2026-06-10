import { isPubliclyListedSubstance, type PublicArticleProjection, type SubstanceArticle } from "../../schema";
import type { PublicSubstanceArticleRecord } from "../../../lib/convex/publicData.substanceContract";
import { buildSubstanceRecord, type SubstanceRecord } from "./contentBuilder";

export type LibraryArticleInput =
  | SubstanceArticle
  | PublicArticleProjection<SubstanceArticle>
  | PublicSubstanceArticleRecord;

export interface ArticleNormalizationProjection {
  articles: SubstanceArticle[];
  allSubstanceRecords: SubstanceRecord[];
  substanceRecords: SubstanceRecord[];
  allSubstancesBySlug: Map<string, SubstanceRecord>;
  substanceBySlug: Map<string, SubstanceRecord>;
}

export function projectArticleNormalization(
  articles: LibraryArticleInput[],
): ArticleNormalizationProjection {
  const allSubstanceRecords = articles
    .map((article) => buildSubstanceRecord(article))
    .filter((record): record is SubstanceRecord => record !== null);

  const substanceRecords = allSubstanceRecords.filter(isPubliclyListedSubstance);

  return {
    articles: articles as SubstanceArticle[],
    allSubstanceRecords,
    substanceRecords,
    allSubstancesBySlug: new Map(
      allSubstanceRecords.map((record) => [record.slug, record]),
    ),
    substanceBySlug: new Map(
      substanceRecords.map((record) => [record.slug, record]),
    ),
  };
}

import { isPubliclyListedSubstance, type PublicArticleProjection, type SubstanceArticle } from "../../schema";
import type {
  PublicSubstanceArticleRecord,
  PublicSubstanceLibraryInputRecord,
} from "../../../lib/data/publicData.substanceContract";
import { buildSubstanceRecord, type SubstanceRecord } from "./contentBuilder";

export type LibraryArticleInput =
  | SubstanceArticle
  | PublicArticleProjection<SubstanceArticle>
  | PublicSubstanceArticleRecord
  | PublicSubstanceLibraryInputRecord;

export interface ArticleNormalizationProjection<
  TArticle extends LibraryArticleInput = LibraryArticleInput,
> {
  articles: TArticle[];
  allSubstanceRecords: SubstanceRecord[];
  substanceRecords: SubstanceRecord[];
  allSubstancesBySlug: Map<string, SubstanceRecord>;
  substanceBySlug: Map<string, SubstanceRecord>;
}

export function projectArticleNormalization<TArticle extends LibraryArticleInput>(
  articles: TArticle[],
): ArticleNormalizationProjection<TArticle> {
  const allSubstanceRecords = articles
    .map((article) => buildSubstanceRecord(article))
    .filter((record): record is SubstanceRecord => record !== null);

  const substanceRecords = allSubstanceRecords.filter(isPubliclyListedSubstance);

  return {
    articles,
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

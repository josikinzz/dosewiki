import type { SubstanceArticle } from "@/schema";
import { SUBSTANCE_SECTION_MANIFEST } from "@/schema/substance/sectionManifest";
import {
  ARTICLE_GAP_ORDER,
  ARTICLE_GAP_POLICIES,
  type ArticleGapPolicyKey,
} from "./articleGapCopy";

export function getEmptyArticleSectionKeys(
  article: SubstanceArticle,
): ArticleGapPolicyKey[] {
  return ARTICLE_GAP_ORDER.filter((key) => {
    const entry = SUBSTANCE_SECTION_MANIFEST.find(
      (candidate) => candidate.id === ARTICLE_GAP_POLICIES[key].id,
    );
    const isPresent = entry?.public.isPresent;
    return isPresent ? !isPresent(article) : false;
  });
}

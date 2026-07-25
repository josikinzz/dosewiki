import type { SubstanceArticle } from "@/schema";
import { SUBSTANCE_SECTION_MANIFEST } from "@/schema/substance/sectionManifest";
import {
  ARTICLE_GAP_ORDER,
  ARTICLE_GAP_POLICIES,
  type ArticleGapPolicyKey,
} from "./articleGapCopy";

/**
 * Which editorial sections have no publishable content, in article order.
 *
 * Deliberately reads the same `public.isPresent` predicates the section
 * components and the table of contents use, so the stub banner can never
 * disagree with what the page actually renders.
 */
export function getEmptyArticleSectionKeys(
  article: SubstanceArticle,
): ArticleGapPolicyKey[] {
  return ARTICLE_GAP_ORDER.filter((key) => {
    const entry = SUBSTANCE_SECTION_MANIFEST.find(
      (candidate) => candidate.id === ARTICLE_GAP_POLICIES[key].id,
    );
    const isPresent = entry?.public.isPresent;
    // No predicate means the section always has something to show.
    return isPresent ? !isPresent(article) : false;
  });
}

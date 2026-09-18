import { hasDosageDurationContent } from "./dosageDurationPresence";
import {
  ALWAYS_RENDERED_PUBLIC_SECTION_IDS,
  SUBSTANCE_SECTION_MANIFEST,
} from "./sectionManifest";

/** An article shows the stub banner once this many editorial sections are empty. */
export const STUB_THRESHOLD = 3;

export type ArticleStubReason = "missing-sections" | "no-dosage";

export interface ArticleStubVerdict {
  isStub: boolean;
  reasons: ArticleStubReason[];
  /** Section ids with no publishable content, in article order. */
  emptySectionIds: string[];
}

/**
 * Which of the seven editorial sections have no publishable content.
 *
 * Reads the same `public.isPresent` predicates the section components, the
 * table of contents, and the coverage audit use, so a stub verdict can never
 * disagree with what the page actually renders.
 */
export function getEmptyStubSectionIds(article: unknown): string[] {
  return ALWAYS_RENDERED_PUBLIC_SECTION_IDS.filter((id) => {
    const entry = SUBSTANCE_SECTION_MANIFEST.find((candidate) => candidate.id === id);
    const isPresent = entry?.public.isPresent;
    // No predicate means the section always has something to show.
    return isPresent ? !isPresent(article as never) : false;
  });
}

/**
 * Whether an article reads as a stub, and why.
 *
 * Two independent qualifiers:
 *  - three or more of the seven editorial sections are empty, or
 *  - the article publishes no dosage or duration data at all, which on a drug
 *    reference is disqualifying on its own regardless of how much prose the
 *    other sections carry.
 */
export function getArticleStubVerdict(article: unknown): ArticleStubVerdict {
  const emptySectionIds = getEmptyStubSectionIds(article);
  const reasons: ArticleStubReason[] = [];

  if (emptySectionIds.length >= STUB_THRESHOLD) {
    reasons.push("missing-sections");
  }
  if (!hasDosageDurationContent(article as { dosage?: never; duration?: never })) {
    reasons.push("no-dosage");
  }

  return { isStub: reasons.length > 0, reasons, emptySectionIds };
}

export function isArticleStub(article: unknown): boolean {
  return getArticleStubVerdict(article).isStub;
}

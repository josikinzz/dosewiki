import { hasDosageDurationContent } from "./dosageDurationPresence";
import {
  ALWAYS_RENDERED_PUBLIC_SECTION_IDS,
  SUBSTANCE_SECTION_MANIFEST,
} from "./sectionManifest";

export const STUB_THRESHOLD = 3;

export type ArticleStubReason = "missing-sections" | "no-dosage";

export interface ArticleStubVerdict {
  isStub: boolean;
  reasons: ArticleStubReason[];
  emptySectionIds: string[];
}

export function getEmptyStubSectionIds(article: unknown): string[] {
  return ALWAYS_RENDERED_PUBLIC_SECTION_IDS.filter((id) => {
    const entry = SUBSTANCE_SECTION_MANIFEST.find((candidate) => candidate.id === id);
    const isPresent = entry?.public.isPresent;
    return isPresent ? !isPresent(article as never) : false;
  });
}

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

import { memo, type ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import { getArticleStubVerdict } from "@/schema/substance/articleStubPolicy";
import {
  ARTICLE_GAP_POLICIES,
  SUBSECTION_GAP_POLICIES,
  resolveGap,
  resolveSubsectionGapReason,
  type ArticleGapPolicyKey,
  type SubsectionGapPolicyKey,
} from "./articleGapCopy";
import { getEmptyArticleSectionKeys } from "./articleGapPresence";
import {
  ArticleGapNoticeView,
  ArticleStubBannerView,
  ArticleSubsectionGapNoticeView,
} from "./ArticleGapNoticeView.client";

export interface ArticleGapNoticeProps {
  article: SubstanceArticle;
  section: ArticleGapPolicyKey;
  footer?: ReactNode;
}

/** Pure projection wrapper: whole-article gap policy is resolved before the client boundary. */
export const ArticleGapNotice = memo(function ArticleGapNotice({
  article,
  section,
  footer,
}: ArticleGapNoticeProps) {
  return (
    <ArticleGapNoticeView
      section={section}
      gap={resolveGap(article, ARTICLE_GAP_POLICIES[section])}
      footer={footer}
    />
  );
});

export interface ArticleSubsectionGapProps {
  article: SubstanceArticle;
  slots: SubsectionGapPolicyKey[];
  parentGapKey: string;
  className?: string;
}

/** Pure projection wrapper: only resolved reason scalars cross to localization. */
export const ArticleSubsectionGapNotice = memo(
  function ArticleSubsectionGapNotice({
    article,
    slots,
    parentGapKey,
    className,
  }: ArticleSubsectionGapProps) {
    if (slots.length === 0) return null;
    const reasons = slots.map((slot) =>
      resolveSubsectionGapReason(
        article,
        SUBSECTION_GAP_POLICIES[slot],
        parentGapKey,
      ),
    );
    return (
      <ArticleSubsectionGapNoticeView
        slots={slots}
        reasons={reasons}
        className={className}
      />
    );
  },
);

export interface ArticleStubBannerProps {
  article: SubstanceArticle;
  className?: string;
}

/** Pure projection wrapper: classification and missing-section scans remain server-side. */
export const ArticleStubBanner = memo(function ArticleStubBanner({
  article,
  className,
}: ArticleStubBannerProps) {
  const verdict = getArticleStubVerdict(article);
  if (!verdict.isStub) return null;
  return (
    <ArticleStubBannerView
      verdict={verdict}
      missing={getEmptyArticleSectionKeys(article)}
      className={className}
    />
  );
});

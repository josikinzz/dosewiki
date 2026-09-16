import { memo } from "react";
import type { SubstanceArticle } from "@/schema";
import {
  NAMED_SIBLINGS,
  type ArticleRecentChange,
} from "@/data/changelog/articleRecentChanges";
import { getArticleCitationModel } from "@/lib/citations/referenceModel";
import { publicHref } from "@/utils/publicHref";
import {
  EXPERT_REVIEW_CREDIT_FALLBACK,
  REVIEW_STATUS_BANNER_FALLBACK,
} from "./articleReviewCopy";
import {
  ContributorsSectionView,
  type RecentChangesProjection,
} from "./ContributorsSectionView.client";

/** Profile-resolved avatar URLs for the two fixed credit roles. */
export interface ContributorAvatarMap {
  josie?: string | null;
  lyrea?: string | null;
}

interface ContributorsSectionProps {
  article: SubstanceArticle;
  avatars?: ContributorAvatarMap;
  profileHrefs?: { josie?: string | null; lyrea?: string | null };
  expertReviewCredit?: string;
  reviewStatusCopy?: string;
  recentChanges?: ArticleRecentChange[];
}

const DOCS_HOW_HREF = "/docs/how";
const JOSIE_FALLBACK_AVATAR_SRC = "/profile-avatars/josie/avatar.webp";

const summaryDayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const summaryDateWithYearFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Trim each row's touched-article list to what the article surface names.
 *
 * A Dev-editor bulk save records every substance it touched. The row renders
 * at most `NAMED_SIBLINGS` of them plus "and N more", so shipping the whole
 * list would put the entire substance index in every article document.
 */
function trimRecentChangeSiblings(
  changes: ArticleRecentChange[],
): ArticleRecentChange[] {
  return changes.map((change) => {
    const siblings = change.articles.filter(
      (touched) => touched.slug !== change.subjectSlug,
    );
    if (siblings.length <= NAMED_SIBLINGS) return change;
    const subject = change.articles.filter(
      (touched) => touched.slug === change.subjectSlug,
    );
    return {
      ...change,
      articles: [...subject, ...siblings.slice(0, NAMED_SIBLINGS)],
      siblingTotal: siblings.length,
    };
  });
}

function projectRecentChanges(
  article: SubstanceArticle,
  changes: ArticleRecentChange[],
): RecentChangesProjection | undefined {
  const latest = changes[0];
  if (!latest) return undefined;

  const latestDate = new Date(latest.createdAt);
  const dateFormat =
    latestDate.getUTCFullYear() === new Date().getUTCFullYear()
      ? summaryDayFormat
      : summaryDateWithYearFormat;
  const numbers = Object.fromEntries(
    getArticleCitationModel(article).numbersById,
  );
  const slug = latest.subjectSlug;

  return {
    changes: trimRecentChangeSiblings(changes),
    citations: { numbers, hrefBase: "" },
    latestCreatedAt: latest.createdAt,
    latestDateLabel: dateFormat.format(latestDate),
    articleChangesHref: publicHref.changes(slug ?? undefined),
    allChangesHref: publicHref.changes(),
    hasArticleSlug: Boolean(slug),
  };
}

/** Server-compatible projection boundary for article credits and change history. */
export const ContributorsSection = memo(function ContributorsSection({
  article,
  avatars,
  profileHrefs,
  expertReviewCredit,
  reviewStatusCopy,
  recentChanges = [],
}: ContributorsSectionProps) {
  const expertReviewed =
    ("expert_reviewed" in article && article.expert_reviewed === true) ||
    article.editorial_review?.status === "completed";

  return (
    <ContributorsSectionView
      expertReviewed={expertReviewed}
      josieAvatarSrc={avatars?.josie ?? JOSIE_FALLBACK_AVATAR_SRC}
      lyreaAvatarSrc={avatars?.lyrea}
      josieProfileHref={profileHrefs?.josie}
      lyreaProfileHref={profileHrefs?.lyrea}
      expertReviewCredit={expertReviewCredit ?? EXPERT_REVIEW_CREDIT_FALLBACK}
      reviewStatusCopy={reviewStatusCopy ?? REVIEW_STATUS_BANNER_FALLBACK}
      docsHowHref={DOCS_HOW_HREF}
      recentChanges={projectRecentChanges(article, recentChanges)}
    />
  );
});

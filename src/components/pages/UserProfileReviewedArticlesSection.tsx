"use client";

import { ExpandableList } from "@/components/common/ArticleExpandable";
import { PublicPill } from "@/components/common/PublicTokens";
import { PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import type { ContributorReviewedArticle } from "@/types/reviewedArticles";
import { useT } from "@/i18n/client";

const PREVIEW_LIMIT = 24;

interface UserProfileReviewedArticlesSectionProps {
  reviewedArticles: readonly ContributorReviewedArticle[];
  contributorName: string;
}

function ReviewedArticleTags({
  reviewedArticles,
  ariaLabel,
}: {
  reviewedArticles: readonly ContributorReviewedArticle[];
  ariaLabel?: string;
}) {
  return (
    <ul aria-label={ariaLabel} className="flex list-none flex-wrap gap-1.5">
      {reviewedArticles.map((article) => (
        <li key={article.slug} className="min-w-0">
          <PublicPill
            as="a"
            href={publicHref.substance(article.slug)}
            size="sm"
            className={cn(
              "max-w-full cursor-pointer transition-opacity hover:opacity-90",
              focusRingClassName,
            )}
          >
            <span className="truncate">{article.title}</span>
          </PublicPill>
        </li>
      ))}
    </ul>
  );
}

export function UserProfileReviewedArticlesSection({
  reviewedArticles,
  contributorName,
}: UserProfileReviewedArticlesSectionProps) {
  const t = useT();
  if (reviewedArticles.length === 0) {
    return null;
  }

  return (
    <section className="space-y-5">
      <PublicSectionHeading
        icon={icons.shieldCheck}
        title={t("Reviewed articles")}
        titleElement="h2"
        actions={
          <PublicPill tone="neutral" size="sm">
            {reviewedArticles.length}
          </PublicPill>
        }
      />

      <ExpandableList
        ariaLabelBase={t("reviewed articles")}
        items={reviewedArticles}
        collapsedCount={Math.max(reviewedArticles.length - PREVIEW_LIMIT, 0)}
      >
        {({ items }) => (
          <ReviewedArticleTags
            reviewedArticles={items}
            ariaLabel={t("Substance articles {{name}} reviewed", { name: contributorName })}
          />
        )}
      </ExpandableList>
    </section>
  );
}

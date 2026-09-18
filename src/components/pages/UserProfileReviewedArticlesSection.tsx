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

/**
 * The substance articles a contributor expert-reviewed, as a tag list.
 *
 * Same anatomy as `UserProfileEffectCreditsSection`, and for the same reason:
 * the one reviewer this section currently exists for has ~82 completed reviews
 * on production, and 82 tags dumped inline would bury the changelog beneath
 * them. A bounded run of tags with the shared `ExpandableList` count pill —
 * the same centered `+N` expander the substance-article sections use — keeps
 * the section a fixed cost whatever the number is, while a profile with a
 * handful of reviews renders them all inline with no expander.
 *
 * The shield-check heading icon is the same glyph as the expert-review credit
 * in the article footer (`ContributorsSection`) and the review banner, so
 * "reviewed" looks like one concept everywhere it appears.
 *
 * The data behind this is deliberately thin: each entry is title + slug +
 * completion timestamp, resolved against the reviewer's identity inside
 * Postgres. No reviewer email exists in this component's input, so none can
 * leak into the markup.
 */

const PREVIEW_LIMIT = 24;

interface UserProfileReviewedArticlesSectionProps {
  reviewedArticles: readonly ContributorReviewedArticle[];
  /** Whose reviews these are; used to name the list for assistive tech. */
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
    // A plain wrapped run rather than `PublicChipNav`, matching the effect
    // credits above it: that recipe is a filter nav and emits a landmark, and
    // two landmarks for one contributor's reviews would clutter the page's
    // landmark list. The pill itself is the shared one.
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
  // A contributor with no completed reviews renders no section at all, the
  // same way the works carousel and the effect credits stay absent rather
  // than showing an empty shell.
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

import Link from "next/link";
import { ArticleSubsectionCard } from "@/components/common/ArticleSection";
import { PublicPill } from "@/components/common/PublicTokens";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { icons } from "@/utils/iconNames";

interface ArticleSummary {
  slug: string;
  title: string;
  tags: string[];
  shortDescription?: string;
  publicationDate?: string;
}

interface ArticlesIndexPageProps {
  articles: ArticleSummary[];
  emptyState?: PublicRouteEmptyState;
}

export function ArticlesIndexPage({
  articles,
  emptyState,
}: ArticlesIndexPageProps) {
  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader
        title="Articles"
        description="Published guides, scales, and long-form writing from the Effect Index archive."
        icon={icons.bookOpenText}
        prominentMobileIcon
      />

      {emptyState ? (
        <StateCard
          badge={emptyState.badge}
          title={emptyState.title}
          description={emptyState.description}
          icon={emptyState.icon}
          footer={emptyState.footer}
        />
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <ArticleSubsectionCard
              key={article.slug}
              asChild
              padding="none"
              variant="interactive"
            >
              <Link
                href={`/articles/${article.slug}`}
                className="group block px-5 py-5 sm:px-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="theme-accent-heading text-xl font-semibold transition group-hover:text-dose-accent-strong">
                      {article.title}
                    </h2>
                    {article.shortDescription ? (
                      <p className="theme-text-secondary mt-2 text-sm leading-6">
                        {article.shortDescription}
                      </p>
                    ) : null}
                  </div>
                  {article.publicationDate ? (
                    <time
                      className="theme-text-faint text-xs"
                      dateTime={article.publicationDate}
                    >
                      {article.publicationDate.slice(0, 10)}
                    </time>
                  ) : null}
                </div>

                {article.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {article.tags.map((tag) => (
                      <PublicPill key={tag} size="sm">
                        {tag}
                      </PublicPill>
                    ))}
                  </div>
                ) : null}
              </Link>
            </ArticleSubsectionCard>
          ))}
        </div>
      )}
    </PublicContentShell>
  );
}

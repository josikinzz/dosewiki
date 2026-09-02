import Link from "next/link";
import { SmartLink } from "@/components/common/SmartLink";
import { PublicPill } from "@/components/common/PublicTokens";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentSection } from "@/components/layout/PublicContentPrimitives";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import {
  groupArticlesForIndex,
  type ArticleIndexEntry,
  type ArticleIndexRow,
} from "../domain/articlesIndex";

interface ArticlesIndexPageProps {
  articles: ArticleIndexEntry[];
  emptyState?: PublicRouteEmptyState;
}

export function ArticlesIndexPage({
  articles,
  emptyState,
}: ArticlesIndexPageProps) {
  const groups = groupArticlesForIndex(articles);

  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader
        title="Articles"
        description="Published guides, scales, and long-form writing from the Effect Index archive."
        icon={icons.bookOpenText}
      />

      {emptyState ? (
        <StateCard
          badge={emptyState.badge}
          title={emptyState.title}
          description={emptyState.description}
          icon={emptyState.icon}
          footer={emptyState.footer}
          tone="neutral"
          // An empty index is a dead end unless it hands the reader somewhere
          // real to go, and this deployment can legitimately have no articles.
          actions={
            <>
              <Button asChild>
                <Link href={publicHref.effects()}>Browse the effect index</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={publicHref.substances()}>Browse substances</Link>
              </Button>
            </>
          }
        />
      ) : (
        <div className="space-y-14">
          {groups.map((group) => (
            <PublicContentSection
              key={group.id}
              heading={group.label}
              icon={group.icon}
            >
              <p className="theme-text-muted mt-3 max-w-2xl text-sm leading-6">
                {group.blurb}
              </p>
              <ul className="mt-5">
                {group.articles.map((article) => (
                  <ArticleIndexRowItem key={article.slug} article={article} />
                ))}
              </ul>
            </PublicContentSection>
          ))}
        </div>
      )}
    </PublicContentShell>
  );
}

/**
 * One article as an open index row, sharing the hairline-separated row material
 * used by the reports explorer. Definitional pages collapse to a single line so
 * the eye can tell a glossary entry from a guide before reading either.
 */
function ArticleIndexRowItem({ article }: { article: ArticleIndexRow }) {
  const href = `/articles/${article.slug}`;

  if (article.density === "compact") {
    return (
      <li className="theme-index-row">
        <SmartLink
          href={href}
          className="theme-index-row-link group flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl px-3 py-2.5"
        >
          <span className="theme-accent-heading shrink-0 text-[0.9375rem] font-medium transition group-hover:opacity-90">
            {article.title}
          </span>
          {article.description ? (
            <span className="theme-text-muted min-w-0 flex-1 text-xs leading-5">
              {article.description}
            </span>
          ) : null}
        </SmartLink>
      </li>
    );
  }

  return (
    <li className="theme-index-row">
      <SmartLink
        href={href}
        className="theme-index-row-link group block rounded-xl px-3 py-3"
      >
        <h3 className="theme-accent-heading text-lg font-semibold leading-snug transition group-hover:opacity-90">
          {article.title}
        </h3>
        {article.description ? (
          <p className="theme-text-secondary mt-1.5 max-w-2xl text-sm leading-6">
            {article.description}
          </p>
        ) : null}
        <p className="theme-text-faint mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
          {article.dateLabel ? <span>{article.dateLabel}</span> : null}
          {article.dateLabel && article.lengthLabel ? (
            <span aria-hidden>·</span>
          ) : null}
          {article.lengthLabel ? <span>{article.lengthLabel}</span> : null}
          {article.tags.map((tag) => (
            <PublicPill key={tag} size="sm">
              {tag}
            </PublicPill>
          ))}
        </p>
      </SmartLink>
    </li>
  );
}

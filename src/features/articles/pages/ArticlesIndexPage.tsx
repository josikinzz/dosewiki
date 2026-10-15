import Link from "next/link";
import { SmartLink } from "@/components/common/SmartLink";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentSection } from "@/components/layout/PublicContentPrimitives";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { getRequestLocale, t } from "@/i18n/server";
import { formattingLocale } from "@/i18n/messages";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import { articleHref } from "../domain/articleGuides";
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
    <PublicContentShell width="wide" focusTarget>
      <PageHeader
        title={t("Articles")}
        description={t("Published guides, scales, and long-form writing from the Effect Index archive.")}
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
          actions={
            <>
              <Button asChild>
                <Link href={publicHref.effects()}>{t("Browse the effect index")}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={publicHref.substances()}>{t("Browse substances")}</Link>
              </Button>
            </>
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <PublicContentSection
              key={group.id}
              heading={t(group.label)}
              icon={group.icon}
            >
              <p className="theme-text-muted mt-1 text-xs leading-5">{t(group.blurb)}</p>
              <ul className="mt-3">
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

function publishedMonthLabel(publishedMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(publishedMonth);
  if (!match) return publishedMonth;
  return new Intl.DateTimeFormat(formattingLocale(getRequestLocale()), { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function ArticleIndexRowItem({ article }: { article: ArticleIndexRow }) {
  const meta = [
    article.publishedMonth ? publishedMonthLabel(article.publishedMonth) : null,
    article.readMinutes ? t("{{minutes}} min read", { minutes: article.readMinutes }) : null,
  ].filter(Boolean).join(" · ");

  return (
    <li className="theme-index-row">
      <SmartLink
        href={articleHref(article.slug)}
        className="theme-index-row-link group flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 sm:flex-nowrap"
      >
        <span className="theme-accent-heading shrink-0 text-[0.9375rem] font-medium transition group-hover:opacity-90">
          {article.title}
        </span>
        {article.description ? (
          <span className="theme-text-muted min-w-0 basis-full text-xs leading-5 sm:flex-1 sm:truncate">
            {article.description}
          </span>
        ) : null}
        {meta ? (
          <span className="theme-text-faint numeric-tabular basis-full text-xs sm:ml-auto sm:shrink-0 sm:basis-auto">
            {meta}
          </span>
        ) : null}
      </SmartLink>
    </li>
  );
}

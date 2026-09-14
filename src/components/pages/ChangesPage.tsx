import { RecentChangesList } from "@/components/changelog/RecentChangesList";
import { SmartLink } from "@/components/common/SmartLink";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";
import { publicHref } from "@/utils/publicHref";
import { t } from "@/i18n/server";

interface ChangesPageProps {
  changes: ArticleRecentChange[];
  /** The article the list is filtered to, when `?article=` named one that exists. */
  article: { slug: string; title: string } | null;
}

const linkClassName =
  "theme-accent-heading theme-focus-ring rounded font-semibold underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2 hover:decoration-current";

/**
 * Every human edit across the site, or one article's, newest first. Only
 * signed-in editor saves write changelog rows, so this is the record of what
 * people changed by hand; automated pipelines never appear here.
 */
export function ChangesPage({ changes, article }: ChangesPageProps) {
  return (
    <PublicContentShell focusTarget width="standard">
      <PageHeader
        icon="lucide:git-commit-horizontal"
        title={article ? t("Changes to {{name}}", { name: article.title }) : t("Recent changes")}
        description={
          article ? (
            <>
              {t("Every edit a person has made to the")}{" "}
              <SmartLink href={publicHref.substance(article.slug)} className={linkClassName}>
                {article.title}
              </SmartLink>{" "}
              {t("article, newest first.")}{" "}
              <SmartLink href={publicHref.changes()} className={linkClassName}>
                {t("See changes across the whole site")}
              </SmartLink>
              .
            </>
          ) : (
            t("Every edit a person has made to a dose.wiki article, newest first. Automated pipelines never write here, so each row is someone reading a source and changing the text.")
          )
        }
      />
      {changes.length === 0 ? (
        <StateCard
          icon="lucide:git-commit-horizontal"
          tone="neutral"
          align="center"
          compact
          title={article ? t("No human edits yet") : t("No edits recorded yet")}
          description={
            article
              ? t("This article has only been touched by the automated synthesis pipeline so far.")
              : t("Nothing has been edited by hand yet.")
          }
        />
      ) : (
        <RecentChangesList changes={changes} article={null} hideArticleNames={article !== null} />
      )}
    </PublicContentShell>
  );
}

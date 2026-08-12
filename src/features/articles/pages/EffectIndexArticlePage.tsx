import Link from "next/link";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { PublicPill } from "@/components/common/PublicTokens";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { EffectCitationsSection } from "@/features/effects/components/EffectCitationsSection";
import { VCodeRenderer } from "@/features/effects/vcode/VCodeRenderer";
import type { VCodeContent } from "@/features/effects/vcode/types";
import {
  getEffectIndexArticleTocItems,
  getMarkdownArticleTocItems,
} from "../articleTocModel";
import type { ArticleBylineAuthor } from "../domain/articleByline";
import { formatArchiveDate } from "@/utils/archiveDate";
import { icons } from "@/utils/iconNames";

interface EffectIndexArticle {
  title: string;
  tags: string[];
  shortDescription?: string;
  publicationDate?: string;
  body_raw: string;
  body_ast?: VCodeContent;
  /**
   * Absent on every legacy Effect Index row, and absence means the VCode markup
   * this page has always rendered. Only `"markdown"` takes the other branch.
   */
  bodyFormat?: "vcode" | "markdown";
  citations?: Array<{
    url: string;
    text: string;
  }>;
}

interface EffectIndexArticlePageProps {
  article: EffectIndexArticle;
  /**
   * Resolved from the article's `authorProfileKeys` by the route loader. Empty
   * for an article whose keys are missing or claim no profile, and then no
   * byline renders at all — the same as before the backfill.
   */
  bylineAuthors?: ArticleBylineAuthor[];
}

export function EffectIndexArticlePage({
  article,
  bylineAuthors = [],
}: EffectIndexArticlePageProps) {
  // A date is not a tag: it gets a `<time>` of its own, set in figures rather
  // than in the tracked-out caps a tag wears, so the row reads as "published
  // then, filed under these" instead of as one undifferentiated run of chips.
  const publishedLabel = formatArchiveDate(article.publicationDate);
  const publishedDateTime = article.publicationDate?.slice(0, 10);

  // Two body languages share this page. Legacy rows carry VCode — in `body_ast`
  // when the read model parsed it, otherwise as markup in `body_raw` — and rows
  // written in the Writing tab carry plain Markdown. The contents rail is built
  // by whichever extractor matches, and both emit the ids their renderer emits,
  // so the rail links land on the same anchors either way.
  const isMarkdown = article.bodyFormat === "markdown";
  const body = article.body_ast ?? article.body_raw;
  const tocItems = isMarkdown
    ? getMarkdownArticleTocItems(article.body_raw)
    : getEffectIndexArticleTocItems(body);
  const tocNode =
    tocItems.length > 0 ? <PublicTableOfContents items={tocItems} variant="bare" /> : null;

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout
        toc={tocNode}
        maxWidthClass="max-w-3xl"
        contentClassName="gap-10"
        className="theme-toc-strip-scope"
      >
        {/* Mobile/tablet TOC: sticky chip strip above the title, pinned under
            the site header from the very first scroll; replaced by the sticky
            gutter TOC at >=1200px. */}
        {tocNode ? <PublicTocStrip items={tocItems} /> : null}

        {/* Title and its meta share one edge with the contents rail. */}
        <div className="flex flex-col gap-5">
          <PageHeader
            align="left"
            className="mb-0"
            title={article.title}
            description={article.shortDescription}
            descriptionClassName="type-deck theme-accent-emphasis-scope theme-text-secondary"
            icon={icons.bookOpenText}
          />

          {publishedLabel || bylineAuthors.length > 0 || article.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {bylineAuthors.length > 0 ? (
                <p className="theme-text-muted type-detail-copy">
                  by{" "}
                  {bylineAuthors.map((author, index) => (
                    <span key={author.key}>
                      {index > 0 ? (index === bylineAuthors.length - 1 ? " and " : ", ") : null}
                      <Link
                        href={author.href}
                        className="theme-text-secondary underline-offset-2 hover:underline"
                      >
                        {author.name}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
              {publishedLabel ? (
                <time
                  dateTime={publishedDateTime}
                  className="theme-text-muted type-detail-copy numeric-tabular"
                >
                  {publishedLabel}
                </time>
              ) : null}
              {article.tags.map((tag) => (
                <PublicPill key={tag} size="sm">
                  {tag}
                </PublicPill>
              ))}
            </div>
          ) : null}
        </div>

        <article className="theme-text-secondary prose prose-invert prose-fuchsia prose-a:font-normal max-w-none overflow-hidden text-[1.0625rem] leading-7">
          {isMarkdown ? (
            <PublicMarkdownBody content={article.body_raw} headingIds />
          ) : (
            <VCodeRenderer content={body} citations={article.citations} headingIds />
          )}
        </article>

        <EffectCitationsSection citations={article.citations} />
      </StickyTocLayout>
    </main>
  );
}

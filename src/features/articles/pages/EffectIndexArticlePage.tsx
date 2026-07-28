import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicPill } from "@/components/common/PublicTokens";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { EffectCitationsSection } from "@/features/effects/components/EffectCitationsSection";
import { VCodeRenderer } from "@/features/effects/vcode/VCodeRenderer";
import type { VCodeContent } from "@/features/effects/vcode/types";
import { getEffectIndexArticleTocItems } from "../articleTocModel";
import { icons } from "@/utils/iconNames";

interface EffectIndexArticle {
  title: string;
  tags: string[];
  shortDescription?: string;
  publicationDate?: string;
  body_raw: string;
  body_ast?: VCodeContent;
  citations?: Array<{
    url: string;
    text: string;
  }>;
}

interface EffectIndexArticlePageProps {
  article: EffectIndexArticle;
}

export function EffectIndexArticlePage({
  article,
}: EffectIndexArticlePageProps) {
  const meta = [
    article.publicationDate ? article.publicationDate.slice(0, 10) : null,
    ...article.tags,
  ].filter((value): value is string => Boolean(value));

  const body = article.body_ast ?? article.body_raw;
  const tocItems = getEffectIndexArticleTocItems(body);
  const tocNode =
    tocItems.length > 0 ? <PublicTableOfContents items={tocItems} variant="bare" /> : null;

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout toc={tocNode} maxWidthClass="max-w-3xl" contentClassName="gap-10">
        {/* Title and its meta share one edge with the contents rail. */}
        <div className="flex flex-col gap-5">
          <PageHeader
            align="left"
            className="mb-0"
            title={article.title}
            description={article.shortDescription}
            icon={icons.bookOpenText}
          />

          {meta.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {meta.map((value) => (
                <PublicPill key={value} size="sm">
                  {value}
                </PublicPill>
              ))}
            </div>
          ) : null}
        </div>

        {/* Inline TOC for mobile/tablet; replaced by the sticky gutter TOC at >=1200px. */}
        {tocNode ? (
          <div className="min-[1200px]:hidden">
            <PublicTableOfContents items={tocItems} />
          </div>
        ) : null}

        <article className="theme-text-secondary prose prose-invert prose-fuchsia prose-a:font-normal max-w-none overflow-hidden text-[1.0625rem] leading-7">
          <VCodeRenderer content={body} citations={article.citations} headingIds />
        </article>

        <EffectCitationsSection citations={article.citations} />
      </StickyTocLayout>
    </main>
  );
}

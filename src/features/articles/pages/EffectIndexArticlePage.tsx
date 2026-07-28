import { PublicPill } from "@/components/common/PublicTokens";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { EffectCitationsSection } from "@/features/effects/components/EffectCitationsSection";
import { VCodeRenderer } from "@/features/effects/vcode/VCodeRenderer";
import type { VCodeContent } from "@/features/effects/vcode/types";
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

  return (
    <PublicContentShell width="narrow" focusTarget>
      <PageHeader
        title={article.title}
        description={article.shortDescription}
        icon={icons.bookOpenText}
      />

      {meta.length > 0 ? (
        <div className="-mt-10 mb-10 flex flex-wrap justify-center gap-2">
          {meta.map((value) => (
            <PublicPill key={value} size="sm">
              {value}
            </PublicPill>
          ))}
        </div>
      ) : null}

      <article className="theme-text-secondary prose prose-invert prose-fuchsia prose-a:font-normal max-w-none overflow-hidden text-[1.0625rem] leading-7">
        <VCodeRenderer
          content={article.body_ast ?? article.body_raw}
          citations={article.citations}
        />
      </article>

      <EffectCitationsSection citations={article.citations} />
    </PublicContentShell>
  );
}

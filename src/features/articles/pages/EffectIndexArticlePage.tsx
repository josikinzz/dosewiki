import Link from "next/link";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { PublicPill } from "@/components/common/PublicTokens";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { PublicAttributionSection } from "@/components/layout/PublicContentPrimitives";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { CommentaryBubble } from "@/features/effects/components/CommentaryBubble";
import { EffectCitationsSection } from "@/features/effects/components/EffectCitationsSection";
import { VCodeRenderer } from "@/features/effects/vcode/VCodeRenderer";
import { createVCodeHeadingIdAssigner } from "@/features/effects/vcode/headings";
import type { VCodeContent } from "@/features/effects/vcode/types";
import { cn } from "@/lib/utils";
import { icons } from "@/utils/iconNames";
import { formattingLocale, type Translate, type UiLocale } from "@/i18n/messages";
import {
  buildEffectIndexArticleModel,
  type ArticleBodyContent,
  type ArticleCommentarySectionModel,
} from "../articleSectionModel";
import type { ArticleBylineAuthor } from "../domain/articleByline";

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
  locale?: UiLocale;
  t: Translate;
  /**
   * Resolved from the article's `authorProfileKeys` by the route loader. Empty
   * for an article whose keys are missing or claim no profile, and then no
   * byline renders at all — the same as before the backfill.
   */
  bylineAuthors?: ArticleBylineAuthor[];
}

/** Keep narrative measure independent of the full-width shared effect panels. */
const SECTION_PROSE_CLASS_NAME =
  "article-narrative-body theme-text-secondary prose prose-fuchsia mt-6 max-w-none";
const OVERVIEW_PROSE_CLASS_NAME =
  "article-narrative-body theme-text-secondary prose prose-fuchsia max-w-none overflow-hidden text-[1.0625rem] leading-7";

interface ArticleBodyProps {
  body: ArticleBodyContent;
  citations?: EffectIndexArticle["citations"];
  assignHeadingId: (text: string) => string | undefined;
  narrative?: boolean;
  headingLevel?: 2 | 3;
}

/**
 * One section's body in whichever language it was written. Both renderers
 * share the page's id assigner, so a repeated heading title numbers across
 * sections instead of restarting inside each.
 */
function ArticleBody({
  body,
  citations,
  assignHeadingId,
  narrative = false,
  headingLevel = 3,
}: ArticleBodyProps) {
  return body.format === "markdown" ? (
    <PublicMarkdownBody content={body.content} assignHeadingId={assignHeadingId} />
  ) : (
    <VCodeRenderer
      content={body.content}
      citations={citations}
      assignHeadingId={assignHeadingId}
      headeredTextboxPresentation={narrative ? "section" : "card"}
      headeredTextboxHeadingLevel={headingLevel}
    />
  );
}

/**
 * Who the commentary is by: the quote's own author when it was written as one,
 * otherwise the article's first byline. The byline supplies the profile link
 * and avatar when its name is the same person.
 */
function resolveCommentaryAttribution(
  section: ArticleCommentarySectionModel,
  bylineAuthors: ArticleBylineAuthor[],
): { name: string; href?: string; avatarSrc?: string } | null {
  const name = section.attribution?.name ?? bylineAuthors[0]?.name;

  if (!name) {
    return null;
  }

  const author = bylineAuthors.find(
    (candidate) => candidate.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );

  return { name, href: author?.href, avatarSrc: author?.avatarSrc };
}

export function EffectIndexArticlePage({
  article,
  bylineAuthors = [],
  locale = "en",
  t,
}: EffectIndexArticlePageProps) {
  // A date is not a tag: it gets a `<time>` of its own, set in figures rather
  // than in the tracked-out caps a tag wears, so the row reads as "published
  // then, filed under these" instead of as one undifferentiated run of chips.
  const publishedDate = article.publicationDate ? new Date(article.publicationDate) : null;
  const publishedLabel =
    publishedDate && !Number.isNaN(publishedDate.getTime())
      ? new Intl.DateTimeFormat(formattingLocale(locale), {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(publishedDate)
      : null;
  const publishedDateTime = article.publicationDate?.slice(0, 10);

  const model = buildEffectIndexArticleModel(article);
  const tocNode =
    model.tocItems.length > 0 ? (
      <PublicTableOfContents items={model.tocItems} variant="bare" />
    ) : null;

  // One id assigner for the whole article, as on the effect page: section
  // wrapper ids are reserved up front, and every section's renderer draws from
  // the same sequence, so the rail's anchors are the ones the DOM carries.
  const assignHeadingId = createVCodeHeadingIdAssigner(model.sectionIds);

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout
        toc={tocNode}
        maxWidthClass="max-w-6xl"
        contentClassName="min-w-0 gap-10"
        className="theme-toc-strip-scope"
      >
        {/* Mobile/tablet TOC: sticky chip strip above the title, pinned under
            the site header from the very first scroll; replaced by the sticky
            gutter TOC at >=1200px. */}
        {tocNode ? <PublicTocStrip items={model.tocItems} /> : null}

        <div className="flex flex-col gap-4">
          {/* The effect page's title: one size ramp, the glyph hanging off the
              text run. An article's glyph is the archive's own. */}
          <div className="flex items-center gap-3">
            <Icon icon={icons.bookOpenText} size={32} className="theme-accent-heading shrink-0" />
            <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {article.title}
            </h1>
          </div>

          {article.shortDescription ? (
            <p className="theme-text-secondary type-reading-measure text-[1.0625rem] leading-7">
              {article.shortDescription}
            </p>
          ) : null}

          {publishedLabel || bylineAuthors.length > 0 || article.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {bylineAuthors.length > 0 ? (
                <p className="theme-text-muted type-detail-copy">
                  {t("by")}{" "}
                  {bylineAuthors.map((author, index) => (
                    <span key={author.key}>
                      {index > 0 ? (index === bylineAuthors.length - 1 ? ` ${t("and")} ` : ", ") : null}
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

        {model.sections.map((section) => {
          switch (section.kind) {
            case "overview":
              return (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <div className={OVERVIEW_PROSE_CLASS_NAME}>
                    <ArticleBody
                      body={section.body}
                      citations={article.citations}
                      assignHeadingId={assignHeadingId}
                      narrative
                      headingLevel={2}
                    />
                  </div>
                </section>
              );

            case "section":
              return (
                <ArticleSection
                  key={section.id}
                  id={section.id}
                  icon={section.icon}
                  heading={section.title}
                  spacing="effect"
                >
                  <div className={SECTION_PROSE_CLASS_NAME}>
                    <ArticleBody
                      body={section.body}
                      citations={article.citations}
                      assignHeadingId={assignHeadingId}
                      narrative
                    />
                  </div>
                </ArticleSection>
              );

            case "personalCommentary": {
              const attribution = resolveCommentaryAttribution(section, bylineAuthors);

              return (
                <ArticleSection
                  key={section.id}
                  id={section.id}
                  icon={section.icon}
                  heading={section.title}
                  spacing="effect"
                >
                  {/* Speech bubble: quiet chrome aside, not a content card.
                      Top-level quote chrome is unwrapped at the model level,
                      so the bubble is the only surface. */}
                  <div className="mt-6">
                    <CommentaryBubble>
                      <div
                        className={cn(
                          "effect-vcode-card-body prose prose-fuchsia max-w-none",
                          "theme-text-secondary text-[0.9375rem] leading-[1.75]",
                        )}
                      >
                        <ArticleBody
                          body={section.body}
                          citations={article.citations}
                          assignHeadingId={assignHeadingId}
                        />
                      </div>
                    </CommentaryBubble>
                  </div>

                  {attribution ? (
                    <PublicAttributionSection
                      className="-mt-3 pr-4"
                      avatarSrc={attribution.avatarSrc}
                      avatarAlt={attribution.name}
                      avatarHref={attribution.href}
                    >
                      {attribution.href ? (
                        <Link
                          href={attribution.href}
                          className="theme-accent-heading theme-focus-ring font-semibold transition hover:opacity-90"
                        >
                          {attribution.name}
                        </Link>
                      ) : (
                        <span className="theme-accent-heading font-semibold">{attribution.name}</span>
                      )}
                    </PublicAttributionSection>
                  ) : null}
                </ArticleSection>
              );
            }
          }
        })}

        <EffectCitationsSection citations={article.citations} />
      </StickyTocLayout>
    </main>
  );
}

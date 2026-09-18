import { Children, type ReactNode } from "react";
import { formatMessage, type Translate } from "@/i18n/messages";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { PublicAttributionSection } from "@/components/layout/PublicContentPrimitives";
import { GuideLinkLine } from "@/features/articles/components/GuideLinkLine";
import { ARTICLE_GUIDES_BY_CLASS } from "@/features/articles/domain/articleGuides";
import { VCodeRenderer } from "../vcode/VCodeRenderer";
import { createVCodeHeadingIdAssigner } from "../vcode/headings";
import type { ArtistCreditLinks } from "../vcode/artistCreditLinks";
import { CommentaryBubble } from "../components/CommentaryBubble";
import { EffectCitationsSection } from "../components/EffectCitationsSection";
import { AudioReplicationCard } from "../components/AudioReplicationCard";
import { EffectContributorsSection } from "../components/EffectContributorsSection";
import { RelatedSubstancesSection } from "../components/RelatedSubstancesSection";
import type { VCodeContent } from "../vcode/types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { resolveContributorHref, type ContributorDirectory } from "@server/contributorDirectory";
import { icons } from "@/utils/iconNames";
import {
  getEffectArticleTocItems,
  type EffectArticleModel,
  type EffectArticleRichSectionModel,
} from "../articleSectionModel";

interface EffectArticlePageProps {
  article: EffectArticleModel;
  replicationsSection?: ReactNode;
  headingActions?: ReactNode;
  drugHrefPrefix?: string;
  categoryHrefPrefix?: string;
  linkableSubstanceSlugs: readonly string[];
  linkableEffectSlugs: readonly string[];
  contributorDirectory?: ContributorDirectory;
  /** Credit-line destinations for replication images embedded in the body. */
  artistCreditLinks?: ArtistCreditLinks;
  /** Reuse article content inside an editor without a full-page shell or TOC. */
  embedded?: boolean;
  t?: Translate;
  sectionOverrides?: Partial<Record<EffectArticleModel["sections"][number]["kind"], ReactNode>>;
  commentaryAttribution?: ReactNode;
  toc?: ReactNode;
  tocStrip?: ReactNode;
  renderArtistCredit?: (artist: string) => ReactNode;
}

interface EffectArticleRichSectionProps {
  section: EffectArticleRichSectionModel;
  content: VCodeContent;
  className?: string;
  contentClassName?: string;
  assignHeadingId?: (text: string) => string | undefined;
  artistCreditLinks?: ArtistCreditLinks;
  t: Translate;
  renderArtistCredit?: (artist: string) => ReactNode;
}

function EffectArticleRichSection({
  section,
  content,
  className,
  contentClassName,
  assignHeadingId,
  artistCreditLinks,
  t,
  renderArtistCredit,
}: EffectArticleRichSectionProps) {
  if (!content) {
    return null;
  }

  return (
    <ArticleSection
      id={section.id}
      icon={section.icon ?? icons.subjectiveEffectIndex}
      heading={section.title ? t(section.title) : ""}
      spacing="effect"
      className={className}
    >
      <div className={contentClassName ?? "theme-text-secondary prose prose-fuchsia mt-6 max-w-none"}>
        <VCodeRenderer
          content={content}
          citations={section.citations}
          subarticles={section.subarticles}
          assignHeadingId={assignHeadingId}
          artistCreditLinks={artistCreditLinks}
          renderArtistCredit={renderArtistCredit}
        />
      </div>
    </ArticleSection>
  );
}

export function EffectCommentaryAttribution({
  attribution,
  contributorDirectory = [],
}: {
  attribution: NonNullable<EffectArticleRichSectionModel["attribution"]>;
  contributorDirectory?: ContributorDirectory;
}) {
  const href = resolveContributorHref(attribution.name, contributorDirectory);
  return (
    <PublicAttributionSection
      className="-mt-3 pr-4"
      avatarSrc={attribution.avatarSrc}
      avatarAlt={attribution.name}
      avatarHref={href ?? undefined}
    >
      {href ? (
        <Link href={href} className="theme-accent-heading theme-focus-ring font-semibold transition hover:opacity-90">
          {attribution.name}
        </Link>
      ) : (
        <span className="theme-accent-heading font-semibold">{attribution.name}</span>
      )}
      {attribution.era ? <span className="ml-1.5 whitespace-nowrap">{attribution.era}</span> : null}
    </PublicAttributionSection>
  );
}

/**
 * Full effect article page.
 *
 * Displays a subjective effect article with all sections from EffectIndex.
 */
export function EffectArticlePage({
  article,
  replicationsSection,
  headingActions,
  drugHrefPrefix,
  categoryHrefPrefix,
  linkableSubstanceSlugs,
  linkableEffectSlugs,
  contributorDirectory = [],
  artistCreditLinks,
  embedded = false,
  t = formatMessage,
  sectionOverrides,
  commentaryAttribution,
  toc,
  tocStrip,
  renderArtistCredit,
}: EffectArticlePageProps) {
  const normalizedReplicationsSection = replicationsSection
    ? Children.toArray(replicationsSection)
    : null;

  const tocItems = getEffectArticleTocItems(article).map((item) => ({
    ...item,
    label: t(item.label),
  }));
  const tocNode = toc ?? (
    tocItems.length > 1 ? <PublicTableOfContents items={tocItems} variant="bare" /> : null
  );

  /**
   * One id assigner for the whole article, so subsection headings are
   * deep-linkable (`#style-variations-2`-safe) across every section's own
   * renderer instance. Section wrapper ids are reserved up front: a body
   * heading titled like its section gets a suffix instead of a duplicate id.
   */
  const assignHeadingId = createVCodeHeadingIdAssigner(
    article.sections.map((section) => section.id),
  );

  const content = (
    <>
        {/* Mobile/tablet TOC: sticky chip strip above the title, pinned under
            the site header from the very first scroll; replaced by the sticky
            gutter TOC at >=1200px. */}
        {!embedded && tocNode ? (tocStrip ?? <PublicTocStrip items={tocItems} />) : null}

        <div className="flex items-center gap-3">
          <Icon icon={article.hero.icon} size={32} className="theme-accent-heading shrink-0" />
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {article.hero.name}
          </h1>
          {headingActions}
        </div>
        {article.hero.summary ? <p className="theme-text-secondary type-reading-measure text-[1.0625rem] leading-7">{article.hero.summary}</p> : null}

        {article.sections.map((section) => {
          if (sectionOverrides && section.kind in sectionOverrides) {
            return <div key={section.id} className="contents">{sectionOverrides[section.kind]}</div>;
          }
          switch (section.kind) {
            case "overview":
              return (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <div className="theme-text-secondary prose prose-fuchsia max-w-none overflow-hidden text-[1.0625rem] leading-7">
                    <VCodeRenderer
                      content={section.content}
                      citations={section.citations}
                      subarticles={section.subarticles}
                      artistCreditLinks={artistCreditLinks}
                      renderArtistCredit={renderArtistCredit}
                      assignHeadingId={assignHeadingId}
                    />
                  </div>
                  {/* The scale grades this whole family of effects. A guide to
                      one substance belongs on that substance's page, not here. */}
                  {article.hero.guideClass ? (
                    <GuideLinkLine
                      className="mt-5"
                      scale={ARTICLE_GUIDES_BY_CLASS[article.hero.guideClass].scale}
                    />
                  ) : null}
                </section>
              );

            case "analysis":
            case "styleVariations":
              return (
                <EffectArticleRichSection
                  key={section.id}
                  section={section}
                  content={section.content}
                  assignHeadingId={assignHeadingId}
                  artistCreditLinks={artistCreditLinks}
                  t={t}
                  renderArtistCredit={renderArtistCredit}
                />
              );

            case "replications":
              return normalizedReplicationsSection ?? (
                <ArticleSection
                  key={section.id}
                  id={section.id}
                  icon={section.icon}
                  heading={t(section.title)}
                  spacing="effect"
                >
                  {/* The streamed server section normally replaces this whole
                      branch. Without it the section keeps its heading and
                      spacing but stages nothing — the same footprint the
                      empty client gallery used to leave. */}
                  <div className="mt-6" />
                </ArticleSection>
              );

            case "audioReplications":
              return (
                <ArticleSection
                  key={section.id}
                  id={section.id}
                  icon={section.icon}
                  heading={t(section.title)}
                  spacing="effect"
                >
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {section.items.map((audio, index) => (
                      <AudioReplicationCard key={`${audio.title}-${index}`} audio={audio} />
                    ))}
                  </div>
                </ArticleSection>
              );

            case "personalCommentary":
              return (
                <ArticleSection
                  key={section.id}
                  id={section.id}
                  icon={section.icon ?? "lucide:quote"}
                  heading={section.title ? t(section.title) : t("Personal Commentary")}
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
                        <VCodeRenderer
                          content={section.content}
                          citations={section.citations}
                          subarticles={section.subarticles}
                          artistCreditLinks={artistCreditLinks}
                          renderArtistCredit={renderArtistCredit}
                          assignHeadingId={assignHeadingId}
                        />
                      </div>
                    </CommentaryBubble>
                  </div>

                  {commentaryAttribution ?? (section.attribution ? (
                    <EffectCommentaryAttribution attribution={section.attribution} contributorDirectory={contributorDirectory} />
                  ) : null)}
                </ArticleSection>
              );

            case "relatedSubstances":
              return (
                <ArticleSection
                  key={section.id}
                  id={section.id}
                  icon={section.icon}
                  heading={t(section.title)}
                  spacing="effect"
                >
                  <div className="mt-6">
                    <RelatedSubstancesSection
                      groups={section.groups}
                      total={section.total}
                      drugHrefPrefix={drugHrefPrefix}
                      linkableSubstanceSlugs={linkableSubstanceSlugs}
                      categoryHrefPrefix={categoryHrefPrefix}
                      showHeading={false}
                      t={t}
                    />
                  </div>
                </ArticleSection>
              );

            case "sources":
              return (
                <EffectCitationsSection
                  key={section.id}
                  id={section.id}
                  citations={section.citations}
                  externalLinks={section.externalLinks}
                  seeAlso={section.seeAlso}
                  linkableEffectSlugs={linkableEffectSlugs}
                />
              );

            case "contributors":
              return (
                <div key={section.id} id={section.id} className="scroll-mt-24">
                  <EffectContributorsSection
                    contributors={section.contributors}
                    contributorDirectory={contributorDirectory}
                    t={t}
                  />
                </div>
              );
          }
        })}
    </>
  );
  return embedded ? (
    <div className="min-w-0 space-y-10 [overflow-wrap:anywhere]">{content}</div>
  ) : (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout toc={tocNode} contentClassName="gap-10" className="theme-toc-strip-scope">{content}</StickyTocLayout>
    </main>
  );
}

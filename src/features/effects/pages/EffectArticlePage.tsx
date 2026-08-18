import { Children, type ReactNode } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { PublicAttributionSection } from "@/components/layout/PublicContentPrimitives";
import { VCodeRenderer } from "../vcode/VCodeRenderer";
import { createVCodeHeadingIdAssigner } from "../vcode/headings";
import { CommentaryBubble } from "../components/CommentaryBubble";
import { EffectCitationsSection } from "../components/EffectCitationsSection";
import { AudioReplicationCard } from "../components/AudioReplicationCard";
import { EffectContributorsSection } from "../components/EffectContributorsSection";
import { RelatedSubstancesSection } from "../components/RelatedSubstancesSection";
import { ReplicationGallery } from "../components/ReplicationGallery";
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
  drugHrefPrefix?: string;
  categoryHrefPrefix?: string;
  linkableSubstanceSlugs: readonly string[];
  linkableEffectSlugs: readonly string[];
  contributorDirectory?: ContributorDirectory;
}

interface EffectArticleRichSectionProps {
  section: EffectArticleRichSectionModel;
  content: VCodeContent;
  className?: string;
  contentClassName?: string;
  assignHeadingId?: (text: string) => string | undefined;
}

function EffectArticleRichSection({
  section,
  content,
  className,
  contentClassName,
  assignHeadingId,
}: EffectArticleRichSectionProps) {
  if (!content) {
    return null;
  }

  return (
    <ArticleSection
      id={section.id}
      icon={section.icon ?? icons.subjectiveEffectIndex}
      heading={section.title ?? ""}
      spacing="effect"
      className={className}
    >
      <div className={contentClassName ?? "theme-text-secondary prose prose-invert prose-fuchsia prose-a:font-normal mt-6 max-w-none"}>
        <VCodeRenderer
          content={content}
          citations={section.citations}
          subarticles={section.subarticles}
          assignHeadingId={assignHeadingId}
        />
      </div>
    </ArticleSection>
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
  drugHrefPrefix,
  categoryHrefPrefix,
  linkableSubstanceSlugs,
  linkableEffectSlugs,
  contributorDirectory = [],
}: EffectArticlePageProps) {
  const normalizedReplicationsSection = replicationsSection
    ? Children.toArray(replicationsSection)
    : null;

  const tocItems = getEffectArticleTocItems(article);
  const tocNode =
    tocItems.length > 1 ? <PublicTableOfContents items={tocItems} variant="bare" /> : null;

  /**
   * One id assigner for the whole article, so subsection headings are
   * deep-linkable (`#style-variations-2`-safe) across every section's own
   * renderer instance. Section wrapper ids are reserved up front: a body
   * heading titled like its section gets a suffix instead of a duplicate id.
   */
  const assignHeadingId = createVCodeHeadingIdAssigner(
    article.sections.map((section) => section.id),
  );

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout toc={tocNode} contentClassName="gap-10" className="theme-toc-strip-scope">
        {/* Mobile/tablet TOC: sticky chip strip above the title, pinned under
            the site header from the very first scroll; replaced by the sticky
            gutter TOC at >=1200px. */}
        {tocNode ? <PublicTocStrip items={tocItems} /> : null}

        <div className="flex items-center gap-3">
          <Icon icon={article.hero.icon} size={32} className="theme-accent-heading shrink-0" />
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {article.hero.name}
          </h1>
        </div>

        {article.sections.map((section) => {
          switch (section.kind) {
            case "overview":
              return (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <div className="theme-text-secondary prose prose-invert prose-fuchsia prose-a:font-normal max-w-none overflow-hidden text-[1.0625rem] leading-7">
                    <VCodeRenderer
                      content={section.content}
                      citations={section.citations}
                      subarticles={section.subarticles}
                      assignHeadingId={assignHeadingId}
                    />
                  </div>
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
                />
              );

            case "replications":
              return normalizedReplicationsSection ?? (
                <ArticleSection
                  key={section.id}
                  id={section.id}
                  icon={section.icon}
                  heading={section.title}
                  spacing="effect"
                >
                  <div className="mt-6">
                    <ReplicationGallery galleryOrder={section.state.galleryOrder} replications={[]} />
                  </div>
                </ArticleSection>
              );

            case "audioReplications":
              return (
                <ArticleSection
                  key={section.id}
                  id={section.id}
                  icon={section.icon}
                  heading={section.title}
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
                  heading={section.title ?? "Personal Commentary"}
                  spacing="effect"
                >

                  {/* Speech bubble: quiet chrome aside, not a content card.
                      Top-level quote chrome is unwrapped at the model level,
                      so the bubble is the only surface. */}
                  <div className="mt-6">
                    <CommentaryBubble>
                      <div
                        className={cn(
                          "effect-vcode-card-body prose prose-invert prose-fuchsia prose-a:font-normal max-w-none",
                          "theme-text-secondary text-[0.9375rem] leading-[1.75]",
                        )}
                      >
                        <VCodeRenderer
                          content={section.content}
                          citations={section.citations}
                          subarticles={section.subarticles}
                          assignHeadingId={assignHeadingId}
                        />
                      </div>
                    </CommentaryBubble>
                  </div>

                  {section.attribution ? (
                    (() => {
                      const contributorHref = resolveContributorHref(
                        section.attribution.name,
                        contributorDirectory,
                      );

                      return (
                        <PublicAttributionSection
                          className="-mt-3 pr-4"
                          avatarSrc={section.attribution.avatarSrc}
                          avatarAlt={section.attribution.name}
                          avatarHref={contributorHref ?? undefined}
                        >
                          {contributorHref ? (
                            <Link
                              href={contributorHref}
                              className="theme-accent-heading theme-focus-ring font-semibold transition hover:opacity-90"
                            >
                              {section.attribution.name}
                            </Link>
                          ) : (
                            <span className="theme-accent-heading font-semibold">
                              {section.attribution.name}
                            </span>
                          )}
                          {section.attribution.era ? (
                            <span className="ml-1.5 whitespace-nowrap">
                              {section.attribution.era}
                            </span>
                          ) : null}
                        </PublicAttributionSection>
                      );
                    })()
                  ) : null}
                </ArticleSection>
              );

            case "relatedSubstances":
              return (
                <ArticleSection
                  key={section.id}
                  id={section.id}
                  icon={section.icon}
                  heading={section.title}
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
                  />
                </div>
              );
          }
        })}
      </StickyTocLayout>
    </main>
  );
}

import { Children, type ReactNode } from "react";
import {
  ArticleSection,
  ArticleSubsectionCard,
} from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { PublicAttributionSection } from "@/components/layout/PublicContentPrimitives";
import { VCodeRenderer } from "../vcode/VCodeRenderer";
import { CommentaryBubble } from "../components/CommentaryBubble";
import { EffectCitationsSection } from "../components/EffectCitationsSection";
import { EffectContributorsSection } from "../components/EffectContributorsSection";
import { RelatedSubstancesSection } from "../components/RelatedSubstancesSection";
import { ReplicationGallery } from "../components/ReplicationGallery";
import type { VCodeContent } from "../vcode/types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { getContributorPath } from "@/utils/contributors";
import { icons } from "@/utils/iconNames";
import type { AudioReplicationMetadata } from "@/types/replications";
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
}

interface EffectArticleRichSectionProps {
  section: EffectArticleRichSectionModel;
  content: VCodeContent;
  className?: string;
  contentClassName?: string;
}

const REPLICATION_RIGHTS_LABELS: Record<string, string> = {
  "creator-retained": "Rights remain with the creator or rightsholder.",
  "explicit-license": "Reuse follows the item-specific license.",
  unknown: "Reuse terms are unknown; contact the creator or rightsholder before reuse.",
  "permission-granted": "Displayed with permission; reuse still depends on the creator or rightsholder.",
  "public-domain": "Marked as public domain.",
};

function hasKnownCreator(artist?: string | null) {
  return Boolean(artist && artist.trim() && artist.trim().toLowerCase() !== "unknown");
}

function getAudioCreditLine(audio: AudioReplicationMetadata) {
  if (audio.credit_line) {
    return audio.credit_line;
  }

  return hasKnownCreator(audio.artist)
    ? `${audio.title} by ${audio.artist}`
    : `${audio.title} (creator unknown)`;
}

function getAudioRightsLabel(audio: AudioReplicationMetadata) {
  if (audio.license_name) {
    return `License: ${audio.license_name}.`;
  }

  return REPLICATION_RIGHTS_LABELS[audio.rights_status ?? "creator-retained"];
}

function EffectArticleRichSection({
  section,
  content,
  className,
  contentClassName,
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
}: EffectArticlePageProps) {
  const normalizedReplicationsSection = replicationsSection
    ? Children.toArray(replicationsSection)
    : null;

  const tocItems = getEffectArticleTocItems(article);
  const tocNode =
    tocItems.length > 1 ? <PublicTableOfContents items={tocItems} variant="bare" /> : null;

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout toc={tocNode} contentClassName="gap-10">
        <div className="flex items-center gap-3">
          <Icon icon={article.hero.icon} size={32} className="theme-accent-heading shrink-0" />
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {article.hero.name}
          </h1>
        </div>

        {/* Inline TOC for mobile/tablet; replaced by the sticky gutter TOC at >=1200px. */}
        {tocNode ? (
          <div className="min-[1200px]:hidden">
            <PublicTableOfContents items={tocItems} />
          </div>
        ) : null}

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
                      <ArticleSubsectionCard
                        key={`${audio.title}-${index}`}
                        padding="sm"
                        variant="interactive"
                        className="group"
                      >
                        <div className="mb-3 flex flex-col gap-1">
                          <span className="theme-text-primary truncate text-sm font-semibold">
                            {audio.title}
                          </span>
                          <span className="theme-text-faint text-[10px] font-semibold uppercase tracking-[0.22em]">
                            {getAudioCreditLine(audio)}
                          </span>
                        </div>
                        <audio
                          controls
                          className="h-8 w-full opacity-80 transition group-hover:opacity-100"
                          preload="metadata"
                        >
                          <source src={audio.resource} />
                          <track kind="captions" />
                        </audio>
                        <p className="theme-text-faint mt-3 text-xs leading-5">
                          {getAudioRightsLabel(audio)}
                        </p>
                        {audio.artist_url || audio.source_url || audio.license_url ? (
                          <div className="mt-2 flex flex-wrap gap-3 text-xs">
                            {audio.artist_url ? (
                              <a
                                href={audio.artist_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Creator
                              </a>
                            ) : null}
                            {audio.source_url ? (
                              <a
                                href={audio.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Source
                              </a>
                            ) : null}
                            {audio.license_url ? (
                              <a
                                href={audio.license_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                License
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </ArticleSubsectionCard>
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

                  {/* Speech bubble: quiet chrome aside, not a content card */}
                  <div className="relative mt-6">
                    <CommentaryBubble>
                      <div className={cn(
                        "effect-vcode-card-body prose prose-invert prose-fuchsia prose-a:font-normal max-w-none",
                        "theme-text-secondary text-[0.9375rem] leading-[1.75]",
                        // Suppress inner Quote chrome: the bubble is the container
                        // and the avatar handles attribution.
                        "prose-blockquote:border-0 prose-blockquote:bg-transparent prose-blockquote:p-0 prose-blockquote:my-0 prose-blockquote:rounded-none",
                        "[&_blockquote_div]:not-italic [&_blockquote_footer]:hidden",
                      )}>
                        <VCodeRenderer
                          content={section.content}
                          citations={section.citations}
                          subarticles={section.subarticles}
                        />
                      </div>
                    </CommentaryBubble>

                    {/* Speech bubble tail pointing toward avatar */}
                    <div className="flex justify-end pr-10">
                      <div
                        className="theme-aside-panel -mt-[1px] h-3 w-3 [box-shadow:none]"
                        style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
                      />
                    </div>
                  </div>

                  {section.attribution ? (
                    <PublicAttributionSection
                      className="-mt-3 pr-4"
                      avatarSrc={section.attribution.avatarSrc}
                      avatarAlt={section.attribution.name}
                      avatarHref={getContributorPath(section.attribution.name)}
                    >
                      <Link
                        href={getContributorPath(section.attribution.name)}
                        className="theme-accent-heading font-semibold transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                      >
                        {section.attribution.name}
                      </Link>
                    </PublicAttributionSection>
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
                />
              );

            case "contributors":
              return (
                <div key={section.id} id={section.id} className="scroll-mt-24">
                  <EffectContributorsSection contributors={section.contributors} />
                </div>
              );
          }
        })}
      </StickyTocLayout>
    </main>
  );
}

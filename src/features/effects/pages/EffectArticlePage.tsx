import { Children, type ReactNode } from "react";
import {
  ArticleSection,
  ArticleSubsectionCard,
} from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { PublicAttributionSection } from "@/components/layout/PublicContentPrimitives";
import { VCodeRenderer } from "../vcode/VCodeRenderer";
import { EffectCitationsSection } from "../components/EffectCitationsSection";
import { EffectContributorsSection } from "../components/EffectContributorsSection";
import { RelatedSubstancesSection } from "../components/RelatedSubstancesSection";
import { ReplicationGallery } from "../components/ReplicationGallery";
import type { VCodeContent } from "../vcode/types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { getContributorPath } from "@/utils/contributors";
import type { EffectArticleModel, EffectArticleRichSectionModel } from "../articleSectionModel";

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
      icon={section.icon ?? "lucide:sparkles"}
      heading={section.title ?? ""}
      spacing="effect"
      className={className}
    >
      <div className={contentClassName ?? "prose prose-invert prose-fuchsia prose-a:font-normal mt-6 max-w-none text-white/85"}>
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

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <div className="mx-auto max-w-4xl space-y-10 px-4 pb-16 pt-8 md:px-8">
        <div className="flex items-center gap-3">
          <Icon icon={article.hero.icon} size={32} className="shrink-0 text-fuchsia-300" />
          <h1 className="font-display text-3xl font-bold tracking-tight text-fuchsia-300 sm:text-4xl">
            {article.hero.name}
          </h1>
        </div>

        {article.sections.map((section) => {
          switch (section.kind) {
            case "overview":
              return (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <div className="prose prose-invert prose-fuchsia prose-a:font-normal max-w-none overflow-hidden text-[1.0625rem] leading-7 text-white/82">
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
                  <ArticleSubsectionCard padding="sm" variant="nested">
                    <ReplicationGallery galleryOrder={section.state.galleryOrder} replications={[]} />
                  </ArticleSubsectionCard>
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
                          <span className="theme-text-primary text-sm font-semibold truncate">{audio.title}</span>
                          <span className="theme-text-faint text-[10px] font-semibold uppercase tracking-[0.22em]">
                            by {audio.artist}
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

                  {/* Speech bubble card */}
                  <div className="relative">
                    <ArticleSubsectionCard
                      variant="nested"
                      padding="none"
                      className="px-5 py-5 sm:px-6"
                    >
                      <div className={cn(
                        "effect-vcode-card-body prose prose-invert prose-fuchsia prose-a:font-normal max-w-none",
                        "text-lg italic leading-relaxed text-white/80",
                        // Suppress inner Quote borders & footers: avatar handles attribution.
                        "prose-blockquote:border-0 prose-blockquote:pl-0 prose-blockquote:my-0",
                        "[&_blockquote_footer]:hidden",
                      )}>
                        <VCodeRenderer
                          content={section.content}
                          citations={section.citations}
                          subarticles={section.subarticles}
                        />
                      </div>
                    </ArticleSubsectionCard>

                    {/* Speech bubble tail pointing toward avatar */}
                    <div className="flex justify-end pr-10">
                      <div
                        className="h-3 w-3 -mt-[1px] bg-white/5 ring-1 ring-white/5"
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
                <div key={section.id} id={section.id}>
                  <EffectContributorsSection contributors={section.contributors} />
                </div>
              );
          }
        })}
      </div>
    </main>
  );
}

import { Children, type ReactNode } from "react";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import { VCodeRenderer } from "../vcode/VCodeRenderer";
import { EffectCitationsSection } from "../components/EffectCitationsSection";
import { EffectContributorsSection } from "../components/EffectContributorsSection";
import { RelatedSubstancesSection } from "../components/RelatedSubstancesSection";
import { ReplicationGallery } from "../components/ReplicationGallery";
import type { VCodeContent } from "../vcode/types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { AppImage } from "@/components/common/AppImage";
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
    <section id={section.id} className={cn("scroll-mt-24 space-y-6", className)}>
      <SectionHeader icon={section.icon ?? "lucide:sparkles"} title={section.title ?? ""} />
      <div className={contentClassName ?? "prose prose-invert prose-fuchsia prose-a:font-normal mt-6 max-w-none text-white/85"}>
        <VCodeRenderer
          content={content}
          citations={section.citations}
          subarticles={section.subarticles}
        />
      </div>
    </section>
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
                <section key={section.id} id={section.id} className="scroll-mt-24 space-y-6">
                  <SectionHeader icon={section.icon} title={section.title} />
                  <div className="mt-6 rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
                    <ReplicationGallery galleryOrder={section.state.galleryOrder} replications={[]} />
                  </div>
                </section>
              );

            case "audioReplications":
              return (
                <section key={section.id} id={section.id} className="scroll-mt-24 space-y-6">
                  <SectionHeader icon={section.icon} title={section.title} />
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {section.items.map((audio, index) => (
                      <div
                        key={`${audio.title}-${index}`}
                        className="group rounded-xl ring-1 ring-white/5 bg-white/5 p-4 transition hover:bg-white/8 hover:ring-white/10"
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
                      </div>
                    ))}
                  </div>
                </section>
              );

            case "personalCommentary":
              return (
                <section key={section.id} id={section.id} className="scroll-mt-24 space-y-6">
                  <SectionHeader icon={section.icon ?? "lucide:quote"} title={section.title ?? "Personal Commentary"} />

                  {/* Speech bubble card */}
                  <div className="relative">
                    <div className="rounded-xl ring-1 ring-white/5 bg-white/5 px-5 py-5 sm:px-6">
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
                    </div>

                    {/* Speech bubble tail pointing toward avatar */}
                    <div className="flex justify-end pr-10">
                      <div
                        className="h-3 w-3 -mt-[1px] bg-white/5 ring-1 ring-white/5"
                        style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
                      />
                    </div>
                  </div>

                  {section.attribution ? (
                    <div className="-mt-3 flex items-center justify-end gap-2.5 pr-4">
                      <Link
                        href={getContributorPath(section.attribution.name)}
                        className="group flex items-center gap-2.5 transition"
                      >
                        <AppImage
                          src={section.attribution.avatarSrc}
                          alt={section.attribution.name}
                          width={32}
                          height={32}
                          className="h-8 w-8 rounded-full object-cover ring-1 ring-white/20 transition group-hover:ring-fuchsia-400/50"
                        />
                        <span className="text-xs font-semibold text-white/60 transition group-hover:text-fuchsia-300">
                          {section.attribution.name}
                        </span>
                      </Link>
                    </div>
                  ) : null}
                </section>
              );

            case "relatedSubstances":
              return (
                <section key={section.id} id={section.id} className="scroll-mt-24 space-y-6">
                  <SectionHeader icon={section.icon} title={section.title} />
                  <div className="mt-6">
                    <RelatedSubstancesSection
                      groups={section.groups}
                      total={section.total}
                      drugHrefPrefix={drugHrefPrefix}
                      categoryHrefPrefix={categoryHrefPrefix}
                      showHeading={false}
                    />
                  </div>
                </section>
              );

            case "sources":
              return (
                <div key={section.id} id={section.id}>
                  <EffectCitationsSection
                    citations={section.citations}
                    externalLinks={section.externalLinks}
                    seeAlso={section.seeAlso}
                  />
                </div>
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

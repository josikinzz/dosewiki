"use client";

import type { ReactNode } from "react";
import type { IconName } from "@/components/common/Icon";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { SectionHeader } from "@/components/common/SectionHeader";
import { VCodeRenderer } from "../vcode/VCodeRenderer";
import { EffectHero } from "../components/EffectHero";
import { EffectCitationsSection } from "../components/EffectCitationsSection";
import { EffectContributorsSection } from "../components/EffectContributorsSection";
import { RelatedSubstancesSection } from "../components/RelatedSubstancesSection";
import { ReplicationGallery } from "../components/ReplicationGallery";
import type { EffectDetail } from "@/data/builders/library";
import type { VCodeContent } from "../vcode/types";
import { cn } from "@/lib/utils";

/**
 * Subjective effect article from Convex.
 */
export interface SubjectiveEffectArticle {
  slug: string;
  name: string;
  tags: string[];
  featured?: boolean;
  summary: string;
  description_raw: string;
  description_ast?: unknown;
  long_summary_raw?: string;
  long_summary_ast?: unknown;
  analysis_raw?: string;
  analysis_ast?: unknown;
  style_variations_raw?: string;
  style_variations_ast?: unknown;
  personal_commentary_raw?: string;
  personal_commentary_ast?: unknown;
  social_media_image?: string;
  gallery_order?: string[];
  audio_replications?: Array<{ title: string; artist: string; resource: string }>;
  see_also?: Array<{ location: string; title: string }>;
  external_links?: Array<{ url: string; title: string }>;
  citations?: Array<{ url: string; text: string; from?: string }>;
  subarticles?: Array<{ id: string; title: string }>;
  contributors?: string[];
}

interface EffectArticlePageProps {
  effect: SubjectiveEffectArticle;
  effectDetail?: EffectDetail;
  replicationsSection?: ReactNode;
  onNavigate?: (path: string) => void;
  drugHrefPrefix?: string;
  categoryHrefPrefix?: string;
  onSelectDrug?: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
}

interface EffectArticleRichSectionProps {
  id: string;
  title: string;
  icon: IconName;
  content: VCodeContent;
  citations?: SubjectiveEffectArticle["citations"];
  subarticles?: SubjectiveEffectArticle["subarticles"];
  onNavigate?: (path: string) => void;
  className?: string;
  contentClassName?: string;
}

function EffectArticleRichSection({
  id,
  title,
  icon,
  content,
  citations,
  subarticles,
  onNavigate,
  className,
  contentClassName,
}: EffectArticleRichSectionProps) {
  if (!content) {
    return null;
  }

  return (
    <section id={id} className={cn("scroll-mt-24 space-y-6", className)}>
      <SectionHeader icon={icon} title={title} />
      <div className={contentClassName ?? "prose prose-invert prose-fuchsia mt-6 max-w-none text-white/85"}>
        <VCodeRenderer
          content={content}
          onNavigate={onNavigate}
          citations={citations}
          subarticles={subarticles}
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
  effect,
  effectDetail,
  replicationsSection,
  onNavigate,
  drugHrefPrefix,
  categoryHrefPrefix,
  onSelectDrug,
  onSelectCategory,
}: EffectArticlePageProps) {
  const relatedSubstances = effectDetail
    ? { groups: effectDetail.groups, total: effectDetail.definition.total }
    : undefined;

  const descriptionContent = (effect.description_ast || effect.description_raw) as VCodeContent;
  const analysisContent = (effect.analysis_ast || effect.analysis_raw) as VCodeContent | undefined;
  const styleVariationsContent = (effect.style_variations_ast || effect.style_variations_raw) as VCodeContent | undefined;
  const personalCommentaryContent = (effect.personal_commentary_ast || effect.personal_commentary_raw) as VCodeContent | undefined;
  const hasGallery = Boolean(effect.gallery_order?.length);
  const hasAudioReplications = Boolean(effect.audio_replications?.length);
  const hasRelatedSubstances = Boolean(relatedSubstances && relatedSubstances.groups.length > 0);
  const hasSources = Boolean(
    effect.citations?.length || effect.external_links?.length || effect.see_also?.length,
  );
  const hasContributors = Boolean(effect.contributors?.length);

  const tocItems = [
    descriptionContent
      ? { id: "overview", label: "Overview", icon: "lucide:book-open-text" as const }
      : null,
    analysisContent
      ? { id: "analysis", label: "Analysis", icon: "lucide:microscope" as const }
      : null,
    styleVariationsContent
      ? { id: "style-variations", label: "Style Variations", icon: "lucide:palette" as const }
      : null,
    hasGallery
      ? { id: "replications", label: "Replications", icon: "lucide:image" as const }
      : null,
    hasAudioReplications
      ? { id: "audio-replications", label: "Audio Replications", icon: "lucide:volume-2" as const }
      : null,
    personalCommentaryContent
      ? { id: "commentary", label: "Insight & Commentary", icon: "lucide:quote" as const }
      : null,
    hasRelatedSubstances
      ? { id: "related-substances", label: "Related Substances", icon: "lucide:flask-conical" as const, tone: "accent" as const }
      : null,
    hasSources
      ? { id: "sources", label: "Sources & References", icon: "lucide:library" as const }
      : null,
    hasContributors
      ? { id: "contributors", label: "Contributors", icon: "lucide:users" as const }
      : null,
  ].filter(Boolean) as PublicTableOfContentsItem[];

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <div className="mx-auto max-w-4xl space-y-10 px-4 pb-16 pt-8 md:px-8">
        <EffectHero name={effect.name} tags={effect.tags} summary={effect.summary} />

        <PublicTableOfContents items={tocItems} />

        <EffectArticleRichSection
          id="overview"
          title="Overview"
          icon="lucide:book-open-text"
          content={descriptionContent}
          citations={effect.citations}
          subarticles={effect.subarticles}
          onNavigate={onNavigate}
          contentClassName="prose prose-invert prose-fuchsia mt-6 max-w-none overflow-hidden text-[1.0625rem] leading-7 text-white/82"
        />

        <EffectArticleRichSection
          id="analysis"
          title="Analysis"
          icon="lucide:microscope"
          content={analysisContent}
          citations={effect.citations}
          subarticles={effect.subarticles}
          onNavigate={onNavigate}
        />

        <EffectArticleRichSection
          id="style-variations"
          title="Style Variations"
          icon="lucide:palette"
          content={styleVariationsContent}
          citations={effect.citations}
          subarticles={effect.subarticles}
          onNavigate={onNavigate}
        />

        {hasGallery ? (
          replicationsSection ?? (
            <section id="replications" className="scroll-mt-24 space-y-6">
              <SectionHeader icon="lucide:image" title="Replications" />
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 ring-1 ring-white/5 sm:p-6">
                <ReplicationGallery galleryOrder={effect.gallery_order} replications={[]} />
              </div>
            </section>
          )
        ) : null}

        {hasAudioReplications ? (
          <section id="audio-replications" className="scroll-mt-24 space-y-6">
            <SectionHeader icon="lucide:volume-2" title="Audio Replications" />
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {effect.audio_replications?.map((audio, index) => (
                <div
                  key={`${audio.title}-${index}`}
                  className="theme-public-card-subtle group rounded-xl border p-4 transition hover:border-[color:var(--theme-card-border-strong)] hover:bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_76%,transparent)]"
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
        ) : null}

        <EffectArticleRichSection
          id="commentary"
          title="Insight & Commentary"
          icon="lucide:quote"
          content={personalCommentaryContent}
          citations={effect.citations}
          subarticles={effect.subarticles}
          onNavigate={onNavigate}
          className="border-l border-fuchsia-400/20 pl-5 sm:pl-6"
          contentClassName="prose prose-invert prose-fuchsia mt-6 max-w-none text-lg italic leading-relaxed text-white/85"
        />

        {hasRelatedSubstances ? (
          <section id="related-substances" className="scroll-mt-24 space-y-6">
            <SectionHeader icon="lucide:flask-conical" title="Related Substances" />
            <div className="mt-6">
              <RelatedSubstancesSection
                groups={relatedSubstances.groups}
                total={relatedSubstances.total}
                drugHrefPrefix={drugHrefPrefix}
                categoryHrefPrefix={categoryHrefPrefix}
                onSelectDrug={onSelectDrug}
                onSelectCategory={onSelectCategory}
                showHeading={false}
              />
            </div>
          </section>
        ) : null}

        {hasSources ? (
          <div id="sources">
            <EffectCitationsSection
              citations={effect.citations}
              externalLinks={effect.external_links}
              seeAlso={effect.see_also}
              onNavigate={onNavigate}
            />
          </div>
        ) : null}

        {hasContributors ? (
          <div id="contributors">
            <EffectContributorsSection contributors={effect.contributors ?? []} onNavigate={onNavigate} />
          </div>
        ) : null}
      </div>
    </main>
  );
}

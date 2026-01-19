import { Icon } from "../common/Icon";
import { IconBadge } from "../common/IconBadge";
import { SectionCard } from "../common/SectionCard";
import { Button } from "../ui/button";
import { VCodeRenderer } from "../vcode";
import {
  EffectHero,
  EffectCitationsSection,
  EffectContributorsSection,
  RelatedSubstancesSection,
  ReplicationGallery,
} from "../effects";
import { useSubjectiveEffect } from "../../hooks/useSubjectiveEffects";
import type { DosageCategoryGroup } from "../../data/builders/library";
import type { EffectDetail } from "../../data/builders/library";

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
  effectSlug: string;
  getEffectDetail: (slug: string) => EffectDetail | undefined;
  onNavigate: (path: string) => void;
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
}

/**
 * Full effect article page.
 *
 * Displays a subjective effect article with all sections from EffectIndex.
 */
export function EffectArticlePage({
  effectSlug,
  getEffectDetail,
  onNavigate,
  onSelectDrug,
  onSelectCategory,
}: EffectArticlePageProps) {
  // Fetch effect from Convex at route level
  const { effect, isLoading } = useSubjectiveEffect(effectSlug);

  // Get related substances from library
  const libraryDetail = getEffectDetail(effectSlug);
  const relatedSubstances = libraryDetail
    ? { groups: libraryDetail.groups, total: libraryDetail.definition.total }
    : undefined;

  // Show loading state while fetching
  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  // Show not found if effect doesn't exist
  if (!effect) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
          <p className="text-lg font-semibold text-white">Effect not found.</p>
          <p className="mt-2 text-sm text-white/70">
            Browse the effects catalog to choose another entry.
          </p>
        </div>
      </main>
    );
  }

  // Prefer AST content, fall back to raw
  const descriptionContent = effect.description_ast || effect.description_raw;
  const analysisContent = effect.analysis_ast || effect.analysis_raw;
  const styleVariationsContent = effect.style_variations_ast || effect.style_variations_raw;
  const personalCommentaryContent = effect.personal_commentary_ast || effect.personal_commentary_raw;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b0818] via-[#130e2b] to-[#0f0a1f]">
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-8">
      {/* Hero Section - no summary here since we show the full description below */}
      <EffectHero
        name={effect.name}
        tags={effect.tags}
        socialMediaImage={effect.social_media_image}
        onNavigate={onNavigate}
      />

      {/* Main article body - free-floating, not in a card */}
      {descriptionContent && (
        <div className="prose prose-invert prose-sm max-w-none text-white/85 mb-8">
          <VCodeRenderer
            content={descriptionContent}
            onNavigate={onNavigate}
            citations={effect.citations}
            subarticles={effect.subarticles}
          />
        </div>
      )}

      {/* Divider below description */}
      <div className="my-12 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="space-y-6">
        {/* Replication Gallery */}
        {effect.gallery_order?.length && (
          <SectionCard delay={0.05}>
            <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
              <IconBadge icon="lucide:image" label="Replications" />
              Replications
            </h2>
            <ReplicationGallery
              effectSlug={effect.slug}
              galleryOrder={effect.gallery_order}
            />
          </SectionCard>
        )}

        {/* Audio Replications (if any) */}
        {effect.audio_replications && effect.audio_replications.length > 0 && (
          <SectionCard delay={0.1}>
            <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
              <IconBadge icon="lucide:volume-2" label="Audio Replications" />
              Audio Replications
            </h2>
            <div className="space-y-3">
              {effect.audio_replications.map((audio, index) => (
                <div 
                  key={index}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white/90">{audio.title}</span>
                    <span className="text-xs text-white/50">by {audio.artist}</span>
                  </div>
                  <audio
                    controls
                    className="w-full h-8"
                    preload="metadata"
                  >
                    <source src={audio.resource} />
                    Your browser does not support audio playback.
                  </audio>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Analysis Section */}
        {analysisContent && (
          <SectionCard delay={0.15}>
            <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
              <IconBadge icon="lucide:microscope" label="Analysis" />
              Analysis
            </h2>
            <VCodeRenderer
              content={analysisContent}
              onNavigate={onNavigate}
              citations={effect.citations}
              subarticles={effect.subarticles}
            />
          </SectionCard>
        )}

        {/* Style Variations Section */}
        {styleVariationsContent && (
          <SectionCard delay={0.2}>
            <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
              <IconBadge icon="lucide:palette" label="Style Variations" />
              Style Variations
            </h2>
            <VCodeRenderer
              content={styleVariationsContent}
              onNavigate={onNavigate}
              citations={effect.citations}
              subarticles={effect.subarticles}
            />
          </SectionCard>
        )}

        {/* Personal Commentary Section */}
        {personalCommentaryContent && (
          <SectionCard delay={0.25}>
            <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
              <IconBadge icon="lucide:quote" label="Personal Commentary" />
              Personal Commentary
            </h2>
            <VCodeRenderer
              content={personalCommentaryContent}
              onNavigate={onNavigate}
              citations={effect.citations}
              subarticles={effect.subarticles}
            />
          </SectionCard>
        )}

        {/* Related Substances Section */}
        {relatedSubstances && relatedSubstances.groups.length > 0 && (
          <RelatedSubstancesSection
            groups={relatedSubstances.groups}
            total={relatedSubstances.total}
            onSelectDrug={onSelectDrug}
            onSelectCategory={onSelectCategory}
          />
        )}

        {/* Citations, External Links, See Also */}
        <EffectCitationsSection
          citations={effect.citations}
          externalLinks={effect.external_links}
          seeAlso={effect.see_also}
          onNavigate={onNavigate}
        />

        {/* Contributors */}
        {effect.contributors && effect.contributors.length > 0 && (
          <EffectContributorsSection
            contributors={effect.contributors}
            onNavigate={onNavigate}
          />
        )}

        {/* Tags Section */}
        {effect.tags.length > 0 && (
          <SectionCard delay={0.45}>
            <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
              <IconBadge icon="lucide:tag" label="Tags" />
              Tags
            </h2>
            <div className="flex flex-wrap gap-2">
              {effect.tags.map((tag) => (
                <Button
                  key={tag}
                  variant="chip"
                  size="chip"
                  onClick={() => onNavigate(`/effects/category/${tag.toLowerCase().replace(/\s+/g, "-")}`)}
                >
                  {tag}
                </Button>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
      </div>
    </main>
  );
}

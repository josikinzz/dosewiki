import { motion } from "framer-motion";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { VCodeRenderer } from "../vcode";
import {
  EffectHero,
  EffectCitationsSection,
  EffectContributorsSection,
  RelatedSubstancesSection,
  ReplicationGallery,
} from "../components";
import { useSubjectiveEffect } from "@/hooks/useSubjectiveEffects";
import type { EffectDetail } from "@/data/builders/library";
import { cardAnimation } from "@/constants/motion";

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
    <main className="theme-page-shell min-h-screen">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-12 md:px-8">
        <div className="space-y-12">
          <motion.div {...cardAnimation}>
            <EffectHero
              name={effect.name}
              tags={effect.tags}
              onNavigate={onNavigate}
            />
          </motion.div>

          {/* Prose Content Flow - Article Style */}
          <div className="space-y-16">
            {/* Description Section */}
            {descriptionContent && (
              <motion.article
                {...cardAnimation}
                transition={{ ...cardAnimation.transition, delay: 0.1 }}
                className="prose prose-invert prose-fuchsia max-w-none"
              >
                <div className="text-[1.0625rem] leading-7 text-white/80 selection:bg-fuchsia-500/30 overflow-hidden">
                  <VCodeRenderer
                    content={descriptionContent}
                    onNavigate={onNavigate}
                    citations={effect.citations}
                    subarticles={effect.subarticles}
                  />
                </div>
              </motion.article>
            )}

            {/* Analysis Section */}
            {analysisContent && (
              <motion.section
                {...cardAnimation}
                transition={{ ...cardAnimation.transition, delay: 0.15 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="theme-section-header-glow absolute inset-0 rounded-full blur-xl" />
                    <h2 className="relative flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300">
                      <Icon icon="lucide:microscope" className="h-5 w-5" />
                      Analysis
                    </h2>
                  </div>
                  <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
                </div>
                <div className="prose prose-invert prose-fuchsia max-w-none text-white/85">
                  <VCodeRenderer
                    content={analysisContent}
                    onNavigate={onNavigate}
                    citations={effect.citations}
                    subarticles={effect.subarticles}
                  />
                </div>
              </motion.section>
            )}

            {/* Style Variations Section */}
            {styleVariationsContent && (
              <motion.section
                {...cardAnimation}
                transition={{ ...cardAnimation.transition, delay: 0.2 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="theme-section-header-glow absolute inset-0 rounded-full blur-xl" />
                    <h2 className="relative flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300">
                      <Icon icon="lucide:palette" className="h-5 w-5" />
                      Style Variations
                    </h2>
                  </div>
                  <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
                </div>
                <div className="prose prose-invert prose-fuchsia max-w-none text-white/85">
                  <VCodeRenderer
                    content={styleVariationsContent}
                    onNavigate={onNavigate}
                    citations={effect.citations}
                    subarticles={effect.subarticles}
                  />
                </div>
              </motion.section>
            )}

            {/* Replications Section */}
            {effect.gallery_order?.length && (
              <motion.section
                {...cardAnimation}
                transition={{ ...cardAnimation.transition, delay: 0.25 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="theme-section-header-glow absolute inset-0 rounded-full blur-xl" />
                    <h2 className="relative flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300">
                      <Icon icon="lucide:image" className="h-5 w-5" />
                      Replications
                    </h2>
                  </div>
                  <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
                </div>
                <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40 backdrop-blur-sm selection:bg-fuchsia-500/30 ring-1 ring-white/5 transition hover:border-fuchsia-500/30">
                  <ReplicationGallery
                    effectSlug={effect.slug}
                    galleryOrder={effect.gallery_order}
                  />
                </div>
              </motion.section>
            )}

            {/* Audio Replications */}
            {effect.audio_replications && effect.audio_replications.length > 0 && (
              <motion.section
                {...cardAnimation}
                transition={{ ...cardAnimation.transition, delay: 0.3 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="theme-section-header-glow absolute inset-0 rounded-full blur-xl" />
                    <h2 className="relative flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300">
                      <Icon icon="lucide:volume-2" className="h-5 w-5" />
                      Audio Replications
                    </h2>
                  </div>
                  <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {effect.audio_replications.map((audio, index) => (
                    <div
                      key={index}
                      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:bg-white/[0.05] hover:border-fuchsia-500/20 hover:shadow-lg hover:shadow-fuchsia-500/5"
                    >
                      <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-fuchsia-500/5 blur-xl group-hover:bg-fuchsia-500/10 transition" />
                      <div className="flex flex-col gap-1 mb-3">
                        <span className="text-sm font-semibold text-white/90 truncate">{audio.title}</span>
                        <span className="text-[10px] tracking-widest text-white/40 uppercase font-bold">by {audio.artist}</span>
                      </div>
                      <audio
                        controls
                        className="w-full h-8 opacity-75 group-hover:opacity-100 transition"
                        preload="metadata"
                      >
                        <source src={audio.resource} />
                        <track kind="captions" />
                      </audio>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Personal Commentary Section */}
            {personalCommentaryContent && (
              <motion.section
                {...cardAnimation}
                transition={{ ...cardAnimation.transition, delay: 0.35 }}
                className="relative overflow-hidden rounded-[32px] border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/[0.05] via-transparent to-violet-500/[0.05] p-10 ring-1 ring-white/10 shadow-2xl shadow-black/40 backdrop-blur-md"
              >
                <div className="absolute -left-12 -top-12 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[100px]" aria-hidden="true" />
                <div className="absolute -right-12 -bottom-12 h-64 w-64 rounded-full bg-violet-500/5 blur-[100px]" aria-hidden="true" />

                <h2 className="relative mb-8 flex items-center gap-3 text-2xl font-bold tracking-tight text-fuchsia-300">
                  <Icon icon="lucide:quote" className="h-6 w-6" />
                  Insight & Commentary
                </h2>
                <div className="relative prose prose-invert prose-fuchsia max-w-none text-white/85 italic leading-relaxed text-lg">
                  <VCodeRenderer
                    content={personalCommentaryContent}
                    onNavigate={onNavigate}
                    citations={effect.citations}
                    subarticles={effect.subarticles}
                  />
                </div>
              </motion.section>
            )}
          </div>

          <div className="my-20 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Metadata Footer Sections */}
          <motion.div
            {...cardAnimation}
            transition={{ ...cardAnimation.transition, delay: 0.4 }}
            className="space-y-16"
          >
            {/* Related Substances */}
            {relatedSubstances && relatedSubstances.groups.length > 0 && (
              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <h2 className="flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300">
                    <Icon icon="lucide:flask-conical" className="h-5 w-5" />
                    Known Interactions
                  </h2>
                  <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/20 to-transparent" />
                </div>
                <div className="rounded-[32px] border border-white/5 bg-white/[0.01] p-8 ring-1 ring-white/5 shadow-2xl shadow-black/20">
                  <RelatedSubstancesSection
                    groups={relatedSubstances.groups}
                    total={relatedSubstances.total}
                    onSelectDrug={onSelectDrug}
                    onSelectCategory={onSelectCategory}
                  />
                </div>
              </div>
            )}

            {/* Classification Tags */}
            {effect.tags.length > 0 && (
              <div className="space-y-6">
                <h3 className="flex items-center gap-3 text-[10px] font-bold tracking-[0.3em] text-fuchsia-300/50 uppercase">
                  Tags:
                </h3>
                <div className="flex flex-wrap gap-3">
                  {effect.tags.map((tag) => (
                    <Button
                      key={tag}
                      variant="ghostPill"
                      size="chipXs"
                      onClick={() => onNavigate(`/effects/category/${tag.toLowerCase().replace(/\s+/g, "-")}`)}
                      className="bg-white/[0.03] text-white/60 hover:text-white hover:bg-fuchsia-500/10 hover:border-fuchsia-500/30 transition-all px-4 py-2 border border-white/10"
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-8">
              <EffectCitationsSection
                citations={effect.citations}
                externalLinks={effect.external_links}
                seeAlso={effect.see_also}
                onNavigate={onNavigate}
              />

              {effect.contributors && effect.contributors.length > 0 && (
                <EffectContributorsSection
                  contributors={effect.contributors}
                  onNavigate={onNavigate}
                />
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
}

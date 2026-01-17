import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useMemo } from "react";

/**
 * Subjective effect from Convex.
 * 
 * Content hierarchy:
 * - summary: Short plain text for SEO and card previews
 * - long_summary: Condensed VCode content for category/summary pages (inline display)
 * - description: Full article content (VCode) for the effect page itself
 * - analysis, style_variations, personal_commentary: Additional article sections
 */
export interface SubjectiveEffect {
  _id: string;
  slug: string;
  name: string;
  tags: string[];
  featured?: boolean;
  
  /** Short plain-text summary for SEO meta descriptions and card previews */
  summary: string;
  
  /** Full article content (VCode markup) - shown on effect page at /effects/{slug} */
  description_raw: string;
  /** Full article content (parsed VCode AST) */
  description_ast?: unknown;
  
  /** Condensed summary (VCode markup) - shown on category/summary pages only, never the full description */
  long_summary_raw?: string;
  /** Condensed summary (parsed VCode AST) */
  long_summary_ast?: unknown;
  
  /** Technical analysis section (VCode markup) - additional article section */
  analysis_raw?: string;
  analysis_ast?: unknown;
  
  /** Style variations section (VCode markup) - additional article section */
  style_variations_raw?: string;
  style_variations_ast?: unknown;
  
  /** Personal commentary section (VCode markup) - additional article section */
  personal_commentary_raw?: string;
  personal_commentary_ast?: unknown;
  
  /** Social media preview image URL */
  social_media_image?: string;
  /** Replication slugs for gallery ordering */
  gallery_order?: string[];
  /** Audio replication files */
  audio_replications?: Array<{ title: string; artist: string; resource: string }>;
  /** Internal links to related effects */
  see_also?: Array<{ location: string; title: string }>;
  /** External reference links */
  external_links?: Array<{ url: string; title: string }>;
  /** Academic citations */
  citations?: Array<{ url: string; text: string; from?: string }>;
  /** Table of contents anchors for long articles */
  subarticles?: Array<{ id: string; title: string }>;
  /** Contributing authors */
  contributors?: string[];
}

/**
 * Hook to fetch all subjective effects from Convex.
 */
export function useSubjectiveEffects() {
  const effects = useQuery(api.subjectiveEffects.getAll);
  
  return useMemo(() => ({
    effects: effects ?? [],
    isLoading: effects === undefined,
  }), [effects]);
}

/**
 * Hook to fetch a single subjective effect by slug.
 */
export function useSubjectiveEffect(slug: string | undefined) {
  const effect = useQuery(
    api.subjectiveEffects.getBySlug,
    slug ? { slug } : "skip"
  );
  
  return useMemo(() => ({
    effect: effect ?? null,
    isLoading: effect === undefined,
  }), [effect]);
}

/**
 * Hook to get all unique tags from subjective effects.
 */
export function useEffectTags() {
  const tags = useQuery(api.subjectiveEffects.getAllTags);
  
  return useMemo(() => ({
    tags: tags ?? [],
    isLoading: tags === undefined,
  }), [tags]);
}

/**
 * Summary type for index pages.
 */
export interface EffectIndexSummary {
  slug: string;
  name: string;
  tags: string[];
}

/**
 * Transform full effects to index summaries.
 */
export function useSubjectiveEffectSummaries() {
  const { effects, isLoading } = useSubjectiveEffects();
  
  const summaries = useMemo((): EffectIndexSummary[] => {
    return effects.map(e => ({
      slug: e.slug,
      name: e.name,
      tags: e.tags,
    }));
  }, [effects]);
  
  return { summaries, isLoading };
}

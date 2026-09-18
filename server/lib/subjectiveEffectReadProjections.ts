type ReplicationRightsStatus =
  | "creator-retained"
  | "explicit-license"
  | "unknown"
  | "permission-granted"
  | "public-domain";

type AudioReplicationRecord = {
  title: string;
  artist: string;
  artist_url?: string;
  resource: string;
  rights_status?: ReplicationRightsStatus;
  license_name?: string;
  license_url?: string;
  credit_line?: string;
  source_url?: string;
  rightsholder?: string;
  permission_notes?: string;
  removal_contact?: string;
};

export type SubjectiveEffectRecord = {
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
  audio_replications?: AudioReplicationRecord[];
  see_also?: Array<{ location: string; title: string }>;
  external_links?: Array<{ url: string; title: string }>;
  citations?: Array<{ url: string; text: string; from?: string }>;
  subarticles?: Array<{ id: string; title: string }>;
  contributors?: string[];
};

export const subjectiveEffectCategoryTags: Record<string, string[]> = {
  sensory: ["sensory"],
  cognitive: ["cognitive"],
  physical: ["physical"],
  visual: ["visual"],
  auditory: ["auditory"],
  tactile: ["tactile"],
  "smell-and-taste": ["smell and taste"],
  multisensory: ["multisensory"],
  amplification: ["amplification"],
  suppression: ["suppression"],
  distortion: ["distortion"],
  geometric: ["geometric"],
  hallucinatory: ["hallucinatory state"],
};

export function projectPublicEffectPreview(effect: SubjectiveEffectRecord) {
  return {
    name: effect.name,
    slug: effect.slug,
    summary: effect.summary,
    featured: effect.featured === true,
    tags: effect.tags,
  };
}

export function projectPublicEffectIndexEntry(effect: SubjectiveEffectRecord) {
  return {
    name: effect.name,
    slug: effect.slug,
    tags: effect.tags,
    featured: effect.featured === true,
  };
}

export function projectPublicEffectArticle(effect: SubjectiveEffectRecord) {
  return {
    slug: effect.slug,
    name: effect.name,
    tags: effect.tags,
    featured: effect.featured,
    summary: effect.summary,
    description_raw: effect.description_raw,
    description_ast: effect.description_ast,
    long_summary_raw: effect.long_summary_raw,
    long_summary_ast: effect.long_summary_ast,
    analysis_raw: effect.analysis_raw,
    analysis_ast: effect.analysis_ast,
    style_variations_raw: effect.style_variations_raw,
    style_variations_ast: effect.style_variations_ast,
    personal_commentary_raw: effect.personal_commentary_raw,
    personal_commentary_ast: effect.personal_commentary_ast,
    social_media_image: effect.social_media_image,
    gallery_order: effect.gallery_order,
    audio_replications: effect.audio_replications,
    see_also: effect.see_also,
    external_links: effect.external_links,
    citations: effect.citations,
    subarticles: effect.subarticles,
    contributors: effect.contributors,
  };
}

export function matchesSubjectiveEffectCategory(effect: SubjectiveEffectRecord, category: string): boolean {
  const tagsToMatch = subjectiveEffectCategoryTags[category];

  if (!tagsToMatch) {
    return false;
  }

  return tagsToMatch.some((tag) => effect.tags.includes(tag));
}

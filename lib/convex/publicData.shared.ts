import "server-only";

import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { SubstanceArticle } from "../../src/schema";

export type IndexLayoutType = "psychoactive" | "chemical" | "mechanism";

export type SubjectiveEffectRecord = {
  slug: string;
  name: string;
  summary: string;
  tags: string[];
  featured?: boolean;
};

export type PublicCategoryLayout = {
  version: number;
  categories: Array<{
    key: string;
    label: string;
    iconKey: string;
    sections: Array<{
      key: string;
      label: string;
      drugs: string[];
    }>;
    drugs: string[];
    columns?: Record<string, number>;
  }>;
};

export type PublicSubstanceLookupEntry = {
  slug: string;
  name: string;
  priority: "high" | "normal" | "low";
};

export type SubstanceRecord = SubstanceArticle & {
  slug?: string;
};

export type TripReportRecord = {
  slug: string;
  title: string;
  featured?: boolean;
  subject: {
    name: string;
    avatar_url?: string;
    trip_date?: string;
  };
  substances: Array<{
    name: string;
  }>;
  introduction?: string;
};

export type AboutConfigRecord = {
  aboutMarkdown?: string;
  aboutSubtitle?: string;
  founderProfileKeys?: string[];
  updatedAt: string;
};

export type IndexLayoutRecord = {
  type: IndexLayoutType;
  version: number;
  categories: Array<{
    key: string;
    label: string;
    drugs: string[];
    sections: Array<{
      key: string;
      label: string;
      drugs: string[];
    }>;
  }>;
};

export type PublicSubstancePreview = {
  title: string;
  slug: string;
  summary: string;
  priority: "high" | "normal" | "low";
  indexCategories: string[];
};

export type PublicEffectPreview = {
  name: string;
  slug: string;
  summary: string;
  featured: boolean;
  tags: string[];
};

export type PublicReportPreview = {
  title: string;
  slug: string;
  author: string;
  featured: boolean;
  substanceNames: string[];
  introduction: string;
  tripDate?: string;
  authorAvatarUrl?: string | null;
  authorProfileKey?: string;
};

export type PublicAboutData = {
  subtitle: string;
  markdown: string;
  founderProfiles: NormalizedUserProfile[];
  updatedAt: string | null;
};

export type SubjectiveEffectDetailRecord = SubjectiveEffectRecord & {
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
  subarticles?: Array<{ id: string; title: string }>;
  contributors?: string[];
  citations?: Array<{
    url: string;
    text: string;
    from?: string;
  }>;
};

export type PublicEffectArticle = SubjectiveEffectDetailRecord;

export type TripReportDetailRecord = TripReportRecord & {
  onset: Array<{ time?: string; description: string }>;
  peak: Array<{ time?: string; description: string }>;
  offset: Array<{ time?: string; description: string }>;
  conclusion?: string;
  tags: string[];
};

export const priorityScore: Record<PublicSubstancePreview["priority"], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

export const trimExcerpt = (value: string | null | undefined, maxLength = 180) => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

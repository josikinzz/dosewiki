import "server-only";

import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { VCodeContent } from "../../src/features/effects/vcode/types";
import type { PublicArticleProjection, SubstanceArticle } from "../../src/schema";
import type {
  PublicSubstanceArticleRecord,
  PublicSubstanceLibraryInputRecord,
} from "./publicData.substanceContract";
import type { MechanismRouteSubstanceInput } from "../../src/data/builders/mechanismRouteDerivation";
import type {
  PublicReportPreview,
  TripReportDetailRecord,
  TripReportPreviewRecord,
} from "../../src/types/tripReport";
import type { AudioReplicationMetadata } from "../../src/types/replications";

export type { PublicReportPreview, TripReportDetailRecord };

export type IndexLayoutType = "psychoactive" | "chemical" | "mechanism";

export type PublicOverviewCounts = {
  substanceCount: number;
  effectCount: number;
  reportCount: number;
  replicationCount: number;
  aboutConfigured: boolean;
  psychoactiveCategoryCount: number;
};

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

export type PublicSubstanceLibraryRecord = PublicSubstanceLibraryInputRecord;

export type PublicMechanismRouteInput = MechanismRouteSubstanceInput;

export type PublicSubstanceRecord = PublicArticleProjection<SubstanceRecord> | PublicSubstanceArticleRecord;

export type TripReportRecord = TripReportPreviewRecord;

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

export type PublicEffectIndexEntry = Pick<
  PublicEffectPreview,
  "name" | "slug" | "tags" | "featured"
>;

export type PublicAboutData = {
  subtitle: string;
  markdown: string;
  founderProfiles: NormalizedUserProfile[];
  updatedAt: string | null;
};

export type SubjectiveEffectDetailRecord = SubjectiveEffectRecord & {
  description_raw: string;
  description_ast?: VCodeContent;
  long_summary_raw?: string;
  long_summary_ast?: VCodeContent;
  analysis_raw?: string;
  analysis_ast?: VCodeContent;
  style_variations_raw?: string;
  style_variations_ast?: VCodeContent;
  personal_commentary_raw?: string;
  personal_commentary_ast?: VCodeContent;
  social_media_image?: string;
  gallery_order?: string[];
  audio_replications?: AudioReplicationMetadata[];
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

export type PublicEffectSummary = Pick<PublicEffectArticle,
  "slug" | "name" | "tags" | "summary" | "long_summary_raw" | "long_summary_ast" | "citations" | "subarticles"
>;

export type PublicEffectIndexArticle = {
  slug: string;
  title: string;
  tags: string[];
  publication_status: string;
  featured?: boolean;
  shortDescription?: string;
  publicationDate?: string;
  body_raw: string;
  body_ast?: VCodeContent;
  /**
   * The legacy Mongo dump's raw 24-character author ObjectIds. Kept as-is
   * because they are what the imported rows carry; they are never displayed.
   */
  authors?: string[];
  /**
   * Contributor profile keys, backfilled from `authors`. This is the field a
   * byline renders from — an article without it simply shows no byline.
   */
  authorProfileKeys?: string[];
  citations?: Array<{
    url: string;
    text: string;
  }>;
  /**
   * Writing/Blog system fields. All optional: a legacy Effect Index import
   * carries none of them, and absence means exactly what it meant before —
   * `kind` absent is an article, `bodyFormat` absent is the VCode markup in
   * `body_raw`.
   */
  kind?: "article" | "blog";
  bodyFormat?: "vcode" | "markdown";
  teaser?: string;
  coverImageUrl?: string;
};

/** Published index metadata. Narrative bodies belong only to detail reads. */
export type PublicPublicationIndexEntry = Omit<PublicEffectIndexArticle, "body_raw" | "body_ast" | "citations"> & {
  readMinutes?: number;
  indexDescription?: string;
  excerpt: string;
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

// Row shapes for reads that historically bypassed the adapter. They describe
// what the backend returns before any lib-side normalization.

export type PublicChangelogRow = {
  entryId: string;
  createdAt: string;
  message: string;
  markdown: string;
  submittedBy: string | null;
  articles: unknown;
};

export type PublicMoleculeOverrideSummary = { slug: string; updatedAt: string };

export type PublicMolecule = { svg: string; updatedAt: string };

export type PublicIdentityParty = {
  display_name: string;
  profile_key: string | null;
};

export type PublicReplicationIdentityAttribution = {
  poster: PublicIdentityParty & {
    profile_url: string | null;
    platform: string | null;
    posted_at: number;
  };
  creator: PublicIdentityParty;
  proven_different_creator: boolean;
};

export type PublicContributorIdentity = {
  canonical_key: string;
  aliases: string[];
  avatar_url: string | null;
  verified_replicator: boolean;
};

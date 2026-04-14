import "server-only";

import { cache } from "react";
import { type NormalizedUserProfile } from "../../src/data/userProfiles";
import type { SubstanceArticle } from "../../src/schema";
import type { ReplicationWithUrl } from "../../src/types/replications";
import { queryConvex } from "./serverClient";
import { getServerConvexAdminKey } from "./serverWriteHealth";

export type IndexLayoutType = "psychoactive" | "chemical" | "mechanism";

type SubjectiveEffectRecord = {
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

type SubstanceRecord = SubstanceArticle & {
  slug?: string;
};

type TripReportRecord = {
  slug: string;
  title: string;
  featured?: boolean;
  subject: {
    name: string;
    trip_date?: string;
  };
  substances: Array<{
    name: string;
  }>;
  introduction?: string;
};

type AboutConfigRecord = {
  aboutMarkdown?: string;
  aboutSubtitle?: string;
  founderProfileKeys?: string[];
  updatedAt: string;
};

type IndexLayoutRecord = {
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
};

export type PublicAboutData = {
  subtitle: string;
  markdown: string;
  founderProfiles: NormalizedUserProfile[];
  updatedAt: string | null;
};

type SubjectiveEffectDetailRecord = SubjectiveEffectRecord & {
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

type TripReportDetailRecord = TripReportRecord & {
  onset: Array<{ time?: string; description: string }>;
  peak: Array<{ time?: string; description: string }>;
  offset: Array<{ time?: string; description: string }>;
  conclusion?: string;
  tags: string[];
};

const priorityScore: Record<PublicSubstancePreview["priority"], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

const trimExcerpt = (value: string | null | undefined, maxLength = 180) => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

export const getRawSubstances = cache(async (): Promise<SubstanceRecord[]> => {
  return await queryConvex<SubstanceRecord[]>("substanceIndex:getAll", {});
});

export const getPublicCategoryLayout = cache(async (): Promise<PublicCategoryLayout | null> => {
  return await queryConvex<PublicCategoryLayout | null>("categoryLayout:get", {});
});

export const getPublicSubstanceLookup = cache(async (): Promise<PublicSubstanceLookupEntry[]> => {
  return await queryConvex<PublicSubstanceLookupEntry[]>("substanceIndex:getSlugNameMap", {});
});

export const getPublicSubstances = cache(async (): Promise<PublicSubstancePreview[]> => {
  const substances = await queryConvex<SubstanceRecord[]>("substanceIndex:getAll", {});

  return substances
    .map((substance) => ({
      title: substance.title,
      slug:
        substance.slug ??
        substance.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      summary: trimExcerpt(substance.summary, 200),
      priority: substance.priority ?? "normal",
      indexCategories: substance.index_categories,
    }))
    .sort((left, right) => {
      const priorityDelta = priorityScore[left.priority] - priorityScore[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.title.localeCompare(right.title);
    });
});

export const getFeaturedSubstances = cache(async (limit = 8) => {
  return (await getPublicSubstances()).slice(0, limit);
});

export const getPublicSubstanceBySlug = cache(async (slug: string): Promise<SubstanceRecord | null> => {
  return await queryConvex<SubstanceRecord | null, { slug: string }>("substanceIndex:getBySlug", { slug });
});

export const getPublicEffects = cache(async (): Promise<PublicEffectPreview[]> => {
  const effects = await queryConvex<SubjectiveEffectRecord[]>("subjectiveEffects:getAll", {});

  return effects
    .map((effect) => ({
      name: effect.name,
      slug: effect.slug,
      summary: trimExcerpt(effect.summary, 170),
      featured: effect.featured === true,
      tags: effect.tags,
    }))
    .sort((left, right) => {
      if (left.featured !== right.featured) {
        return left.featured ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
});

export const getFeaturedEffects = cache(async (limit = 8) => {
  return (await getPublicEffects()).slice(0, limit);
});

export const getPublicEffectBySlug = cache(async (slug: string): Promise<SubjectiveEffectDetailRecord | null> => {
  return await queryConvex<SubjectiveEffectDetailRecord | null, { slug: string }>("subjectiveEffects:getBySlug", {
    slug,
  });
});

export const getPublicEffectArticles = cache(async (): Promise<PublicEffectArticle[]> => {
  return await queryConvex<PublicEffectArticle[]>("subjectiveEffects:getAll", {});
});

export const getEffectsByCategory = cache(async (category: string): Promise<PublicEffectPreview[]> => {
  const effects = await queryConvex<SubjectiveEffectRecord[], { category: string }>("subjectiveEffects:getByCategory", {
    category,
  });

  return effects.map((effect) => ({
    name: effect.name,
    slug: effect.slug,
    summary: trimExcerpt(effect.summary, 170),
    featured: effect.featured === true,
    tags: effect.tags,
  }));
});

export const getPublicReports = cache(async (): Promise<PublicReportPreview[]> => {
  const reports = await queryConvex<TripReportRecord[]>("tripReports:getAll", {});

  return reports
    .map((report) => ({
      title: report.title,
      slug: report.slug,
      author: report.subject.name,
      featured: report.featured === true,
      substanceNames: report.substances.map((substance) => substance.name),
      introduction: trimExcerpt(report.introduction, 170),
      tripDate: report.subject.trip_date,
    }))
    .sort((left, right) => {
      if (left.featured !== right.featured) {
        return left.featured ? -1 : 1;
      }

      return left.title.localeCompare(right.title);
    });
});

export const getFeaturedReports = cache(async (limit = 8) => {
  return (await getPublicReports()).slice(0, limit);
});

export const getPublicReportBySlug = cache(async (slug: string): Promise<TripReportDetailRecord | null> => {
  return await queryConvex<TripReportDetailRecord | null, { slug: string }>("tripReports:getBySlug", { slug });
});

export const getPublicReplicationsByEffect = cache(async (effectSlug: string): Promise<ReplicationWithUrl[]> => {
  return await queryConvex<ReplicationWithUrl[], { effect_slug: string }>("replications:getReplicationsByEffect", {
    effect_slug: effectSlug,
  });
});

export const getReportsByAuthor = cache(async (authorName: string): Promise<PublicReportPreview[]> => {
  const reports = await queryConvex<TripReportRecord[], { authorName: string }>("tripReports:getByAuthor", {
    authorName,
  });

  return reports.map((report) => ({
    title: report.title,
    slug: report.slug,
    author: report.subject.name,
    featured: report.featured === true,
    substanceNames: report.substances.map((substance) => substance.name),
    introduction: trimExcerpt(report.introduction, 170),
    tripDate: report.subject.trip_date,
  }));
});

export const getPublicReportsBySubstanceNames = cache(async (substanceNames: string[]) => {
  if (substanceNames.length === 0) {
    return [];
  }

  return await queryConvex<TripReportDetailRecord[], { substanceNames: string[] }>("tripReports:getBySubstanceNames", {
    substanceNames,
  });
});

export const getPublicContributorProfiles = cache(async (): Promise<NormalizedUserProfile[]> => {
  return await queryConvex<NormalizedUserProfile[]>("contributorProfiles:getAll", {});
});

export const getPublicContributorKeys = cache(async (): Promise<string[]> => {
  return await queryConvex<string[]>("contributorProfiles:getKeys", {});
});

export const getPublicContributorByKey = cache(async (key: string): Promise<NormalizedUserProfile | null> => {
  return await queryConvex<NormalizedUserProfile | null, { key: string }>("contributorProfiles:getByKey", { key });
});

export const getOwnedContributorProfile = cache(async (email: string): Promise<NormalizedUserProfile | null> => {
  const apiKey = getServerConvexAdminKey();
  if (!apiKey) {
    return null;
  }

  return await queryConvex<NormalizedUserProfile | null, { apiKey: string; email: string }>(
    "contributorProfiles:getOwnedProfile",
    { apiKey, email },
  );
});

export const getPublicAboutData = cache(async (): Promise<PublicAboutData> => {
  const about = await queryConvex<AboutConfigRecord | null>("siteConfig:getAbout", {});
  const allProfiles = await getPublicContributorProfiles();
  const founderProfiles = (about?.founderProfileKeys ?? [])
    .map((profileKey) => allProfiles.find((profile) => profile.key === profileKey.trim().toUpperCase()) ?? null)
    .filter((profile): profile is NormalizedUserProfile => profile !== null);

  return {
    subtitle: about?.aboutSubtitle?.trim() ?? "",
    markdown: about?.aboutMarkdown?.trim() ?? "",
    founderProfiles,
    updatedAt: about?.updatedAt ?? null,
  };
});

export const getIndexLayoutByType = cache(async (type: IndexLayoutType): Promise<IndexLayoutRecord | null> => {
  return await queryConvex<IndexLayoutRecord | null, { type: IndexLayoutType }>("indexLayouts:getByType", {
    type,
  });
});

export const getPublicDataOverview = cache(async () => {
  const [substances, effects, reports, about, psychoactiveLayout] = await Promise.all([
    getPublicSubstances(),
    getPublicEffects(),
    getPublicReports(),
    getPublicAboutData(),
    getIndexLayoutByType("psychoactive"),
  ]);

  return {
    substanceCount: substances.length,
    effectCount: effects.length,
    reportCount: reports.length,
    aboutConfigured: about.markdown.length > 0 || about.subtitle.length > 0,
    psychoactiveCategoryCount: psychoactiveLayout?.categories.length ?? 0,
  };
});

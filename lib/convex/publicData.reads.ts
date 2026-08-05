import "server-only";

import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { GalleryReplication, ReplicationWithUrl } from "../../src/types/replications";
import {
  priorityScore,
  trimExcerpt,
  type AboutConfigRecord,
  type IndexLayoutRecord,
  type IndexLayoutType,
  type PublicCategoryLayout,
  type PublicEffectArticle,
  type PublicEffectIndexArticle,
  type PublicEffectPreview,
  type PublicMechanismRouteInput,
  type PublicSubstanceLibraryRecord,
  type PublicSubstanceLookupEntry,
  type PublicSubstancePreview,
  type PublicSubstanceRecord,
  type SubstanceRecord,
  type SubjectiveEffectDetailRecord,
  type SubjectiveEffectRecord,
  type TripReportDetailRecord,
  type TripReportRecord,
} from "./publicData.shared";
import {
  type PublicSubstanceArticleRecord,
  parsePublicSubstanceLibraryInputRecords,
  parsePublicSubstanceRecord,
  parsePublicSubstanceRecords,
} from "./publicData.substanceContract";
import { queryConvex } from "./serverClient";
import { normalizeVCodeContent } from "../../src/features/effects/vcode/normalize";
import {
  normalizeSubstancePriority,
  projectLibraryInput,
  projectMechanismRouteInput,
} from "../../convex/lib/substanceReadProjections";
import {
  projectPublicEffectIndexPost,
  projectPublicEffectIndexPosts,
  type PublicEffectIndexPost,
} from "../../convex/lib/effectIndexArchiveReadProjections";

type QueryArgs = Record<string, unknown>;
type QueryTransport = <Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args,
) => Promise<Result>;

const ABOUT_PREVIEW_COUNT = 12;
const ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE = 64;

export const publicDataReadCatalog = {
  publicSubstanceLibraryInput: { functionName: "substanceIndex:getPublicLibraryInput", args: () => ({}) },
  publicSubstanceCoverageInput: {
    functionName: "substanceIndex:getPublicCoverageInput",
    args: () => ({}),
  },
  publicSubstanceMechanismRouteInput: {
    functionName: "substanceIndex:getPublicMechanismRouteInput",
    args: () => ({}),
  },
  publicAboutPreviewCandidates: {
    functionName: "substanceIndex:getPublicAboutPreviewCandidates",
    args: (cursor?: string) => ({
      ...(cursor ? { cursor } : {}),
      limit: ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE,
    }),
  },
  publicCategoryLayout: { functionName: "categoryLayout:get", args: () => ({}) },
  publicSubstanceLookup: { functionName: "substanceIndex:getPublicLookup", args: () => ({}) },
  publicSubstancePreviews: { functionName: "substanceIndex:getPublicPreviews", args: () => ({}) },
  publicSubstanceBySlug: { functionName: "substanceIndex:getPublicBySlug", args: (slug: string) => ({ slug }) },
  publicEffectRecords: { functionName: "subjectiveEffects:getPublicPreviews", args: () => ({}) },
  publicEffectBySlug: { functionName: "subjectiveEffects:getPublicBySlug", args: (slug: string) => ({ slug }) },
  publicEffectArticles: { functionName: "subjectiveEffects:getPublicArticles", args: () => ({}) },
  publicEffectsByCategory: {
    functionName: "subjectiveEffects:getPublicByCategory",
    args: (category: string) => ({ category }),
  },
  publicEffectIndexArticles: {
    functionName: "effectIndexArticles:getAll",
    args: () => ({}),
  },
  publicEffectIndexArticleBySlug: {
    functionName: "effectIndexArticles:getBySlug",
    args: (slug: string) => ({ slug }),
  },
  publicEffectIndexPosts: {
    functionName: "effectIndexArchive:listPosts",
    args: () => ({}),
  },
  publicEffectIndexPostBySlug: {
    functionName: "effectIndexArchive:getPostBySlug",
    args: (slug: string) => ({ slug }),
  },
  publicReplicationsByEffect: {
    functionName: "replications:getReplicationsByEffect",
    args: (effectSlug: string) => ({ effect_slug: effectSlug }),
  },
  publicReplications: {
    functionName: "replications:getPublicReplications",
    args: () => ({}),
  },
  publicTripReportRecords: { functionName: "tripReports:getAll", args: () => ({}) },
  publicTripReportBySlug: { functionName: "tripReports:getBySlug", args: (slug: string) => ({ slug }) },
  publicTripReportsByAuthor: {
    functionName: "tripReports:getByAuthor",
    args: (authorName: string) => ({ authorName }),
  },
  publicTripReportsByContributor: {
    functionName: "tripReports:getByContributor",
    args: (profileKey: string, authorNames: string[]) => ({ profileKey, authorNames }),
  },
  publicTripReportsBySubstanceNames: {
    functionName: "tripReports:getBySubstanceNames",
    args: (substanceNames: string[]) => ({ substanceNames }),
  },
  publicContributorProfiles: { functionName: "contributorProfiles:getAll", args: () => ({}) },
  publicAboutConfig: { functionName: "siteConfig:getAbout", args: () => ({}) },
  publicIndexLayoutByType: { functionName: "indexLayouts:getByType", args: (type: IndexLayoutType) => ({ type }) },
} as const;

export type PublicDataReadAdapter = {
  getRawSubstances(): Promise<PublicSubstanceLibraryRecord[]>;
  getPublicCoverageSubstances(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicMechanismRouteInput(): Promise<PublicMechanismRouteInput[]>;
  getPublicAboutPreviewSubstances(): Promise<PublicSubstanceArticleRecord[]>;
  getPublicCategoryLayout(): Promise<PublicCategoryLayout | null>;
  getPublicSubstanceLookup(): Promise<PublicSubstanceLookupEntry[]>;
  getPublicSubstancePreviews(): Promise<PublicSubstancePreview[]>;
  getPublicSubstanceBySlug(slug: string): Promise<PublicSubstanceRecord | null>;
  getPublicEffects(): Promise<PublicEffectPreview[]>;
  getPublicEffectBySlug(slug: string): Promise<SubjectiveEffectDetailRecord | null>;
  getPublicEffectArticles(): Promise<PublicEffectArticle[]>;
  getPublicEffectsByCategory(category: string): Promise<PublicEffectPreview[]>;
  getPublicEffectIndexArticles(): Promise<PublicEffectIndexArticle[]>;
  getPublishedEffectIndexArticles(): Promise<PublicEffectIndexArticle[]>;
  getPublicEffectIndexArticleBySlug(slug: string): Promise<PublicEffectIndexArticle | null>;
  getPublicEffectIndexPosts(): Promise<PublicEffectIndexPost[]>;
  getPublicEffectIndexPostBySlug(slug: string): Promise<PublicEffectIndexPost | null>;
  getPublicReplicationsByEffect(effectSlug: string): Promise<ReplicationWithUrl[]>;
  getPublicReplications(): Promise<GalleryReplication[]>;
  getPublicTripReportRecords(): Promise<TripReportRecord[]>;
  getPublicTripReportBySlug(slug: string): Promise<TripReportDetailRecord | null>;
  getPublicTripReportsByAuthor(authorName: string): Promise<TripReportRecord[]>;
  getPublicTripReportsByContributor(profileKey: string, authorNames: string[]): Promise<TripReportRecord[]>;
  getPublicTripReportsBySubstanceNames(substanceNames: string[]): Promise<TripReportDetailRecord[]>;
  getPublicContributorProfiles(): Promise<NormalizedUserProfile[]>;
  getPublicAboutConfig(): Promise<AboutConfigRecord | null>;
  getPublicIndexLayoutByType(type: IndexLayoutType): Promise<IndexLayoutRecord | null>;
};

export const projectPublicEffectPreview = (effect: SubjectiveEffectRecord): PublicEffectPreview => ({
  name: effect.name,
  slug: effect.slug,
  summary: trimExcerpt(effect.summary, 170),
  featured: effect.featured === true,
  tags: effect.tags,
});

export const projectPublicEffectPreviews = (effects: SubjectiveEffectRecord[]): PublicEffectPreview[] =>
  effects.map(projectPublicEffectPreview).sort((left, right) => {
    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

function normalizePublicEffectArticle(effect: SubjectiveEffectDetailRecord): SubjectiveEffectDetailRecord {
  return {
    slug: effect.slug,
    name: effect.name,
    tags: effect.tags,
    featured: effect.featured,
    summary: effect.summary,
    description_raw: effect.description_raw,
    description_ast: normalizeVCodeContent(effect.description_ast, undefined),
    long_summary_raw: effect.long_summary_raw,
    long_summary_ast: normalizeVCodeContent(effect.long_summary_ast, undefined),
    analysis_raw: effect.analysis_raw,
    analysis_ast: normalizeVCodeContent(effect.analysis_ast, undefined),
    style_variations_raw: effect.style_variations_raw,
    style_variations_ast: normalizeVCodeContent(effect.style_variations_ast, undefined),
    personal_commentary_raw: effect.personal_commentary_raw,
    personal_commentary_ast: normalizeVCodeContent(effect.personal_commentary_ast, undefined),
    social_media_image: effect.social_media_image,
    gallery_order: effect.gallery_order,
    audio_replications: effect.audio_replications,
    see_also: effect.see_also,
    external_links: effect.external_links,
    subarticles: effect.subarticles,
    contributors: effect.contributors,
    citations: effect.citations,
  };
}

const normalizePublicEffectArticles = (effects: SubjectiveEffectDetailRecord[]): PublicEffectArticle[] =>
  effects.map(normalizePublicEffectArticle);

const slugifySubstanceTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const resolveSubstanceSlug = (substance: Pick<SubstanceRecord, "slug" | "title">): string =>
  typeof substance.slug === "string" && substance.slug.length > 0
    ? substance.slug
    : slugifySubstanceTitle(substance.title);

export function projectPublicSubstanceLookup(substance: SubstanceRecord): PublicSubstanceLookupEntry {
  return {
    slug: resolveSubstanceSlug(substance),
    name: substance.title,
    priority: normalizeSubstancePriority(substance.priority),
  };
}

export function projectPublicSubstancePreview(substance: SubstanceRecord): PublicSubstancePreview {
  return {
    title: substance.title,
    slug: resolveSubstanceSlug(substance),
    summary: trimExcerpt(typeof substance.summary === "string" ? substance.summary : "", 200),
    priority: normalizeSubstancePriority(substance.priority),
    indexCategories: substance.index_categories,
  };
}

export function projectPublicSubstanceLibraryRecord(substance: SubstanceRecord): PublicSubstanceLibraryRecord {
  return projectLibraryInput(substance);
}

export function projectPublicSubstanceRecord(substance: SubstanceRecord): PublicSubstanceRecord {
  const { editorial_review: editorialReview, ...publicSubstance } = substance;

  return {
    ...publicSubstance,
    slug: resolveSubstanceSlug(substance),
    priority: normalizeSubstancePriority(substance.priority),
    expert_reviewed: editorialReview?.status === "completed",
  };
}

export const projectPublicSubstancePreviews = (substances: SubstanceRecord[]): PublicSubstancePreview[] =>
  substances.map(projectPublicSubstancePreview).sort((left, right) => {
    const priorityDelta = priorityScore[left.priority] - priorityScore[right.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.title.localeCompare(right.title);
  });

type PublicProjectionReadFallback<RawFallbackResult, PublicResult, FallbackArgs extends QueryArgs> = {
  functionName: string;
  args: () => FallbackArgs;
  project: (result: RawFallbackResult) => PublicResult;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSubstanceRecordCandidate(value: unknown): value is SubstanceRecord {
  return isRecord(value) && typeof value.title === "string";
}

function isSubjectiveEffectRecordCandidate(value: unknown): value is SubjectiveEffectRecord {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.tags)
  );
}

function isSubjectiveEffectDetailRecordCandidate(value: unknown): value is SubjectiveEffectDetailRecord {
  if (!isSubjectiveEffectRecordCandidate(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.description_raw === "string";
}

function normalizePublicEffectIndexArticle(record: unknown): PublicEffectIndexArticle | null {
  if (
    !isRecord(record) ||
    typeof record.slug !== "string" ||
    typeof record.title !== "string" ||
    typeof record.publication_status !== "string" ||
    !Array.isArray(record.tags) ||
    !record.tags.every((tag) => typeof tag === "string") ||
    typeof record.body_raw !== "string"
  ) {
    return null;
  }

  const bodyAst = normalizeVCodeContent(record.body_ast, record.body_raw);
  const article: PublicEffectIndexArticle = {
    slug: record.slug,
    title: record.title,
    tags: record.tags,
    publication_status: record.publication_status,
    body_raw: record.body_raw,
  };

  if (typeof record.featured === "boolean") article.featured = record.featured;
  if (typeof record.shortDescription === "string") article.shortDescription = record.shortDescription;
  if (typeof record.publicationDate === "string") article.publicationDate = record.publicationDate;
  if (bodyAst) article.body_ast = bodyAst;
  if (Array.isArray(record.authors) && record.authors.every((author) => typeof author === "string")) {
    article.authors = record.authors;
  }
  if (Array.isArray(record.citations)) {
    article.citations = record.citations.flatMap((citation) =>
      isRecord(citation) && typeof citation.url === "string" && typeof citation.text === "string"
        ? [{ url: citation.url, text: citation.text }]
        : [],
    );
  }

  return article;
}

function normalizePublicEffectIndexArticles(records: unknown[]): PublicEffectIndexArticle[] {
  return records.flatMap((record) => {
    const article = normalizePublicEffectIndexArticle(record);
    return article ? [article] : [];
  });
}

function projectLegacyPublicSubstanceLibraryRecords(records: unknown[]): PublicSubstanceLibraryRecord[] {
  return parsePublicSubstanceLibraryInputRecords(
    records.flatMap((record) =>
      isSubstanceRecordCandidate(record) ? [projectPublicSubstanceLibraryRecord(record)] : [],
    ),
  );
}

function projectLegacyPublicSubstanceCoverageRecords(
  records: unknown[],
): PublicSubstanceArticleRecord[] {
  return parsePublicSubstanceRecords(
    records.flatMap((record) =>
      isSubstanceRecordCandidate(record)
        ? [projectPublicSubstanceRecord(record)]
        : [],
    ),
  );
}

function projectLegacyPublicSubstanceRecord(record: unknown): PublicSubstanceRecord | null {
  return isSubstanceRecordCandidate(record) ? parsePublicSubstanceRecord(projectPublicSubstanceRecord(record)) : null;
}

function projectLegacyPublicSubstanceLookup(records: unknown[]): PublicSubstanceLookupEntry[] {
  return records.flatMap((record) =>
    isSubstanceRecordCandidate(record) ? [projectPublicSubstanceLookup(record)] : [],
  );
}

function projectLegacyPublicSubstancePreviews(records: unknown[]): PublicSubstancePreview[] {
  return projectPublicSubstancePreviews(records.filter(isSubstanceRecordCandidate));
}

function projectLegacyPublicMechanismRouteInput(
  records: unknown[],
): PublicMechanismRouteInput[] {
  return records.flatMap((record) =>
    isSubstanceRecordCandidate(record)
      ? [projectMechanismRouteInput(record)]
      : [],
  );
}

function selectPublicAboutPreviewSubstances(
  records: unknown[],
): PublicSubstanceArticleRecord[] {
  return parsePublicSubstanceRecords(records)
    .filter((substance) => substance.priority !== "low")
    .slice(0, ABOUT_PREVIEW_COUNT);
}

function warnAboutPreviewShortfall(
  selected: readonly PublicSubstanceArticleRecord[],
): void {
  if (selected.length < ABOUT_PREVIEW_COUNT) {
    console.warn(
      `[public-about] Exhausted the substance corpus with only ${selected.length} valid non-low preview candidates.`,
    );
  }
}

function projectLegacyPublicEffectPreviews(records: unknown[]): PublicEffectPreview[] {
  return projectPublicEffectPreviews(records.filter(isSubjectiveEffectRecordCandidate));
}

function projectLegacyPublicEffectCategoryPreviews(records: unknown[]): PublicEffectPreview[] {
  return records.filter(isSubjectiveEffectRecordCandidate).map(projectPublicEffectPreview);
}

function projectLegacyPublicEffectArticle(record: unknown): SubjectiveEffectDetailRecord | null {
  return isSubjectiveEffectDetailRecordCandidate(record) ? normalizePublicEffectArticle(record) : null;
}

function projectLegacyPublicEffectArticles(records: unknown[]): PublicEffectArticle[] {
  return records.flatMap((record) => {
    const article = projectLegacyPublicEffectArticle(record);
    return article ? [article] : [];
  });
}

const publicProjectionReadCompatibilityCatalog = {
  publicSubstanceLibraryInput: {
    functionName: "substanceIndex:getAll",
    args: () => ({}),
    project: projectLegacyPublicSubstanceLibraryRecords,
  },
  publicSubstanceCoverageInput: {
    functionName: "substanceIndex:getAll",
    args: () => ({}),
    project: projectLegacyPublicSubstanceCoverageRecords,
  },
  publicSubstanceMechanismRouteInput: {
    functionName: "substanceIndex:getAll",
    args: () => ({}),
    project: projectLegacyPublicMechanismRouteInput,
  },
  publicAboutPreviewSubstances: {
    functionName: "substanceIndex:getAll",
    args: () => ({}),
    project: selectPublicAboutPreviewSubstances,
  },
  publicSubstanceBySlug: {
    functionName: "substanceIndex:getBySlug",
    args: (slug: string) => ({ slug }),
    project: projectLegacyPublicSubstanceRecord,
  },
  publicSubstanceLookup: {
    functionName: "substanceIndex:getAll",
    args: () => ({}),
    project: projectLegacyPublicSubstanceLookup,
  },
  publicSubstancePreviews: {
    functionName: "substanceIndex:getAll",
    args: () => ({}),
    project: projectLegacyPublicSubstancePreviews,
  },
  publicEffectRecords: {
    functionName: "subjectiveEffects:getAll",
    args: () => ({}),
    project: projectLegacyPublicEffectPreviews,
  },
  publicEffectBySlug: {
    functionName: "subjectiveEffects:getBySlug",
    args: (slug: string) => ({ slug }),
    project: projectLegacyPublicEffectArticle,
  },
  publicEffectArticles: {
    functionName: "subjectiveEffects:getAll",
    args: () => ({}),
    project: projectLegacyPublicEffectArticles,
  },
  publicEffectsByCategory: {
    functionName: "subjectiveEffects:getByCategory",
    args: (category: string) => ({ category }),
    project: projectLegacyPublicEffectCategoryPreviews,
  },
} as const;

function isStalePublicProjectionReadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  // Convex may collapse "function missing on this deployment" into a generic Server Error.
  // This predicate is only used by the allowlisted compatibility catalog above.
  return message.includes("could not find public function") || message.includes("server error");
}

/**
 * Degradation guard for the additive Effect Index archive blog queries.
 *
 * Deliberately *not* `isStalePublicProjectionReadError`: that predicate exists for the
 * compatibility catalog's "try the new function name, fall back to the old one" flow,
 * where a wrong guess costs a second query. Here a wrong guess costs a silently empty
 * blog, and production Convex reports *every* failure — a missing function, a bad
 * argument, an internal error — as the same opaque `Server Error`. So the tolerance is
 * kept but made loud: the caller logs before degrading, and the blog post route stays
 * dynamic-params-enabled so a degraded build renders posts on demand instead of baking
 * a permanent 404 for every slug.
 */
function reportDegradedEffectIndexArchiveRead(scope: string, error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  if (
    !message.includes("could not find public function") &&
    !message.includes("server error")
  ) {
    return false;
  }

  console.warn(
    `[publicData] Effect Index archive read "${scope}" failed and degraded to empty. ` +
      `If effectIndexArchive:listPosts/getPostBySlug are deployed, this is a real Convex ` +
      `error and the blog output of this build is incomplete. Cause: ${error.message}`,
  );

  return true;
}

async function queryPublicProjectionRead<
  RawPrimaryResult,
  PublicResult,
  PrimaryArgs extends QueryArgs,
  RawFallbackResult,
  FallbackArgs extends QueryArgs,
>(
  query: QueryTransport,
  primary: { functionName: string; args: PrimaryArgs },
  projectPrimary: (result: RawPrimaryResult) => PublicResult,
  fallback?: PublicProjectionReadFallback<RawFallbackResult, PublicResult, FallbackArgs>,
): Promise<PublicResult> {
  try {
    return projectPrimary(await query<RawPrimaryResult, PrimaryArgs>(primary.functionName, primary.args));
  } catch (error) {
    if (!fallback || !isStalePublicProjectionReadError(error)) {
      throw error;
    }

    return fallback.project(
      await query<RawFallbackResult, FallbackArgs>(fallback.functionName, fallback.args()),
    );
  }
}

export function createConvexPublicDataReadAdapter(query: QueryTransport = queryConvex): PublicDataReadAdapter {
  return {
    getRawSubstances: () =>
      queryPublicProjectionRead(
        query,
        {
          functionName: publicDataReadCatalog.publicSubstanceLibraryInput.functionName,
          args: publicDataReadCatalog.publicSubstanceLibraryInput.args(),
        },
        parsePublicSubstanceLibraryInputRecords,
        publicProjectionReadCompatibilityCatalog.publicSubstanceLibraryInput,
      ),
    getPublicCoverageSubstances: () =>
      queryPublicProjectionRead(
        query,
        {
          functionName:
            publicDataReadCatalog.publicSubstanceCoverageInput.functionName,
          args: publicDataReadCatalog.publicSubstanceCoverageInput.args(),
        },
        parsePublicSubstanceRecords,
        publicProjectionReadCompatibilityCatalog.publicSubstanceCoverageInput,
      ),
    getPublicMechanismRouteInput: () =>
      queryPublicProjectionRead(
        query,
        {
          functionName:
            publicDataReadCatalog.publicSubstanceMechanismRouteInput
              .functionName,
          args:
            publicDataReadCatalog.publicSubstanceMechanismRouteInput.args(),
        },
        (records: PublicMechanismRouteInput[]) => records,
        publicProjectionReadCompatibilityCatalog
          .publicSubstanceMechanismRouteInput,
      ),
    getPublicAboutPreviewSubstances: async () => {
      const selected: PublicSubstanceArticleRecord[] = [];
      let cursor: string | undefined;

      try {
        while (selected.length < ABOUT_PREVIEW_COUNT) {
          const page = await query<{
            items: unknown[];
            cursor: string;
            isDone: boolean;
          }, { cursor?: string; limit: number }>(
            publicDataReadCatalog.publicAboutPreviewCandidates.functionName,
            publicDataReadCatalog.publicAboutPreviewCandidates.args(cursor),
          );
          const remaining = ABOUT_PREVIEW_COUNT - selected.length;
          selected.push(
            ...selectPublicAboutPreviewSubstances(page.items).slice(
              0,
              remaining,
            ),
          );

          if (selected.length === ABOUT_PREVIEW_COUNT) {
            return selected;
          }
          if (page.isDone) {
            warnAboutPreviewShortfall(selected);
            return selected;
          }

          if (!page.cursor || page.cursor === cursor) {
            throw new Error(
              "Public About preview pagination did not advance.",
            );
          }
          cursor = page.cursor;
        }
      } catch (error) {
        if (!isStalePublicProjectionReadError(error)) {
          throw error;
        }

        const fallback =
          publicProjectionReadCompatibilityCatalog
            .publicAboutPreviewSubstances;
        const fallbackResult = fallback.project(
          await query<unknown[]>(fallback.functionName, fallback.args()),
        );
        warnAboutPreviewShortfall(fallbackResult);
        return fallbackResult;
      }

      return selected;
    },
    getPublicCategoryLayout: () =>
      query<PublicCategoryLayout | null>(publicDataReadCatalog.publicCategoryLayout.functionName, {}),
    getPublicSubstanceLookup: () =>
      queryPublicProjectionRead(
        query,
        {
          functionName: publicDataReadCatalog.publicSubstanceLookup.functionName,
          args: publicDataReadCatalog.publicSubstanceLookup.args(),
        },
        (entries: PublicSubstanceLookupEntry[]) => entries,
        publicProjectionReadCompatibilityCatalog.publicSubstanceLookup,
      ),
    getPublicSubstancePreviews: () =>
      queryPublicProjectionRead(
        query,
        {
          functionName: publicDataReadCatalog.publicSubstancePreviews.functionName,
          args: publicDataReadCatalog.publicSubstancePreviews.args(),
        },
        (entries: PublicSubstancePreview[]) => entries,
        publicProjectionReadCompatibilityCatalog.publicSubstancePreviews,
      ),
    getPublicSubstanceBySlug: (slug) =>
      queryPublicProjectionRead(
        query,
        {
          functionName: publicDataReadCatalog.publicSubstanceBySlug.functionName,
          args: publicDataReadCatalog.publicSubstanceBySlug.args(slug),
        },
        (substance: unknown | null) => (substance ? parsePublicSubstanceRecord(substance) : null),
        {
          ...publicProjectionReadCompatibilityCatalog.publicSubstanceBySlug,
          args: () => publicProjectionReadCompatibilityCatalog.publicSubstanceBySlug.args(slug),
        },
      ),
    getPublicEffects: async () =>
      queryPublicProjectionRead(
        query,
        {
          functionName: publicDataReadCatalog.publicEffectRecords.functionName,
          args: publicDataReadCatalog.publicEffectRecords.args(),
        },
        projectPublicEffectPreviews,
        publicProjectionReadCompatibilityCatalog.publicEffectRecords,
      ),
    getPublicEffectBySlug: (slug) =>
      queryPublicProjectionRead(
        query,
        {
          functionName: publicDataReadCatalog.publicEffectBySlug.functionName,
          args: publicDataReadCatalog.publicEffectBySlug.args(slug),
        },
        (effect: SubjectiveEffectDetailRecord | null) => (effect ? normalizePublicEffectArticle(effect) : null),
        {
          ...publicProjectionReadCompatibilityCatalog.publicEffectBySlug,
          args: () => publicProjectionReadCompatibilityCatalog.publicEffectBySlug.args(slug),
        },
      ),
    getPublicEffectArticles: () =>
      queryPublicProjectionRead(
        query,
        {
          functionName: publicDataReadCatalog.publicEffectArticles.functionName,
          args: publicDataReadCatalog.publicEffectArticles.args(),
        },
        normalizePublicEffectArticles,
        publicProjectionReadCompatibilityCatalog.publicEffectArticles,
      ),
    getPublicEffectsByCategory: async (category) =>
      queryPublicProjectionRead(
        query,
        {
          functionName: publicDataReadCatalog.publicEffectsByCategory.functionName,
          args: publicDataReadCatalog.publicEffectsByCategory.args(category),
        },
        (effects: SubjectiveEffectRecord[]) => effects.map(projectPublicEffectPreview),
        {
          ...publicProjectionReadCompatibilityCatalog.publicEffectsByCategory,
          args: () => publicProjectionReadCompatibilityCatalog.publicEffectsByCategory.args(category),
        },
      ),
    getPublicEffectIndexArticles: async () =>
      normalizePublicEffectIndexArticles(
        await query<unknown[]>(
          publicDataReadCatalog.publicEffectIndexArticles.functionName,
          publicDataReadCatalog.publicEffectIndexArticles.args(),
        ),
      ),
    getPublishedEffectIndexArticles: async () =>
      normalizePublicEffectIndexArticles(
        await query<unknown[]>(
          publicDataReadCatalog.publicEffectIndexArticles.functionName,
          publicDataReadCatalog.publicEffectIndexArticles.args(),
        ),
      ).filter((article) => article.publication_status === "published"),
    getPublicEffectIndexArticleBySlug: async (slug) =>
      normalizePublicEffectIndexArticle(
        await query<unknown | null, { slug: string }>(
          publicDataReadCatalog.publicEffectIndexArticleBySlug.functionName,
          publicDataReadCatalog.publicEffectIndexArticleBySlug.args(slug),
        ),
      ),
    // The archive blog queries are additive and only reached on the Effect Index build.
    // A deployment that predates them degrades to an empty blog rather than failing a
    // build whose `generateStaticParams` runs against production Convex — but it says so
    // in the build log, because production cannot distinguish "not deployed" from a real
    // failure. See `reportDegradedEffectIndexArchiveRead`.
    getPublicEffectIndexPosts: async () => {
      try {
        return projectPublicEffectIndexPosts(
          await query<unknown[]>(
            publicDataReadCatalog.publicEffectIndexPosts.functionName,
            publicDataReadCatalog.publicEffectIndexPosts.args(),
          ),
        );
      } catch (error) {
        if (reportDegradedEffectIndexArchiveRead("listPosts", error)) {
          return [];
        }
        throw error;
      }
    },
    getPublicEffectIndexPostBySlug: async (slug) => {
      try {
        return projectPublicEffectIndexPost(
          await query<unknown | null, { slug: string }>(
            publicDataReadCatalog.publicEffectIndexPostBySlug.functionName,
            publicDataReadCatalog.publicEffectIndexPostBySlug.args(slug),
          ),
        );
      } catch (error) {
        if (reportDegradedEffectIndexArchiveRead(`getPostBySlug(${slug})`, error)) {
          return null;
        }
        throw error;
      }
    },
    getPublicReplicationsByEffect: (effectSlug) =>
      query<ReplicationWithUrl[], { effect_slug: string }>(
        publicDataReadCatalog.publicReplicationsByEffect.functionName,
        publicDataReadCatalog.publicReplicationsByEffect.args(effectSlug),
      ),
    getPublicReplications: async () => {
      // The cross-effect gallery query is additive; tolerate a deployment that
      // predates it by degrading to an empty gallery rather than failing the
      // public /effects render.
      try {
        return await query<GalleryReplication[]>(publicDataReadCatalog.publicReplications.functionName, {});
      } catch (error) {
        if (isStalePublicProjectionReadError(error)) {
          return [];
        }
        throw error;
      }
    },
    getPublicTripReportRecords: () =>
      query<TripReportRecord[]>(publicDataReadCatalog.publicTripReportRecords.functionName, {}),
    getPublicTripReportBySlug: (slug) =>
      query<TripReportDetailRecord | null, { slug: string }>(
        publicDataReadCatalog.publicTripReportBySlug.functionName,
        publicDataReadCatalog.publicTripReportBySlug.args(slug),
      ),
    getPublicTripReportsByAuthor: (authorName) =>
      query<TripReportRecord[], { authorName: string }>(
        publicDataReadCatalog.publicTripReportsByAuthor.functionName,
        publicDataReadCatalog.publicTripReportsByAuthor.args(authorName),
      ),
    getPublicTripReportsByContributor: (profileKey, authorNames) =>
      query<TripReportRecord[], { profileKey: string; authorNames: string[] }>(
        publicDataReadCatalog.publicTripReportsByContributor.functionName,
        publicDataReadCatalog.publicTripReportsByContributor.args(profileKey, authorNames),
      ),
    getPublicTripReportsBySubstanceNames: (substanceNames) =>
      query<TripReportDetailRecord[], { substanceNames: string[] }>(
        publicDataReadCatalog.publicTripReportsBySubstanceNames.functionName,
        publicDataReadCatalog.publicTripReportsBySubstanceNames.args(substanceNames),
      ),
    getPublicContributorProfiles: () =>
      query<NormalizedUserProfile[]>(publicDataReadCatalog.publicContributorProfiles.functionName, {}),
    getPublicAboutConfig: () => query<AboutConfigRecord | null>(publicDataReadCatalog.publicAboutConfig.functionName, {}),
    getPublicIndexLayoutByType: (type) =>
      query<IndexLayoutRecord | null, { type: IndexLayoutType }>(
        publicDataReadCatalog.publicIndexLayoutByType.functionName,
        publicDataReadCatalog.publicIndexLayoutByType.args(type),
      ),
  };
}

const defaultPublicDataReadAdapter = createConvexPublicDataReadAdapter();

let publicDataReadAdapter: PublicDataReadAdapter = defaultPublicDataReadAdapter;

export function getPublicDataReadAdapter(): PublicDataReadAdapter {
  return publicDataReadAdapter;
}

export function setPublicDataReadAdapterForTest(adapter: PublicDataReadAdapter) {
  publicDataReadAdapter = adapter;
}

export function resetPublicDataReadAdapterForTest() {
  publicDataReadAdapter = defaultPublicDataReadAdapter;
}

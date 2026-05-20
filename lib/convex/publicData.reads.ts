import "server-only";

import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { ReplicationWithUrl } from "../../src/types/replications";
import {
  priorityScore,
  trimExcerpt,
  type AboutConfigRecord,
  type IndexLayoutRecord,
  type IndexLayoutType,
  type PublicCategoryLayout,
  type PublicEffectArticle,
  type PublicEffectPreview,
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
import { queryConvex } from "./serverClient";

type QueryArgs = Record<string, unknown>;
type QueryTransport = <Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args,
) => Promise<Result>;

export const publicDataReadCatalog = {
  rawSubstances: { functionName: "substanceIndex:getAll", args: () => ({}) },
  publicCategoryLayout: { functionName: "categoryLayout:get", args: () => ({}) },
  publicSubstanceBySlug: { functionName: "substanceIndex:getBySlug", args: (slug: string) => ({ slug }) },
  publicEffectRecords: { functionName: "subjectiveEffects:getAll", args: () => ({}) },
  publicEffectBySlug: { functionName: "subjectiveEffects:getBySlug", args: (slug: string) => ({ slug }) },
  publicEffectsByCategory: { functionName: "subjectiveEffects:getByCategory", args: (category: string) => ({ category }) },
  publicReplicationsByEffect: {
    functionName: "replications:getReplicationsByEffect",
    args: (effectSlug: string) => ({ effect_slug: effectSlug }),
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
  getPublicCategoryLayout(): Promise<PublicCategoryLayout | null>;
  getPublicSubstanceLookup(): Promise<PublicSubstanceLookupEntry[]>;
  getPublicSubstancePreviews(): Promise<PublicSubstancePreview[]>;
  getPublicSubstanceBySlug(slug: string): Promise<PublicSubstanceRecord | null>;
  getPublicEffects(): Promise<PublicEffectPreview[]>;
  getPublicEffectBySlug(slug: string): Promise<SubjectiveEffectDetailRecord | null>;
  getPublicEffectArticles(): Promise<PublicEffectArticle[]>;
  getPublicEffectsByCategory(category: string): Promise<PublicEffectPreview[]>;
  getPublicReplicationsByEffect(effectSlug: string): Promise<ReplicationWithUrl[]>;
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

type SubstancePriority = PublicSubstancePreview["priority"];

const slugifySubstanceTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeSubstancePriority = (priority: SubstanceRecord["priority"]): SubstancePriority =>
  priority === "high" || priority === "low" || priority === "normal" ? priority : "normal";

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
  return {
    id: substance.id,
    title: substance.title,
    slug: resolveSubstanceSlug(substance),
    priority: normalizeSubstancePriority(substance.priority),
    index_categories: substance.index_categories,
    identification: substance.identification,
    classification: substance.classification,
    summary: substance.summary,
    dosage: substance.dosage,
    duration: substance.duration,
    subjective_effects: substance.subjective_effects,
    comparisons: substance.comparisons,
    pharmacology: substance.pharmacology,
    interactions: substance.interactions,
    reagent_testing: substance.reagent_testing,
    tolerance: substance.tolerance,
    harm_potential: substance.harm_potential,
    history_culture: substance.history_culture,
    legality: substance.legality,
    references: substance.references,
    source_citations: substance.source_citations,
    citations: substance.citations,
  };
}

export function projectPublicSubstanceRecord(substance: SubstanceRecord): PublicSubstanceRecord {
  const { editorial_review: _editorialReview, ...publicSubstance } = substance;

  return {
    ...publicSubstance,
    slug: resolveSubstanceSlug(substance),
    priority: normalizeSubstancePriority(substance.priority),
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

export function createConvexPublicDataReadAdapter(query: QueryTransport = queryConvex): PublicDataReadAdapter {
  return {
    getRawSubstances: () =>
      query<SubstanceRecord[]>(publicDataReadCatalog.rawSubstances.functionName, {}).then((substances) =>
        substances.map(projectPublicSubstanceLibraryRecord),
      ),
    getPublicCategoryLayout: () =>
      query<PublicCategoryLayout | null>(publicDataReadCatalog.publicCategoryLayout.functionName, {}),
    getPublicSubstanceLookup: () =>
      query<SubstanceRecord[]>(publicDataReadCatalog.rawSubstances.functionName, {}).then((substances) =>
        substances.map(projectPublicSubstanceLookup),
      ),
    getPublicSubstancePreviews: () =>
      query<SubstanceRecord[]>(publicDataReadCatalog.rawSubstances.functionName, {}).then(projectPublicSubstancePreviews),
    getPublicSubstanceBySlug: (slug) =>
      query<SubstanceRecord | null, { slug: string }>(
        publicDataReadCatalog.publicSubstanceBySlug.functionName,
        publicDataReadCatalog.publicSubstanceBySlug.args(slug),
      ).then((substance) => (substance ? projectPublicSubstanceRecord(substance) : null)),
    getPublicEffects: async () =>
      projectPublicEffectPreviews(
        await query<SubjectiveEffectRecord[]>(publicDataReadCatalog.publicEffectRecords.functionName, {}),
      ),
    getPublicEffectBySlug: (slug) =>
      query<SubjectiveEffectDetailRecord | null, { slug: string }>(
        publicDataReadCatalog.publicEffectBySlug.functionName,
        publicDataReadCatalog.publicEffectBySlug.args(slug),
      ),
    getPublicEffectArticles: () =>
      query<PublicEffectArticle[]>(publicDataReadCatalog.publicEffectRecords.functionName, {}),
    getPublicEffectsByCategory: async (category) =>
      (
        await query<SubjectiveEffectRecord[], { category: string }>(
          publicDataReadCatalog.publicEffectsByCategory.functionName,
          publicDataReadCatalog.publicEffectsByCategory.args(category),
        )
      ).map(projectPublicEffectPreview),
    getPublicReplicationsByEffect: (effectSlug) =>
      query<ReplicationWithUrl[], { effect_slug: string }>(
        publicDataReadCatalog.publicReplicationsByEffect.functionName,
        publicDataReadCatalog.publicReplicationsByEffect.args(effectSlug),
      ),
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

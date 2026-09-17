/**
 * The reads locale routes use in place of the English public reads: the cached
 * English record composed with every stored translation. The composition is
 * request-cached only; the `/zh/...` pages are ISR and every publication
 * revalidates its locale paths alongside the English ones.
 */
import "server-only";

import { cache } from "react";

import type { PublicEffectIndexArticle, PublicSubstanceRecord } from "@server/data/publicData.shared";
import {
  getEffectArticlesByContributor,
  getPublicEffectBySlug,
  getPublicContributorByKey,
  getPublicContributorProfiles,
  getPublicReportDetailsByContributor,
  getPublicContributorIdentities,
  getReportsByContributor,
  getPublicEffectIndexArticleBySlug,
  getPublicEffects,
  getPublicGalleryReplicationBySlug,
  getPublicGalleryReplications,
  getPublicReplicationBySlug,
  getPublicReportBySlug,
  getPublicReports,
  type PublicEffectPreview,
  type PublicReportPreview,
  type SubjectiveEffectDetailRecord,
  type TripReportDetailRecord,
} from "@server/data/publicData";
import { profileMatchesName } from "../contributorProfileIdentity";
import { projectPublicReportPreviews } from "../data/publicData.reportProfileProjection";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { ContributorEffectCredit } from "../../src/types/effectCredits";
import { getTripReportExcerpt } from "../../src/types/tripReport";
import { getPublicSubstanceBySlug } from "@server/data/publicData.substances";
import { segmentHash } from "../../scripts/translation/segment-manifest.mjs";
import type { PublicGalleryReplicationPreview, ReplicationWithUrl } from "../../src/types/replications";
import { localizeRecord, localizeRecords } from "./liveTranslation";
import { readTranslations } from "./segmentStore";
import type { ArticleIndexEntry } from "../../src/features/articles/domain/articlesIndex";
import { getPostgresClient } from "../postgres/runtime/backend";
import { readLocalizedPublicationIndex } from "./publicationIndexStore";

/**
 * Resolve stored translations for a small set of independent reader-facing
 * strings. Search uses this after ranking the English index so translated
 * labels do not change relevance and Latin queries keep working.
 */
export async function getLocalizedLeaves(
  values: readonly string[],
  locale: string,
): Promise<Map<string, string>> {
  const unique = [...new Set(values.filter((value) => value.trim().length > 0))];
  if (locale === "en" || unique.length === 0) {
    return new Map(unique.map((value) => [value, value]));
  }
  const hashes = unique.map((value) => segmentHash(value));
  const translations = await readTranslations(locale, hashes);
  return new Map(
    unique.map((value, index) => [value, translations.get(hashes[index]) ?? value]),
  );
}

/** Content identity for process-local projections of these exact source leaves. */
export async function getLocalizedLeavesRevision(locale: string, hashes: readonly string[]): Promise<string> {
  if (hashes.length === 0 || locale === "en") return "empty";
  const rows = await getPostgresClient().sql<{ revision: string | null }>(
    'SELECT md5(jsonb_agg(jsonb_build_array("hash", "target") ORDER BY "hash")::text) AS revision FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])',
    [locale, hashes],
  );
  return rows[0]?.revision ?? "empty";
}

export const getLocalizedPublicSubstanceBySlug = cache(async (
  slug: string,
  locale: string,
): Promise<PublicSubstanceRecord | null> => {
  const substance = await getPublicSubstanceBySlug(slug);
  if (!substance) return null;
  const localized = await localizeRecord({ ...substance, slug }, locale, "article");
  return localized.record;
});


export const getLocalizedPublicEffectBySlug = cache(async (
  effectSlug: string,
  locale: string,
): Promise<SubjectiveEffectDetailRecord | null> => {
  const effect = await getPublicEffectBySlug(effectSlug);
  if (!effect) return null;
  const localized = await localizeRecord({ ...effect, slug: effectSlug }, locale, "effect");
  return localized.record;
});

export const getLocalizedPublicReportBySlug = cache(async (
  slug: string,
  locale: string,
): Promise<TripReportDetailRecord | null> => {
  const report = await getPublicReportBySlug(slug);
  if (!report) return null;
  const localized = await localizeRecord({ ...report, slug }, locale, "report");
  return localized.record;
});

/** One public contributor profile with only its self-authored bio localized. */
export const getLocalizedPublicContributorByKey = cache(async (
  key: string,
  locale: string,
): Promise<NormalizedUserProfile | null> => {
  const profile = await getPublicContributorByKey(key);
  if (!profile) return null;
  const localized = await localizeRecord(
    { slug: profile.key, bio: profile.bio },
    locale,
    "profile",
  );
  return { ...profile, bio: localized.record.bio };
});

/** Public contributor profiles with localized bios for lists and profile joins. */
export const getLocalizedPublicContributorProfiles = cache(async (
  locale: string,
): Promise<NormalizedUserProfile[]> => {
  const profiles = await getPublicContributorProfiles();
  if (profiles.length === 0) return profiles;
  const localized = await localizeRecords(
    profiles.map((profile) => ({ slug: profile.key, bio: profile.bio })),
    locale,
    "profile",
  );
  const bioByKey = new Map(localized.records.map(({ slug, bio }) => [slug, bio]));
  return profiles.map((profile) => ({
    ...profile,
    bio: bioByKey.get(profile.key) ?? profile.bio,
  }));
});

/** The reports-index read: every report preview with its stored segments spliced in. */
export const getLocalizedPublicReports = cache(async (
  locale: string,
): Promise<PublicReportPreview[]> => {
  const reports = await getPublicReports();
  if (reports.length === 0) return reports;
  const localized = await localizeRecords(reports, locale, "report");
  return localized.records;
});

/** The effects-index read: every effect preview with its stored segments spliced in. */
export const getLocalizedPublicEffects = cache(async (
  locale: string,
): Promise<PublicEffectPreview[]> => {
  const effects = await getPublicEffects();
  if (effects.length === 0) return effects;
  const localized = await localizeRecords(effects, locale, "effect");
  return localized.records;
});

/** One library article with its stored segments spliced in; blog rows pass through for the loader to refuse. */
export const getLocalizedPublicArticleBySlug = cache(async (
  slug: string,
  locale: string,
): Promise<PublicEffectIndexArticle | null> => {
  const article = await getPublicEffectIndexArticleBySlug(slug);
  if (!article) return null;
  const localized = await localizeRecord({ ...article, slug }, locale, "library");
  return localized.record;
});

/** The library index reads producer-owned metadata, never full narrative bodies. */
export const getLocalizedPublicArticles = cache(async (
  locale: string,
): Promise<ArticleIndexEntry[]> => {
  return getPostgresClient().sqlTransaction((client) => readLocalizedPublicationIndex(client, locale));
});

/** The gallery-index read: every published replication preview with its stored title spliced in. */
export const getLocalizedPublicGalleryReplications = cache(async (
  locale: string,
): Promise<PublicGalleryReplicationPreview[]> => {
  const replications = await getPublicGalleryReplications();
  if (replications.length === 0) return replications;
  const localized = await localizeRecords(replications, locale, "replication");
  return localized.records;
});

/** One gallery preview for a viewer deep link, with its stored title spliced in. */
export const getLocalizedPublicGalleryReplicationBySlug = cache(async (
  slug: string,
  locale: string,
): Promise<PublicGalleryReplicationPreview | null> => {
  const replication = await getPublicGalleryReplicationBySlug(slug);
  if (!replication) return null;
  const localized = await localizeRecord(replication, locale, "replication");
  return localized.record;
});

/** The permalink read: the full replication record with its stored title spliced in. */
export const getLocalizedPublicReplicationBySlug = cache(async (
  slug: string,
  locale: string,
): Promise<ReplicationWithUrl | null> => {
  const replication = await getPublicReplicationBySlug(slug);
  if (!replication) return null;
  const localized = await localizeRecord(replication, locale, "replication");
  return localized.record;
});

/** Localize already canonically joined contributor works without changing credit identity. */
export async function localizeContributorReplications(
  replications: readonly ReplicationWithUrl[],
  locale: string,
): Promise<ReplicationWithUrl[]> {
  if (replications.length === 0) return [];
  const localized = await localizeRecords([...replications], locale, "replication");
  return localized.records;
}

/** Join on canonical report identity, localize details, then derive contributor cards. */
export const getLocalizedReportsByContributor = cache(async (
  profile: NormalizedUserProfile,
  locale: string,
): Promise<PublicReportPreview[]> => {
  const [reports, profiles, previews] = await Promise.all([
    getPublicReportDetailsByContributor(profile),
    getPublicContributorIdentities(),
    getReportsByContributor(profile),
  ]);
  const joined = reports.filter((report) => {
    const reportProfileKey = report.subject.profile_key?.trim().toUpperCase() ?? "";
    if (reportProfileKey && reportProfileKey === profile.key.trim().toUpperCase()) return true;
    return !report.attribution_locked && profileMatchesName(profile, report.subject.name);
  });
  if (joined.length === 0) return [];
  const localized = await localizeRecords(joined, locale, "report");
  const publishedAtBySlug = new Map(previews.map((preview) => [preview.slug, preview.publishedAt]));
  return projectPublicReportPreviews(
    localized.records.map((report) => ({
      ...report,
      excerpt: getTripReportExcerpt(report),
      published_at: publishedAtBySlug.get(report.slug),
    })),
    profiles,
    { fallbackAuthorProfileKey: profile.key },
  );
});

/** Join credits by canonical effect slug, then project only localized display fields. */
export const getLocalizedEffectArticlesByContributor = cache(async (
  profile: NormalizedUserProfile,
  locale: string,
): Promise<ContributorEffectCredit[]> => {
  const joined = await getEffectArticlesByContributor(profile);
  if (joined.length === 0) return [];
  const localized = await localizeRecords(joined, locale, "effect");
  return localized.records
    .map((effect) => ({ slug: effect.slug, name: effect.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
});

/**
 * English effect names to their stored translations, for the surfaces that
 * print an effect's name beside a replication: showcase chips and captions,
 * viewer subjects, the permalink's "Represents" line. An effect's name is the
 * `name` leaf of its record, so this reads the row the effect heading renders
 * from and the chip can never disagree with the article. A name the store
 * lacks maps to itself; English asks the store nothing.
 */
export async function getLocalizedEffectNames(
  names: readonly string[],
  locale: string,
): Promise<Map<string, string>> {
  const unique = [...new Set(names)];
  if (locale === "en" || unique.length === 0) return new Map(unique.map((name) => [name, name]));
  const hashes = unique.map((name) => segmentHash(name));
  const translations = await readTranslations(locale, hashes);
  return new Map(unique.map((name, index) => [name, translations.get(hashes[index]) ?? name]));
}
/**
 * The reads locale routes use in place of the English public reads: the cached
 * English record composed with every stored translation. The composition is
 * request-cached only; the `/zh/...` pages are ISR and every publication
 * revalidates its locale paths alongside the English ones.
 */
import "server-only";

import { cache } from "react";

import type { PublicEffectArticle, PublicEffectIndexArticle, PublicSubstanceRecord } from "@server/convex/publicData.shared";
import {
  getPublicEffectArticles,
  getPublicEffectBySlug,
  getPublicEffectIndexArticleBySlug,
  getPublicEffects,
  getPublicGalleryReplicationBySlug,
  getPublicGalleryReplications,
  getPublicReplicationBySlug,
  getPublicReportBySlug,
  getPublicReports,
  getPublishedEffectIndexArticles,
  type PublicEffectPreview,
  type PublicReportPreview,
  type SubjectiveEffectDetailRecord,
  type TripReportDetailRecord,
} from "@server/convex/publicData";
import { getPublicSubstanceBySlug } from "@server/convex/publicData.substances";
import type { PublicGalleryReplicationPreview, ReplicationWithUrl } from "../../src/types/replications";
import { localizeRecord, localizeRecords } from "./liveTranslation";

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

/** Every full effect record with its stored segments spliced in, audio clips included. */
export const getLocalizedPublicEffectArticles = cache(async (
  locale: string,
): Promise<PublicEffectArticle[]> => {
  const effects = await getPublicEffectArticles();
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

/** The library-index read: every published article with its stored segments spliced in. */
export const getLocalizedPublicArticles = cache(async (
  locale: string,
): Promise<PublicEffectIndexArticle[]> => {
  const articles = await getPublishedEffectIndexArticles();
  if (articles.length === 0) return articles;
  const localized = await localizeRecords(articles, locale, "library");
  return localized.records;
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
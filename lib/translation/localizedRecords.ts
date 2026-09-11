/**
 * The reads locale routes use in place of the English public reads: the cached
 * English record composed with every stored translation. The composition is
 * request-cached only; the `/zh/...` pages are ISR and every publication
 * revalidates its locale paths alongside the English ones.
 */
import "server-only";

import { cache } from "react";

import type { PublicSubstanceRecord } from "@server/convex/publicData.shared";
import {
  getPublicEffectBySlug,
  getPublicEffects,
  getPublicReportBySlug,
  getPublicReports,
  type PublicEffectPreview,
  type PublicReportPreview,
  type SubjectiveEffectDetailRecord,
  type TripReportDetailRecord,
} from "@server/convex/publicData";
import { getPublicSubstanceBySlug } from "@server/convex/publicData.substances";
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
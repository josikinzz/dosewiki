import "server-only";

import { publicDataCache } from "./publicData.cache"
import { cache } from "react";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicContributorProfiles } from "./publicData.contributors";
import {
  projectPublicReportDetail,
  projectPublicReportDetails,
  projectPublicReportPreviews,
} from "./publicData.reportProfileProjection";
import { profileMatchesName } from "../contributorProfileIdentity";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicReportPreview, TripReportDetailRecord, TripReportRecord } from "./publicData.shared";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

function reportBelongsToContributor(report: TripReportRecord, profile: NormalizedUserProfile): boolean {
  const profileKey = profile.key.trim().toUpperCase();
  const reportProfileKey =
    typeof report.subject.profile_key === "string" ? report.subject.profile_key.trim().toUpperCase() : "";

  if (reportProfileKey && reportProfileKey === profileKey) {
    return true;
  }

  if (report.attribution_locked) {
    return false;
  }

  return profileMatchesName(profile, report.subject.name);
}


/*
 * Persisted reads are the leaf Convex calls below, each a top-level
 * `unstable_cache`. The exported reads compose one leaf with
 * `getPublicContributorProfiles` (itself a top-level `unstable_cache` in
 * `publicData.contributors`) under React `cache()` for request dedupe only.
 * They used to be `unstable_cache` wrappers around that composition, and Next
 * bypasses any `unstable_cache` reached from inside another one, so the
 * contributor profile read was refetched from Convex on every miss of every
 * report read instead of being shared across them.
 */

const getPublicTripReportPreviewRecords = cache(publicDataCache(async (): Promise<TripReportRecord[]> => {
  return await getPublicDataReadAdapter().getPublicTripReportPreviews();
}, ["convex-public-trip-report-preview-records-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reports],
}));

const getPublicTripReportDetailRecords = cache(publicDataCache(async (): Promise<TripReportDetailRecord[]> => {
  return await getPublicDataReadAdapter().getPublicTripReportRecords();
}, ["convex-public-trip-report-detail-records-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reports],
}));

const getPublicTripReportRecordBySlug = cache(publicDataCache(async (
  slug: string,
): Promise<TripReportDetailRecord | null> => {
  return await getPublicDataReadAdapter().getPublicTripReportBySlug(slug);
}, ["convex-public-trip-report-record-by-slug-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reports],
}));


const getPublicTripReportRecordsBySubstanceNames = cache(publicDataCache(async (
  substanceNames: string[],
): Promise<TripReportDetailRecord[]> => {
  return await getPublicDataReadAdapter().getPublicTripReportsBySubstanceNames(substanceNames);
}, ["convex-public-trip-report-records-by-substance-names-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reports],
}));

export const getPublicReports = cache(async (): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicTripReportPreviewRecords(),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportPreviews(reports, profiles);
});

export const getFeaturedReports = cache(async (limit = 8) => {
  return (await getPublicReports()).slice(0, limit);
});

/**
 * Every published trip report as a full detail record, contributor-projected
 * like the permalink read, for the public open-data download. Only rows from
 * the published `tripReports` table are read; submissions never appear here.
 */
export const getPublicReportDetails = cache(async (): Promise<TripReportDetailRecord[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicTripReportDetailRecords(),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportDetails(reports, profiles);
});

export const getPublicReportBySlug = cache(async (slug: string): Promise<TripReportDetailRecord | null> => {
  const [report, profiles] = await Promise.all([
    getPublicTripReportRecordBySlug(slug),
    getPublicContributorProfiles(),
  ]);

  if (!report) {
    return null;
  }

  return projectPublicReportDetail(report, profiles);
});

export const getReportsByAuthor = cache(async (authorName: string): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicTripReportPreviewRecords(),
    getPublicContributorProfiles(),
  ]);
  const lowerName = authorName.toLowerCase();

  return projectPublicReportPreviews(
    reports.filter((report) => report.subject.name.toLowerCase() === lowerName),
    profiles,
  );
});

export const getReportsByContributor = cache(async (profile: NormalizedUserProfile): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicTripReportPreviewRecords(),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportPreviews(
    reports.filter((report) => reportBelongsToContributor(report, profile)),
    profiles,
    { fallbackAuthorProfileKey: profile.key },
  );
});

export const getPublicReportsBySubstanceNames = cache(async (substanceNames: string[]) => {
  if (substanceNames.length === 0) {
    return [];
  }

  const [reports, profiles] = await Promise.all([
    getPublicTripReportRecordsBySubstanceNames(substanceNames),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportDetails(reports, profiles);
});

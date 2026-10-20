import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "./publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS } from "./publicData.cacheTags";
import { cache } from "react";
import { getPublicContributorIdentities } from "./publicData.contributors";
import {
  projectPublicReportDetail,
  projectPublicReportDetails,
  projectPublicReportPreviews,
} from "./publicData.reportProfileProjection";
import { contributorMatchNames, profileMatchesName } from "../contributorProfileIdentity";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicReportPreview, TripReportDetailRecord, TripReportRecord } from "./publicData.shared";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { getTripReportExcerpt } from "../../src/types/tripReport";

function reportBelongsToContributor(report: Pick<TripReportRecord, "subject" | "attribution_locked">, profile: NormalizedUserProfile): boolean {
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

const getPublicTripReportPreviewRecords = cache(publicDataCache(async (): Promise<TripReportRecord[]> => {
  return await getPublicDataReadAdapter().getPublicTripReportPreviews();
}, ["data-public-trip-report-preview-records-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.reports],
}));

export const getPublicReportSearchSummaries = cache(publicDataCache(async (): Promise<Array<{
  slug: string;
  title: string;
  introduction?: string;
}>> => {
  return await getPublicDataReadAdapter().getPublicReportSearchSummaries();
}, ["data-public-report-search-summaries-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.reports],
}));

const getPublicTripReportDetailRecords = cache(publicDataCache(async (): Promise<TripReportDetailRecord[]> => {
  return await getPublicDataReadAdapter().getPublicTripReportRecords();
}, ["data-public-trip-report-detail-records-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.reports],
}));

const getPublicTripReportRecordBySlug = cache(publicDataCache(async (
  slug: string,
): Promise<TripReportDetailRecord | null> => {
  return await getPublicDataReadAdapter().getPublicTripReportBySlug(slug);
}, ["data-public-trip-report-record-by-slug-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.reports],
}));


const getPublicTripReportRecordsBySubstanceNames = cache(publicDataCache(async (
  substanceNames: string[],
): Promise<TripReportRecord[]> => {
  return await getPublicDataReadAdapter().getPublicTripReportsBySubstanceNames(substanceNames);
}, ["data-public-trip-report-previews-by-substance-names-v2"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.reports],
}));

export const getPublicReports = cache(async (): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicTripReportPreviewRecords(),
    getPublicContributorIdentities(),
  ]);

  return projectPublicReportPreviews(reports, profiles);
});

export const getPublicReportDetails = cache(async (): Promise<TripReportDetailRecord[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicTripReportDetailRecords(),
    getPublicContributorIdentities(),
  ]);

  return projectPublicReportDetails(reports, profiles);
});

export const getPublicReportBySlug = cache(async (slug: string): Promise<TripReportDetailRecord | null> => {
  const report = await getPublicTripReportRecordBySlug(slug);

  if (!report) {
    return null;
  }
  const profiles = await getPublicContributorIdentities();

  return projectPublicReportDetail(report, profiles);
});

const getPublicContributorReportRecords = cache(publicDataCache(
  async (profileKey: string, names: string[]) =>
    getPublicDataReadAdapter().getPublicTripReportsByContributor(profileKey, names),
  ["data-public-contributor-report-records"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.reports],
  },
));

export const getPublicReportDetailsByContributor = cache(async (profile: NormalizedUserProfile) => {
  const reports = await getPublicContributorReportRecords(profile.key, contributorMatchNames(profile));
  if (reports.length === 0) return [];
  return projectPublicReportDetails(reports, await getPublicContributorIdentities());
});
export const getReportsByContributor = cache(async (profile: NormalizedUserProfile): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicContributorReportRecords(profile.key, contributorMatchNames(profile)),
    getPublicContributorIdentities(),
  ]);

  return projectPublicReportPreviews(
    reports.filter((report) => reportBelongsToContributor(report, profile))
      .map((report) => ({ ...report, excerpt: getTripReportExcerpt(report) })),
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
    getPublicContributorIdentities(),
  ]);

  return projectPublicReportPreviews(reports, profiles);
});

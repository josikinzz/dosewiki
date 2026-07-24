import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicContributorProfiles } from "./publicData.contributors";
import {
  getContributorReportAuthorNames,
  projectPublicReportDetail,
  projectPublicReportDetails,
  projectPublicReportPreviews,
} from "./publicData.reportProfileProjection";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicReportPreview, TripReportDetailRecord, TripReportRecord } from "./publicData.shared";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

function normalizeContributorMatch(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function reportBelongsToContributor(report: TripReportRecord, profile: NormalizedUserProfile): boolean {
  const profileKey = profile.key.trim().toUpperCase();
  const reportProfileKey =
    typeof report.subject.profile_key === "string" ? report.subject.profile_key.trim().toUpperCase() : "";

  if (reportProfileKey && reportProfileKey === profileKey) {
    return true;
  }

  const authorNames = new Set(
    getContributorReportAuthorNames(profile).map(normalizeContributorMatch).filter(Boolean),
  );
  return authorNames.has(normalizeContributorMatch(report.subject.name));
}

export const getPublicReports = cache(unstable_cache(async (): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicDataReadAdapter().getPublicTripReportRecords(),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportPreviews(reports, profiles);
}, ["convex-public-report-previews"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reports, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));

export const getFeaturedReports = cache(async (limit = 8) => {
  return (await getPublicReports()).slice(0, limit);
});

export const getPublicReportBySlug = cache(unstable_cache(async (slug: string): Promise<TripReportDetailRecord | null> => {
  const [report, profiles] = await Promise.all([
    getPublicDataReadAdapter().getPublicTripReportBySlug(slug),
    getPublicContributorProfiles(),
  ]);

  if (!report) {
    return null;
  }

  return projectPublicReportDetail(report, profiles);
}, ["convex-public-report-by-slug"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reports, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));

export const getReportsByAuthor = cache(unstable_cache(async (authorName: string): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicDataReadAdapter().getPublicTripReportsByAuthor(authorName),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportPreviews(reports, profiles);
}, ["convex-public-reports-by-author"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reports, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));

export const getReportsByContributor = cache(unstable_cache(async (profile: NormalizedUserProfile): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicDataReadAdapter().getPublicTripReportRecords(),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportPreviews(
    reports.filter((report) => reportBelongsToContributor(report, profile)),
    profiles,
    { fallbackAuthorProfileKey: profile.key },
  );
}, ["convex-public-reports-by-contributor"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reports, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));

export const getPublicReportsBySubstanceNames = cache(unstable_cache(async (substanceNames: string[]) => {
  if (substanceNames.length === 0) {
    return [];
  }

  const [reports, profiles] = await Promise.all([
    getPublicDataReadAdapter().getPublicTripReportsBySubstanceNames(substanceNames),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportDetails(reports, profiles);
}, ["convex-public-reports-by-substance-names"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reports, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));

import "server-only";

import { cache } from "react";
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

export const getPublicReports = cache(async (): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicDataReadAdapter().getPublicTripReportRecords(),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportPreviews(reports, profiles);
});

export const getFeaturedReports = cache(async (limit = 8) => {
  return (await getPublicReports()).slice(0, limit);
});

export const getPublicReportBySlug = cache(async (slug: string): Promise<TripReportDetailRecord | null> => {
  const [report, profiles] = await Promise.all([
    getPublicDataReadAdapter().getPublicTripReportBySlug(slug),
    getPublicContributorProfiles(),
  ]);

  if (!report) {
    return null;
  }

  return projectPublicReportDetail(report, profiles);
});

export const getReportsByAuthor = cache(async (authorName: string): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicDataReadAdapter().getPublicTripReportsByAuthor(authorName),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportPreviews(reports, profiles);
});

export const getReportsByContributor = cache(async (profile: NormalizedUserProfile): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    getPublicDataReadAdapter().getPublicTripReportRecords(),
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
    getPublicDataReadAdapter().getPublicTripReportsBySubstanceNames(substanceNames),
    getPublicContributorProfiles(),
  ]);

  return projectPublicReportDetails(reports, profiles);
});

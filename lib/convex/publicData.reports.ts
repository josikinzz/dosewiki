import "server-only";

import { cache } from "react";
import { getPublicContributorProfiles, resolveContributorProfile, withResolvedReportProfile } from "./publicData.contributors";
import { queryConvex } from "./serverClient";
import {
  trimExcerpt,
  type PublicReportPreview,
  type TripReportDetailRecord,
  type TripReportRecord,
} from "./publicData.shared";

export const getPublicReports = cache(async (): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    queryConvex<TripReportRecord[]>("tripReports:getAll", {}),
    getPublicContributorProfiles(),
  ]);

  return reports
    .map((report) => ({
      matchedProfile: resolveContributorProfile(profiles, report.subject.name),
      title: report.title,
      slug: report.slug,
      author: report.subject.name,
      featured: report.featured === true,
      substanceNames: report.substances.map((substance) => substance.name),
      introduction: trimExcerpt(report.introduction, 170),
      tripDate: report.subject.trip_date,
      authorAvatarUrl: report.subject.avatar_url ?? undefined,
    }))
    .map(({ matchedProfile, authorAvatarUrl, ...report }) => ({
      ...report,
      authorAvatarUrl: authorAvatarUrl ?? matchedProfile?.avatarUrl ?? null,
      authorProfileKey: matchedProfile?.key,
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
  const [report, profiles] = await Promise.all([
    queryConvex<TripReportDetailRecord | null, { slug: string }>("tripReports:getBySlug", { slug }),
    getPublicContributorProfiles(),
  ]);

  if (!report) {
    return null;
  }

  return withResolvedReportProfile(report, profiles);
});

export const getReportsByAuthor = cache(async (authorName: string): Promise<PublicReportPreview[]> => {
  const [reports, profiles] = await Promise.all([
    queryConvex<TripReportRecord[], { authorName: string }>("tripReports:getByAuthor", {
      authorName,
    }),
    getPublicContributorProfiles(),
  ]);

  return reports
    .map((report) => ({
      matchedProfile: resolveContributorProfile(profiles, report.subject.name),
      title: report.title,
      slug: report.slug,
      author: report.subject.name,
      featured: report.featured === true,
      substanceNames: report.substances.map((substance) => substance.name),
      introduction: trimExcerpt(report.introduction, 170),
      tripDate: report.subject.trip_date,
      authorAvatarUrl: report.subject.avatar_url ?? undefined,
    }))
    .map(({ matchedProfile, authorAvatarUrl, ...report }) => ({
      ...report,
      authorAvatarUrl: authorAvatarUrl ?? matchedProfile?.avatarUrl ?? null,
      authorProfileKey: matchedProfile?.key,
    }));
});

export const getPublicReportsBySubstanceNames = cache(async (substanceNames: string[]) => {
  if (substanceNames.length === 0) {
    return [];
  }

  const [reports, profiles] = await Promise.all([
    queryConvex<TripReportDetailRecord[], { substanceNames: string[] }>("tripReports:getBySubstanceNames", {
      substanceNames,
    }),
    getPublicContributorProfiles(),
  ]);

  return reports.map((report) => withResolvedReportProfile(report, profiles));
});

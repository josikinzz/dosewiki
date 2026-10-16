import {
  findProfileByAuthorNameInList,
  type NormalizedUserProfile,
} from "../../src/data/userProfiles";
import { normalizeProfileKey } from "../contributorProfileIdentity";
import {
  type PublicReportPreview,
  type TripReportDetailRecord,
  type TripReportPreviewRecord,
  toPublicReportPreview,
} from "../../src/types/tripReport";

type TripReportRecord = TripReportPreviewRecord;

export const collapseContributorProfiles = (
  profiles: readonly NormalizedUserProfile[],
): NormalizedUserProfile[] => {
  const aliasKeys = new Set<string>();

  for (const profile of profiles) {
    for (const alias of profile.aliases) {
      const aliasKey = normalizeProfileKey(alias);

      if (aliasKey && aliasKey !== profile.key) {
        aliasKeys.add(aliasKey);
      }
    }
  }

  return profiles.filter((profile) => !aliasKeys.has(profile.key));
};

export const resolveReportContributorProfile = (
  profiles: readonly NormalizedUserProfile[],
  authorName: string,
) => findProfileByAuthorNameInList(profiles, authorName);

const resolveAttributedProfile = (
  report: Pick<TripReportRecord, "subject"> & { attribution_review?: unknown; attribution_locked?: boolean },
  profiles: readonly NormalizedUserProfile[],
): NormalizedUserProfile | null => {
  if (!report.attribution_locked && !report.attribution_review) {
    return resolveReportContributorProfile(profiles, report.subject.name);
  }

  const assignedKey = normalizeProfileKey(report.subject.profile_key);
  if (!assignedKey) {
    return null;
  }

  return profiles.find((profile) => normalizeProfileKey(profile.key) === assignedKey) ?? null;
};

const resolveAuthorAvatarUrl = (
  reportAvatarUrl: string | null | undefined,
  matchedProfile: NormalizedUserProfile | null,
) => reportAvatarUrl ?? matchedProfile?.avatarUrl ?? null;


const compareFeaturedTitle = (
  left: { featured?: boolean; title: string },
  right: { featured?: boolean; title: string },
) => {
  const leftFeatured = left.featured === true;
  const rightFeatured = right.featured === true;

  if (leftFeatured !== rightFeatured) {
    return leftFeatured ? -1 : 1;
  }

  return left.title.localeCompare(right.title);
};

const sortPublicReportPreviews = (
  reports: readonly PublicReportPreview[],
): PublicReportPreview[] => [...reports].sort(compareFeaturedTitle)

const sortTripReportDetails = <T extends TripReportRecord | TripReportDetailRecord>(
  reports: readonly T[],
): T[] => [...reports].sort(compareFeaturedTitle)

export const projectPublicReportPreview = (
  report: TripReportRecord,
  profiles: readonly NormalizedUserProfile[],
  options: { fallbackAuthorProfileKey?: string } = {},
): PublicReportPreview => {
  const matchedProfile = resolveAttributedProfile(report, profiles);

  return toPublicReportPreview(report, {
    authorAvatarUrl: resolveAuthorAvatarUrl(report.subject.avatar_url, matchedProfile),
    authorProfileKey: matchedProfile?.key ?? options.fallbackAuthorProfileKey,
  });
};

export const projectPublicReportPreviews = (
  reports: readonly TripReportRecord[],
  profiles: readonly NormalizedUserProfile[],
  options: { fallbackAuthorProfileKey?: string; sort?: boolean } = {},
): PublicReportPreview[] => {
  const projected = reports.map((report) => projectPublicReportPreview(report, profiles, options));
  return options.sort === false ? projected : sortPublicReportPreviews(projected);
};

export const projectPublicReportDetail = (
  report: TripReportDetailRecord,
  profiles: readonly NormalizedUserProfile[],
): TripReportDetailRecord => {
  const matchedProfile = resolveAttributedProfile(report, profiles);
  const { attribution_review, ...publicFields } = report;
  const publicReport: TripReportDetailRecord = {
    ...publicFields,
    attribution_locked: report.attribution_locked || !!attribution_review,
  };

  if (!matchedProfile) {
    return publicReport;
  }

  return {
    ...publicReport,
    subject: {
      ...report.subject,
      profile_key: matchedProfile.key,
      avatar_url: resolveAuthorAvatarUrl(report.subject.avatar_url, matchedProfile) ?? undefined,
    },
  };
};

export const projectPublicReportDetails = (
  reports: readonly TripReportDetailRecord[],
  profiles: readonly NormalizedUserProfile[],
  options: { sort?: boolean } = {},
): TripReportDetailRecord[] => {
  const projected = reports.map((report) => projectPublicReportDetail(report, profiles));
  return options.sort === false ? projected : sortTripReportDetails(projected);
};

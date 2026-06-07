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
  const aliasKeys = new Set(
    profiles.flatMap((profile) => profile.aliases.map((alias) => normalizeProfileKey(alias))),
  );

  return profiles.filter((profile) => !aliasKeys.has(profile.key));
};

export const resolveReportContributorProfile = (
  profiles: readonly NormalizedUserProfile[],
  authorName: string,
) => findProfileByAuthorNameInList(profiles, authorName);

const resolveAuthorAvatarUrl = (
  reportAvatarUrl: string | null | undefined,
  matchedProfile: NormalizedUserProfile | null,
) => reportAvatarUrl ?? matchedProfile?.avatarUrl ?? null;

const trimReportExcerpt = (value: string | null | undefined, maxLength = 170) => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

const getReportNarrativeText = (report: TripReportRecord): string => {
  const timelineText = [
    ...(report.onset ?? []),
    ...(report.peak ?? []),
    ...(report.offset ?? []),
  ].map((entry) => entry.description);

  return [
    report.introduction,
    ...timelineText,
    report.conclusion,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
};

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

export const sortPublicReportPreviews = (
  reports: readonly PublicReportPreview[],
): PublicReportPreview[] => [...reports].sort(compareFeaturedTitle);

export const sortTripReportDetails = <T extends TripReportRecord | TripReportDetailRecord>(
  reports: readonly T[],
): T[] => [...reports].sort(compareFeaturedTitle);

export const projectPublicReportPreview = (
  report: TripReportRecord,
  profiles: readonly NormalizedUserProfile[],
  options: { fallbackAuthorProfileKey?: string } = {},
): PublicReportPreview => {
  const matchedProfile = resolveReportContributorProfile(profiles, report.subject.name);

  return toPublicReportPreview(report, {
    introduction: trimReportExcerpt(getReportNarrativeText(report)),
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

export const projectPublicReportDetail = <T extends TripReportRecord | TripReportDetailRecord>(
  report: T,
  profiles: readonly NormalizedUserProfile[],
): T => {
  const matchedProfile = resolveReportContributorProfile(profiles, report.subject.name);

  if (!matchedProfile) {
    return report;
  }

  return {
    ...report,
    subject: {
      ...report.subject,
      profile_key: matchedProfile.key,
      avatar_url: resolveAuthorAvatarUrl(report.subject.avatar_url, matchedProfile) ?? undefined,
    },
  };
};

export const projectPublicReportDetails = <T extends TripReportRecord | TripReportDetailRecord>(
  reports: readonly T[],
  profiles: readonly NormalizedUserProfile[],
  options: { sort?: boolean } = {},
): T[] => {
  const projected = reports.map((report) => projectPublicReportDetail(report, profiles));
  return options.sort === false ? projected : sortTripReportDetails(projected);
};

export const getContributorReportAuthorNames = (profile: NormalizedUserProfile): string[] => [
  profile.displayName,
  profile.key,
  ...profile.aliases,
];

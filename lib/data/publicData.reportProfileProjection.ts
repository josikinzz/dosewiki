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

/**
 * Drop contributor rows that exist only as an alias of a *different* profile, keeping the
 * profile that claims the alias.
 *
 * The ownership check is the whole point. A key-shaped alias is a deliberate part of the write
 * model — `renameProfile` in `server/lib/contributorProfiles` records the old key (lowercased)
 * as an alias so a renamed profile keeps resolving under its previous identity, and the Effect
 * Index identity import writes the lowercased key alongside the real handles. Comparing a
 * profile's key against *every* alias in the table, its own included, therefore made every such
 * row delete itself: the live public table collapsed from 13 rows to the single row that had no
 * self-alias, which silently emptied dose.wiki's founder cards and stripped every author link
 * off the report pages. A row cannot be a duplicate of itself.
 *
 * Two profiles that name each other still both drop out. That is a contradictory pair rather
 * than a canonical/alias pair, and no read can pick a winner; it is left as-is because the fix
 * belongs in the data.
 */
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

/**
 * Resolve the contributor a report is attributed to.
 *
 * Byline matching is only trustworthy where the byline itself is: the imported
 * corpus was written by editors, so a report with no `attribution_review` marker
 * resolves by name exactly as it always has. A marker means the report came in
 * through the public submission form, where the byline is a string an anonymous
 * person typed — so it grants nothing, and attribution is only the key an editor
 * assigned at promotion (`server/tripReportSubmissions.ts`). Without this split,
 * stripping the submitted `profile_key` would not have helped: typing a real
 * contributor's name would have re-acquired their identity at read time.
 */
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

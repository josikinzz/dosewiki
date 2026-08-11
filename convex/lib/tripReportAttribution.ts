import { normalizeProfileKey } from "./contributorProfiles";

/**
 * Contributor attribution rules for trip reports.
 *
 * `subject.profile_key`, `subject.avatar_url`, and `subject.pdf_url` all put
 * something on a published report that the reader reads as vouched for by the
 * site: a link to a contributor page, the face shown beside a byline, and an
 * outbound link captioned as the report's own tracker PDF. Public submitters
 * are unauthenticated, so none of those claims can be checked and none of them
 * may survive intake. A trusted editor assigns attribution at promotion time.
 */

export type TripReportSubjectAttribution = {
  profile_key?: string;
  avatar_url?: string;
  pdf_url?: string;
};

export type SubmitterRestrictedSubjectField = keyof TripReportSubjectAttribution;

/** Subject fields a public submitter is never allowed to set. */
export const SUBMITTER_RESTRICTED_SUBJECT_FIELDS: readonly SubmitterRestrictedSubjectField[] = [
  "profile_key",
  "avatar_url",
  "pdf_url",
];

/**
 * Remove every submitter-controlled identity and link field.
 *
 * Applied both at intake and again at promotion: intake keeps unverified claims
 * out of the queue, and promotion additionally protects rows that the intake
 * path stored before this rule existed.
 */
export function stripSubmitterSubjectFields<T extends TripReportSubjectAttribution>(
  subject: T,
): Omit<T, SubmitterRestrictedSubjectField> {
  const {
    profile_key: _claimedProfileKey,
    avatar_url: _claimedAvatarUrl,
    pdf_url: _claimedPdfUrl,
    ...rest
  } = subject;

  return rest;
}

/**
 * Replace any stored attribution with the key an editor deliberately assigned.
 * An empty assignment publishes the report with no profile link at all, which
 * still resolves to a contributor page by author name where one matches.
 */
export function withEditorAssignedProfileKey<T extends TripReportSubjectAttribution>(
  subject: T,
  assignedProfileKey: string,
): Omit<T, SubmitterRestrictedSubjectField> & { profile_key?: string } {
  const stripped = stripSubmitterSubjectFields(subject);
  return assignedProfileKey ? { ...stripped, profile_key: assignedProfileKey } : stripped;
}

/**
 * Normalize an editor-supplied key to the stored contributor profile casing.
 * Returns "" when nothing was assigned.
 */
export function normalizeAssignedProfileKey(value: string | null | undefined): string {
  return normalizeProfileKey(value);
}

export type AuthorNameMatchableProfile = {
  key: string;
  displayName?: string | null;
  aliases?: readonly string[] | null;
};

/**
 * Mirror of `normalizeProfileAlias` in `lib/contributorProfileIdentity`, which
 * is what the public read path uses to resolve a report byline to a
 * contributor. The two must agree: this copy decides whether an editor is asked
 * to adjudicate a name claim, and that one decides whether the published page
 * would have honoured it. `lib/convexTripReportAttribution.test.ts` pins the
 * parity.
 */
export function normalizeAuthorMatchName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Every name a contributor profile answers to on the public read path. */
export function profileAuthorMatchNames(profile: AuthorNameMatchableProfile): string[] {
  const displayName = typeof profile.displayName === "string" ? profile.displayName : "";
  // A profile with no stored display name is still rendered under one derived
  // from its key, so it answers to that derived name too.
  const effectiveDisplayName = displayName.trim() ? displayName : keyDerivedDisplayName(profile.key);

  return Array.from(
    new Set(
      [effectiveDisplayName, ...(profile.aliases ?? [])]
        .map((name) => normalizeAuthorMatchName(name))
        .filter(Boolean),
    ),
  );
}

export function profileMatchesAuthorName(profile: AuthorNameMatchableProfile, authorName: string): boolean {
  const normalized = normalizeAuthorMatchName(authorName);
  return normalized.length > 0 && profileAuthorMatchNames(profile).includes(normalized);
}

export function findProfileByAuthorName<T extends AuthorNameMatchableProfile>(
  profiles: readonly T[],
  authorName: string,
): T | null {
  const normalized = normalizeAuthorMatchName(authorName);
  if (!normalized) {
    return null;
  }

  return profiles.find((profile) => profileMatchesAuthorName(profile, normalized)) ?? null;
}

/** Mirror of `toContributorDisplayName` in `lib/contributorProfileIdentity`. */
function keyDerivedDisplayName(key: string): string {
  return (
    normalizeProfileKey(key)
      .split(/[_\-\s]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(" ") || "Contributor"
  );
}

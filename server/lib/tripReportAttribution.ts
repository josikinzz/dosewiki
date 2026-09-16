import type { QueryCtx } from "../../lib/postgres/runtime/server"
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
 * would have honoured it. `lib/dataTripReportAttribution.test.ts` pins the
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

type AttributionReadCtx = { db: QueryCtx["db"] };

/**
 * A byline is an unverified string, and the public read path resolves bylines
 * to contributor profiles by exact name. Publishing "nervewing" as-is would
 * therefore hand that contributor's page, avatar, and report list to whoever
 * typed the name. An editor is looking straight at the record at this moment,
 * so this is where the claim gets adjudicated: grant it by assigning that
 * profile's key, or acknowledge it and publish unattributed.
 *
 * Shared by both write paths that can set a byline — submission promotion and
 * per-record editing in the Trip Report Portal. It lives here rather than
 * beside either caller because two copies of this check would be two chances
 * for one of them to drift open.
 */
export async function assertAuthorNameClaimAdjudicated(
  ctx: AttributionReadCtx,
  options: {
    authorName: string;
    assignedProfileKey: string;
    confirmAuthorNameClaim?: boolean;
  },
): Promise<void> {
  // contributorProfiles is a small dimension table with no name index, and the
  // public profile reads already collect it wholesale.
  const profiles = await ctx.db.query("contributorProfiles").collect();
  const matched = findProfileByAuthorName(profiles, options.authorName);

  if (!matched) {
    return;
  }

  const matchedKey = normalizeAssignedProfileKey(matched.key);
  if (options.assignedProfileKey && options.assignedProfileKey === matchedKey) {
    return;
  }

  if (options.confirmAuthorNameClaim) {
    return;
  }

  throw new Error(authorNameClaimMessage(options.authorName, matchedKey));
}

export function authorNameClaimMessage(authorName: string, matchedKey: string): string {
  return (
    `Author name "${authorName}" matches contributor profile "${matchedKey}". ` +
    "Assign that profile key to attribute the report, or confirm publishing it without attribution."
  );
}

/**
 * Resolve the contributor key an editor assigned. Unknown keys are rejected
 * rather than published, so a typo cannot mint a report that links to a
 * contributor page nobody owns. An empty assignment means no attribution.
 */
export async function resolveEditorAssignedProfileKey(
  ctx: AttributionReadCtx,
  requestedKey: string | undefined,
): Promise<string> {
  const profileKey = normalizeAssignedProfileKey(requestedKey);
  if (!profileKey) {
    return "";
  }

  const profile = await ctx.db
    .query("contributorProfiles")
    .withIndex("by_key", (q) => q.eq("key", profileKey))
    .first();

  if (!profile) {
    throw new Error(`Contributor profile "${profileKey}" not found.`);
  }

  return profileKey;
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

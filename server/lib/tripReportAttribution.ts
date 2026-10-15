import type { QueryCtx } from "../../lib/postgres/runtime/server"
import { normalizeProfileKey } from "./contributorProfiles";

export type TripReportSubjectAttribution = {
  profile_key?: string;
  avatar_url?: string;
  pdf_url?: string;
};

export type SubmitterRestrictedSubjectField = keyof TripReportSubjectAttribution;

export const SUBMITTER_RESTRICTED_SUBJECT_FIELDS: readonly SubmitterRestrictedSubjectField[] = [
  "profile_key",
  "avatar_url",
  "pdf_url",
];

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

export function withEditorAssignedProfileKey<T extends TripReportSubjectAttribution>(
  subject: T,
  assignedProfileKey: string,
): Omit<T, SubmitterRestrictedSubjectField> & { profile_key?: string } {
  const stripped = stripSubmitterSubjectFields(subject);
  return assignedProfileKey ? { ...stripped, profile_key: assignedProfileKey } : stripped;
}

export function normalizeAssignedProfileKey(value: string | null | undefined): string {
  return normalizeProfileKey(value);
}

export type AuthorNameMatchableProfile = {
  key: string;
  displayName?: string | null;
  aliases?: readonly string[] | null;
};

export function normalizeAuthorMatchName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function profileAuthorMatchNames(profile: AuthorNameMatchableProfile): string[] {
  const displayName = typeof profile.displayName === "string" ? profile.displayName : "";
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

export async function assertAuthorNameClaimAdjudicated(
  ctx: AttributionReadCtx,
  options: {
    authorName: string;
    assignedProfileKey: string;
    confirmAuthorNameClaim?: boolean;
  },
): Promise<void> {
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

function keyDerivedDisplayName(key: string): string {
  return (
    normalizeProfileKey(key)
      .split(/[_\-\s]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(" ") || "Contributor"
  );
}

import { replicationRevision } from "./replicationEditJournal";
import type { QueryCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import {
  deriveProfileKeyFromEmail,
  materializeProfile,
  normalizeEmail,
  normalizeOrderSlugs,
  normalizeProfileKey,
  type StoredProfile,
} from "./contributorProfiles";
import { getStoredContributorProfile } from "./contributorProfilePersistence";
import { isValidR2Key, replicationMediaBaseUrl } from "./replicationUrls";

export async function getAllContributorProfilesHandler(ctx: QueryCtx) {
  const profiles = await ctx.db.query("contributorProfiles").collect();
  const resolved = await Promise.all(
    profiles
      .filter((profile) => !profile.mergedIntoProfileId)
      .map(async (profile) => await materializeProfile(ctx, profile as StoredProfile)),
  );
  return resolved.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function getContributorProfileKeysHandler(ctx: QueryCtx) {
  const profiles = await ctx.db.query("contributorProfiles").collect();
  return profiles
    .map((profile) => normalizeProfileKey(profile.key))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export async function getContributorProfileByKeyHandler(
  ctx: QueryCtx,
  args: { key: string },
) {
  const profile = await getStoredContributorProfile(ctx, args.key);
  if (!profile) return null;
  if (profile.mergedIntoProfileId) {
    const target = await ctx.db.get(profile.mergedIntoProfileId);
    if (!target || target.key !== profile.mergedIntoKey || target.mergedIntoProfileId) {
      throw new Error("Contributor profile redirect target is missing or ambiguous.");
    }
    return await materializeProfile(ctx, target as StoredProfile);
  }
  return await materializeProfile(ctx, profile as StoredProfile);
}

export async function getContributorProfilesForBulkImportHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; keys: string[] },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "editor",
  );
  const profiles = await Promise.all(
    Array.from(new Set(args.keys.map((key) => normalizeProfileKey(key)).filter(Boolean))).map(
      async (key) => await getStoredContributorProfile(ctx, key),
    ),
  );
  return profiles.filter((profile): profile is NonNullable<typeof profile> => profile !== null);
}

export async function getEditorContributorProfileHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; key: string },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "editor",
  );
  const key = normalizeProfileKey(args.key);
  if (!key) return null;
  const existing = await getStoredContributorProfile(ctx, key);
  if (!existing) return null;

  const stored = existing as StoredProfile;
  const r2BaseUrl = replicationMediaBaseUrl();
  const storedAvatarUrl = r2BaseUrl && isValidR2Key(stored.avatarR2Key)
    ? `${r2BaseUrl}/${stored.avatarR2Key}`
    : stored.avatarStorageId
      ? await ctx.storage.getUrl(stored.avatarStorageId)
      : null;
  return {
    key: normalizeProfileKey(stored.key),
    displayName: stored.displayName,
    aliases: stored.aliases ?? [],
    bio: stored.bio ?? "",
    role: stored.role ?? null,
    links: stored.links ?? [],
    membershipEmail: stored.membershipEmail ?? null,
    avatarUrl: stored.avatarUrl ?? null,
    avatarStorageId: stored.avatarStorageId ?? null,
    avatarR2Key: stored.avatarR2Key ?? null,
    storedAvatarUrl,
    replicationOrder: normalizeOrderSlugs(stored.replicationOrder),
    orderingRevision: await replicationRevision(ctx, existing, `artist:${key}`),
    reportOrder: normalizeOrderSlugs(stored.reportOrder),
    exclude_from_gallery: stored.exclude_from_gallery === true,
    archival: stored.archival === true,
    approved_replicator: stored.approved_replicator === true,
    staffNote: stored.staffNote ?? null,
    updatedAt: stored.updatedAt ?? null,
    updatedBy: stored.updatedBy ?? null,
  };
}

export async function getOwnedContributorProfileHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; email: string },
) {
  const actor = await requireRole(
    ctx,
    {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
      actorEmail: args.apiKey ? args.email : undefined,
    },
    "contributor",
  );
  const email = actor.email;
  const directMatch = await ctx.db
    .query("contributorProfiles")
    .withIndex("by_membership_email", (query) => query.eq("membershipEmail", email))
    .first();
  if (directMatch) return await materializeProfile(ctx, directMatch as StoredProfile);

  const derivedKey = deriveProfileKeyFromEmail(email);
  if (!derivedKey) return null;
  const fallbackMatch = await getStoredContributorProfile(ctx, derivedKey);
  if (!fallbackMatch) return null;
  const membershipEmail = fallbackMatch.membershipEmail
    ? normalizeEmail(fallbackMatch.membershipEmail)
    : undefined;
  if (membershipEmail && membershipEmail !== email) return null;
  return await materializeProfile(ctx, fallbackMatch as StoredProfile);
}

import { type Infer, v } from "../../lib/postgres/runtime/values"
import type { Doc, Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import { normalizeProfileKey } from "./contributorProfiles";
import { isPlaceholderStorageId, isValidR2Key } from "./replicationUrls";
import { assertProfileAvatarImportReceipt } from "../../lib/runtime/r2MediaStorage";
import {
  MAX_CONTRIBUTOR_PROFILE_LINKS,
  contributorMatchNames,
  normalizeProfileAliases,
  normalizeProfileAlias,
  sanitizeContributorAvatarUrl,
  sanitizeContributorBio,
  sanitizeContributorDisplayName,
  sanitizeContributorLinks,
  sanitizeContributorRole,
} from "../../lib/contributorProfileIdentity";

const nullableString = v.union(v.string(), v.null());
const nullableStorageId = v.union(v.id("_storage"), v.null());
const creatorKindValidator = v.union(
  v.literal("person"),
  v.literal("collective-or-tradition"),
  v.literal("system-or-process"),
  v.literal("ambiguous"),
  v.literal("unknown"),
  v.literal("group"),
  v.literal("collective"),
  v.literal("tradition"),
  v.literal("system"),
  v.literal("process"),
);
const linkValidator = v.object({ label: v.string(), url: v.string() });
export const reviewedProfileStateValidator = v.object({
  key: v.string(),
  displayName: v.string(),
  aliases: v.array(v.string()),
  avatarStorageId: nullableStorageId,
  avatarR2Key: nullableString,
  avatarUrl: nullableString,
  bio: v.string(),
  role: nullableString,
  links: v.array(linkValidator),
});

const existingProfileEntryValidator = v.object({
  outcome: v.literal("existing-profile"),
  creatorName: v.string(),
  creatorKind: v.literal("person"),
  profileId: v.id("contributorProfiles"),
  expected: reviewedProfileStateValidator,
  profile: reviewedProfileStateValidator,
});

const reviewedNewProfileEntryValidator = v.object({
  outcome: v.literal("reviewed-new"),
  creatorName: v.string(),
  creatorKind: v.literal("person"),
  expectedAbsent: v.literal(true),
  profile: reviewedProfileStateValidator,
});

const skippedProfileEntryValidator = v.object({
  outcome: v.union(
    v.literal("unresolved"),
    v.literal("intentionally-absent"),
    v.literal("collective-or-tradition"),
    v.literal("system-or-process"),
    v.literal("ambiguous"),
    v.literal("unverified"),
    v.literal("unknown-artist"),
    v.literal("create-profile-candidate"),
  ),
  creatorName: v.string(),
  creatorKind: creatorKindValidator,
});

export const reviewedProfileImportEntryValidator = v.union(
  existingProfileEntryValidator,
  reviewedNewProfileEntryValidator,
  skippedProfileEntryValidator,
);

export const reviewedProfileImportArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  operationId: v.string(),
  dryRun: v.boolean(),
  entries: v.array(reviewedProfileImportEntryValidator),
  avatarR2Receipts: v.optional(v.record(v.string(), v.string())),
});

const importActionValidator = v.union(
  v.literal("would-update"),
  v.literal("updated"),
  v.literal("would-create"),
  v.literal("created"),
  v.literal("unchanged"),
  v.literal("skipped"),
  v.literal("blocked"),
);
const importBlockReasonValidator = v.union(
  v.literal("official-link-limit"),
  v.literal("avatar-unverified"),
);

export const reviewedProfileImportResult = v.object({
  operationId: v.string(),
  dryRun: v.boolean(),
  created: v.number(),
  updated: v.number(),
  unchanged: v.number(),
  skipped: v.number(),
  blocked: v.number(),
  rows: v.array(
    v.object({
      creatorName: v.string(),
      key: nullableString,
      profileId: v.union(v.id("contributorProfiles"), v.null()),
      action: importActionValidator,
      blockReason: v.optional(importBlockReasonValidator),
    }),
  ),
});

export const reviewedProfileRollbackArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  operationId: v.string(),
  dryRun: v.boolean(),
  entries: v.array(reviewedProfileImportEntryValidator),
});

const rollbackActionValidator = v.union(
  v.literal("would-delete"),
  v.literal("deleted"),
  v.literal("would-restore"),
  v.literal("restored"),
  v.literal("unchanged"),
  v.literal("skipped"),
);

export const reviewedProfileRollbackResult = v.object({
  operationId: v.string(),
  dryRun: v.boolean(),
  deleted: v.number(),
  restored: v.number(),
  unchanged: v.number(),
  skipped: v.number(),
  rows: v.array(
    v.object({
      creatorName: v.string(),
      key: nullableString,
      profileId: v.union(v.id("contributorProfiles"), v.null()),
      action: rollbackActionValidator,
    }),
  ),
});

export type ReviewedProfileImportArgs = Infer<typeof reviewedProfileImportArgs>;
export type ReviewedProfileRollbackArgs = Infer<typeof reviewedProfileRollbackArgs>;
type ReviewedProfileState = Infer<typeof reviewedProfileStateValidator>;

const PROFILE_KEY = /^[A-Z0-9-]+$/;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
// The Reddit attribution remediation tops out below 2,100 contributor rows.
// Keep the alias-aware collision check bounded, but large enough to validate
// the complete reviewed rollout instead of failing midway at the old 500-row
// limit. A future corpus above this ceiling should move identity tokens into a
// dedicated indexed registry rather than widening this scan again.
const MAX_PROFILE_IDENTITY_SCAN = 4096;
const NON_PROFILE_IDENTITIES = new Set(["unknown artist", "unknown", "unattributed", "anonymous"]);

function importProvenance(operationId: string, actorEmail: string) {
  return `reviewed-profile-import:${operationId}:${actorEmail}`;
}

function assertActionableCreator(creatorName: string, displayName: string) {
  const names = [creatorName, displayName].map((value) => value.trim().toLowerCase());
  if (names.some((name) => !name || NON_PROFILE_IDENTITIES.has(name))) {
    throw new Error(`${creatorName || displayName} cannot create or update a contributor profile.`);
  }
}

function canonicalProfile(input: ReviewedProfileState): ReviewedProfileState {
  const key = normalizeProfileKey(input.key);
  if (!key || key !== input.key || !PROFILE_KEY.test(key)) {
    throw new Error(`Contributor profile key must be stable uppercase A-Z, 0-9, or hyphen: ${input.key}`);
  }
  const displayName = sanitizeContributorDisplayName(input.displayName);
  if (!displayName || displayName !== input.displayName.trim()) {
    throw new Error(`Contributor profile ${key} has an invalid display name.`);
  }
  const aliases = normalizeProfileAliases(input.aliases);
  const bio = sanitizeContributorBio(input.bio);
  if (bio !== input.bio) {
    throw new Error(`Contributor profile ${key} bio exceeds the supported length.`);
  }
  const role = input.role === null ? null : sanitizeContributorRole(input.role);
  if (input.role !== null && (!role || role !== input.role.replace(/\s+/g, " ").trim())) {
    throw new Error(`Contributor profile ${key} has an invalid role.`);
  }
  if (input.links.length > MAX_CONTRIBUTOR_PROFILE_LINKS) {
    throw new Error(
      `Contributor profile ${key} may have at most ${MAX_CONTRIBUTOR_PROFILE_LINKS} official links.`,
    );
  }
  const links = sanitizeContributorLinks(input.links);
  if (links.length !== input.links.length) {
    throw new Error(`Contributor profile ${key} has an invalid official link.`);
  }
  const avatarCount = [input.avatarStorageId, input.avatarR2Key, input.avatarUrl].filter(
    (value) => value !== null,
  ).length;
  if (avatarCount > 1) {
    throw new Error(`Contributor profile ${key} may have only one avatar reference.`);
  }
  if (
    input.avatarStorageId !== null &&
    (isPlaceholderStorageId(input.avatarStorageId) || input.avatarStorageId.trim() !== input.avatarStorageId)
  ) {
    throw new Error(`Contributor profile ${key} has an invalid avatar storage reference.`);
  }
  if (input.avatarR2Key !== null) {
    const extension = input.avatarR2Key.slice(input.avatarR2Key.lastIndexOf(".") + 1);
    if (!isValidR2Key(input.avatarR2Key) || !IMAGE_EXTENSIONS.has(extension)) {
      throw new Error(`Contributor profile ${key} has an invalid avatar R2 reference.`);
    }
  }
  const avatarUrl = input.avatarUrl === null ? null : sanitizeContributorAvatarUrl(input.avatarUrl);
  if (input.avatarUrl !== null && avatarUrl === null) {
    throw new Error(`Contributor profile ${key} has an invalid avatar URL.`);
  }
  return {
    key,
    displayName,
    aliases,
    avatarStorageId: input.avatarStorageId,
    avatarR2Key: input.avatarR2Key,
    avatarUrl,
    bio,
    role: role || null,
    links,
  };
}

function storedSnapshot(row: Record<string, unknown>): ReviewedProfileState {
  return {
    key: String(row.key ?? ""),
    displayName: String(row.displayName ?? ""),
    aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    avatarStorageId: typeof row.avatarStorageId === "string" ? (row.avatarStorageId as Id<"_storage">) : null,
    avatarR2Key: typeof row.avatarR2Key === "string" ? row.avatarR2Key : null,
    avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : null,
    bio: String(row.bio ?? ""),
    role: typeof row.role === "string" ? row.role : null,
    links: Array.isArray(row.links) ? (row.links as ReviewedProfileState["links"]) : [],
  };
}

function profilesAgree(left: ReviewedProfileState, right: ReviewedProfileState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function profileIdentityTokens(profile: Pick<ReviewedProfileState, "key" | "displayName" | "aliases">) {
  return Array.from(new Set([
    normalizeProfileAlias(profile.key),
    ...contributorMatchNames(profile),
  ].filter(Boolean)));
}

async function conflictingProfile(ctx: MutationCtx, field: "key" | "displayName", value: string, allowedId?: string) {
  const index = field === "key" ? "by_key" : "by_display_name";
  const rows = await ctx.db
    .query("contributorProfiles")
    .withIndex(index, (query) => query.eq(field, value))
    .take(2);
  return rows.find((row) => row._id !== allowedId) ?? null;
}

async function profilesBy(ctx: MutationCtx, field: "key" | "displayName", value: string) {
  const index = field === "key" ? "by_key" : "by_display_name";
  return await ctx.db
    .query("contributorProfiles")
    .withIndex(index, (query) => query.eq(field, value))
    .take(2);
}

function storedPatch(profile: ReviewedProfileState, updatedAt: string, updatedBy: string) {
  return {
    key: profile.key,
    displayName: profile.displayName,
    aliases: profile.aliases,
    avatarStorageId: profile.avatarStorageId ?? undefined,
    avatarR2Key: profile.avatarR2Key ?? undefined,
    avatarUrl: profile.avatarUrl ?? undefined,
    bio: profile.bio,
    role: profile.role ?? undefined,
    links: profile.links,
    updatedAt,
    updatedBy,
  };
}

export async function importReviewedProfilePlanHandler(ctx: MutationCtx, args: ReviewedProfileImportArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "admin",
  );
  if (!args.operationId.trim()) throw new Error("Profile import operationId is required.");
  if (args.entries.length === 0 || args.entries.length > 50) {
    throw new Error("A reviewed profile import needs 1 to 50 entries.");
  }

  const result = {
    operationId: args.operationId.trim(),
    dryRun: args.dryRun,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    blocked: 0,
    rows: [] as Array<{
      creatorName: string;
      key: string | null;
      profileId: Id<"contributorProfiles"> | null;
      action: "would-update" | "updated" | "would-create" | "created" | "unchanged" | "skipped" | "blocked";
      blockReason?: "official-link-limit" | "avatar-unverified";
    }>,
  };
  const now = new Date().toISOString();
  const provenance = importProvenance(result.operationId, actor.email);
  const plannedKeys = new Set<string>();
  const plannedNames = new Set<string>();
  const plannedIdentityTokens = new Set<string>();
  const preparedProfiles = new Map<
    number,
    {
      desired: ReviewedProfileState;
      expected?: ReviewedProfileState;
    }
  >();
  const blockedProfiles = new Map<
    number,
    {
      key: string | null;
      profileId: Id<"contributorProfiles"> | null;
      blockReason: "official-link-limit" | "avatar-unverified";
    }
  >();

  // Validate the whole batch before its first write. Native mutations are
  // transactional, but an eager preflight also keeps dry-run and write-mode
  // failures identical and avoids doing work that is guaranteed to roll back.
  for (const [index, entry] of args.entries.entries()) {
    if (entry.outcome !== "reviewed-new" && entry.outcome !== "existing-profile") continue;
    if (entry.profile.links.length > MAX_CONTRIBUTOR_PROFILE_LINKS) {
      blockedProfiles.set(index, {
        key: normalizeProfileKey(entry.profile.key) || null,
        profileId: entry.outcome === "existing-profile" ? entry.profileId : null,
        blockReason: "official-link-limit",
      });
      continue;
    }
    const desired = canonicalProfile(entry.profile);
    assertActionableCreator(entry.creatorName, desired.displayName);
    if (plannedKeys.has(desired.key) || plannedNames.has(desired.displayName)) {
      throw new Error(`Reviewed profile batch repeats ${desired.key} or ${desired.displayName}.`);
    }
    const repeatedIdentityToken = profileIdentityTokens(desired)
      .find((token) => plannedIdentityTokens.has(token));
    if (repeatedIdentityToken) {
      throw new Error(`Reviewed profile batch repeats identity ${repeatedIdentityToken}.`);
    }
    plannedKeys.add(desired.key);
    plannedNames.add(desired.displayName);
    for (const token of profileIdentityTokens(desired)) plannedIdentityTokens.add(token);
    if (entry.outcome === "existing-profile") {
      const expected = canonicalProfile(entry.expected);
      if (expected.key !== desired.key) {
        throw new Error(`Contributor profile ${entry.profileId} cannot change its stable key.`);
      }
      preparedProfiles.set(index, { desired, expected });
    } else {
      preparedProfiles.set(index, { desired });
    }
  }

  if (!args.dryRun && blockedProfiles.size > 0) {
    throw new Error(
      `Reviewed profile import blocked: ${blockedProfiles.size} profile(s) exceed the `
        + `${MAX_CONTRIBUTOR_PROFILE_LINKS}-link product limit.`,
    );
  }

  for (const [index, { desired }] of preparedProfiles.entries()) {
    if (desired.avatarStorageId) {
      let resolvedUrl: string | null = null;
      try {
        resolvedUrl = await ctx.storage.getUrl(desired.avatarStorageId);
      } catch {
        // Missing and malformed storage references fail closed below.
      }
      if (!resolvedUrl) {
        const entry = args.entries[index];
        blockedProfiles.set(index, {
          key: desired.key,
          profileId: entry.outcome === "existing-profile" ? entry.profileId : null,
          blockReason: "avatar-unverified",
        });
      }
    }
    if (desired.avatarR2Key) {
      const entry = args.entries[index];
      // Preserving an existing avatar introduces no new identity. The final
      // profile CAS still proves this expected state before any mutation.
      const preservesExisting = entry.outcome === "existing-profile"
        && entry.expected.avatarR2Key === desired.avatarR2Key;
      if (!preservesExisting) {
        try {
          assertProfileAvatarImportReceipt(
            args.avatarR2Receipts?.[desired.key] ?? "",
            desired.key, desired.avatarR2Key, actor.email, ctx.targetIdentity,
          );
        } catch {
          blockedProfiles.set(index, {
            key: desired.key,
            profileId: entry.outcome === "existing-profile" ? entry.profileId : null,
            blockReason: "avatar-unverified",
          });
        }
      }
    }
  }

  if (!args.dryRun && blockedProfiles.size > 0) {
    throw new Error(
      `Reviewed profile import blocked: ${blockedProfiles.size} profile(s) have unresolved policy or avatar gates.`,
    );
  }

  if (preparedProfiles.size > 0) {
    const existingProfiles = await ctx.db.query("contributorProfiles").take(MAX_PROFILE_IDENTITY_SCAN + 1);
    if (existingProfiles.length > MAX_PROFILE_IDENTITY_SCAN) {
      throw new Error(
        `Contributor identity preflight exceeds its ${MAX_PROFILE_IDENTITY_SCAN}-profile safety bound.`,
      );
    }
    for (const [index, { desired }] of preparedProfiles.entries()) {
      const entry = args.entries[index];
      const exactRetryIds = existingProfiles
        .filter((row) => profilesAgree(
          storedSnapshot(row as unknown as Record<string, unknown>),
          desired,
        ))
        .map((row) => row._id);
      const allowedId = entry.outcome === "existing-profile"
        ? entry.profileId
        : exactRetryIds.length === 1
          ? exactRetryIds[0]
          : null;
      const desiredTokens = new Set(profileIdentityTokens(desired));
      const collision = existingProfiles.find((row) => (
        row._id !== allowedId
        && profileIdentityTokens(storedSnapshot(row as unknown as Record<string, unknown>))
          .some((token) => desiredTokens.has(token))
      ));
      if (collision) {
        throw new Error(
          `Contributor profile ${desired.key} conflicts with an existing key, display name, or alias.`,
        );
      }
    }
  }

  for (const [index, entry] of args.entries.entries()) {
    const blocked = blockedProfiles.get(index);
    if (blocked) {
      result.blocked += 1;
      result.rows.push({
        creatorName: entry.creatorName,
        key: blocked.key,
        profileId: blocked.profileId,
        action: "blocked",
        blockReason: blocked.blockReason,
      });
      continue;
    }
    if (entry.outcome === "reviewed-new") {
      const desired = preparedProfiles.get(index)!.desired;
      const keyMatches = await profilesBy(ctx, "key", desired.key);
      const nameMatches = await profilesBy(ctx, "displayName", desired.displayName);
      const candidates = new Map([...keyMatches, ...nameMatches].map((row) => [row._id, row]));
      if (candidates.size > 1) {
        throw new Error(`Contributor profile key ${desired.key} or name ${desired.displayName} is already in use.`);
      }
      const existing = candidates.values().next().value;
      if (existing) {
        const current = storedSnapshot(existing as unknown as Record<string, unknown>);
        if (!profilesAgree(current, desired)) {
          throw new Error(`Contributor profile key ${desired.key} or name ${desired.displayName} is already in use.`);
        }
        result.unchanged += 1;
        result.rows.push({
          creatorName: entry.creatorName,
          key: desired.key,
          profileId: existing._id,
          action: "unchanged",
        });
        continue;
      }
      result.created += 1;
      if (args.dryRun) {
        result.rows.push({
          creatorName: entry.creatorName,
          key: desired.key,
          profileId: null,
          action: "would-create",
        });
      } else {
        const profileId = await ctx.db.insert("contributorProfiles", {
          ...storedPatch(desired, now, provenance),
          createdAt: now,
        });
        result.rows.push({
          creatorName: entry.creatorName,
          key: desired.key,
          profileId,
          action: "created",
        });
      }
      continue;
    }
    if (entry.outcome !== "existing-profile") {
      result.skipped += 1;
      result.rows.push({
        creatorName: entry.creatorName,
        key: null,
        profileId: null,
        action: "skipped",
      });
      continue;
    }
    const prepared = preparedProfiles.get(index)!;
    const expected = prepared.expected!;
    const desired = prepared.desired;
    const row = await ctx.db.get(entry.profileId);
    if (!row) throw new Error(`Contributor profile ${entry.profileId} no longer exists.`);
    if (await conflictingProfile(ctx, "key", desired.key, entry.profileId)) {
      throw new Error(`Contributor profile key ${desired.key} is already in use.`);
    }
    if (await conflictingProfile(ctx, "displayName", desired.displayName, entry.profileId)) {
      throw new Error(`Contributor profile name ${desired.displayName} is already in use.`);
    }
    const current = storedSnapshot(row as unknown as Record<string, unknown>);
    if (profilesAgree(current, desired)) {
      result.unchanged += 1;
      result.rows.push({
        creatorName: entry.creatorName,
        key: desired.key,
        profileId: entry.profileId,
        action: "unchanged",
      });
      continue;
    }
    if (!profilesAgree(current, expected)) {
      throw new Error(`Contributor profile ${entry.profileId} changed after reviewed preflight.`);
    }
    result.updated += 1;
    const action = args.dryRun ? ("would-update" as const) : ("updated" as const);
    if (!args.dryRun) {
      await ctx.db.patch(entry.profileId, storedPatch(desired, now, provenance));
    }
    result.rows.push({
      creatorName: entry.creatorName,
      key: desired.key,
      profileId: entry.profileId,
      action,
    });
  }
  return result;
}

/**
 * Exact inverse of a reviewed profile import batch.
 *
 * The import's operation-scoped `updatedBy` marker proves that a row was
 * created or changed by this specific campaign. Rollback refuses to touch a
 * row whose reviewed fields or marker drifted. An already absent reviewed-new
 * row and an existing row already restored to its expected snapshot are safe,
 * idempotent retries.
 */
export async function rollbackReviewedProfilePlanHandler(
  ctx: MutationCtx,
  args: ReviewedProfileRollbackArgs,
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "admin",
  );
  const operationId = args.operationId.trim();
  if (!operationId) throw new Error("Profile rollback operationId is required.");
  if (args.entries.length === 0 || args.entries.length > 50) {
    throw new Error("A reviewed profile rollback needs 1 to 50 entries.");
  }

  const provenance = importProvenance(operationId, actor.email);
  const result = {
    operationId,
    dryRun: args.dryRun,
    deleted: 0,
    restored: 0,
    unchanged: 0,
    skipped: 0,
    rows: [] as Array<{
      creatorName: string;
      key: string | null;
      profileId: Id<"contributorProfiles"> | null;
      action: "would-delete" | "deleted" | "would-restore" | "restored" | "unchanged" | "skipped";
    }>,
  };

  // Validate and read the entire batch before the first write so dry-run and
  // write mode have the same fail-closed CAS behavior.
  const prepared: Array<
    | { kind: "skip"; creatorName: string }
    | {
        kind: "new";
        creatorName: string;
        desired: ReviewedProfileState;
        row: Doc<"contributorProfiles"> | null;
      }
    | {
        kind: "existing";
        creatorName: string;
        profileId: Id<"contributorProfiles">;
        expected: ReviewedProfileState;
        desired: ReviewedProfileState;
        row: Doc<"contributorProfiles">;
      }
  > = [];

  for (const entry of args.entries) {
    if (entry.outcome === "reviewed-new") {
      const desired = canonicalProfile(entry.profile);
      const keyMatches = await profilesBy(ctx, "key", desired.key);
      const nameMatches = await profilesBy(ctx, "displayName", desired.displayName);
      const candidates = new Map([...keyMatches, ...nameMatches].map((row) => [row._id, row]));
      if (candidates.size > 1) {
        throw new Error(`Contributor profile ${desired.key} rollback identity is ambiguous.`);
      }
      const row = candidates.values().next().value ?? null;
      if (row) {
        const current = storedSnapshot(row as unknown as Record<string, unknown>);
        if (!profilesAgree(current, desired) || row.updatedBy !== provenance || row.createdAt !== row.updatedAt) {
          throw new Error(`Contributor profile ${desired.key} is not an exact campaign-created row.`);
        }
      }
      prepared.push({ kind: "new", creatorName: entry.creatorName, desired, row });
      continue;
    }

    if (entry.outcome === "existing-profile") {
      const expected = canonicalProfile(entry.expected);
      const desired = canonicalProfile(entry.profile);
      if (expected.key !== desired.key) {
        throw new Error(`Contributor profile ${entry.profileId} cannot change its stable key.`);
      }
      const row = await ctx.db.get(entry.profileId);
      if (!row) throw new Error(`Contributor profile ${entry.profileId} no longer exists.`);
      const current = storedSnapshot(row as unknown as Record<string, unknown>);
      if (profilesAgree(current, expected)) {
        prepared.push({
          kind: "existing",
          creatorName: entry.creatorName,
          profileId: entry.profileId,
          expected,
          desired,
          row,
        });
        continue;
      }
      if (!profilesAgree(current, desired) || row.updatedBy !== provenance) {
        throw new Error(`Contributor profile ${entry.profileId} changed after campaign import.`);
      }
      prepared.push({
        kind: "existing",
        creatorName: entry.creatorName,
        profileId: entry.profileId,
        expected,
        desired,
        row,
      });
      continue;
    }

    prepared.push({ kind: "skip", creatorName: entry.creatorName });
  }

  const now = new Date().toISOString();
  for (const item of prepared) {
    if (item.kind === "skip") {
      result.skipped += 1;
      result.rows.push({ creatorName: item.creatorName, key: null, profileId: null, action: "skipped" });
      continue;
    }
    if (item.kind === "new") {
      if (!item.row) {
        result.unchanged += 1;
        result.rows.push({
          creatorName: item.creatorName,
          key: item.desired.key,
          profileId: null,
          action: "unchanged",
        });
        continue;
      }
      result.deleted += 1;
      if (!args.dryRun) await ctx.db.delete(item.row._id);
      result.rows.push({
        creatorName: item.creatorName,
        key: item.desired.key,
        profileId: item.row._id,
        action: args.dryRun ? "would-delete" : "deleted",
      });
      continue;
    }

    const current = storedSnapshot(item.row as unknown as Record<string, unknown>);
    if (profilesAgree(current, item.expected)) {
      result.unchanged += 1;
      result.rows.push({
        creatorName: item.creatorName,
        key: item.expected.key,
        profileId: item.profileId,
        action: "unchanged",
      });
      continue;
    }
    result.restored += 1;
    if (!args.dryRun) {
      await ctx.db.patch(item.profileId, storedPatch(item.expected, now, actor.email));
    }
    result.rows.push({
      creatorName: item.creatorName,
      key: item.expected.key,
      profileId: item.profileId,
      action: args.dryRun ? "would-restore" : "restored",
    });
  }

  return result;
}

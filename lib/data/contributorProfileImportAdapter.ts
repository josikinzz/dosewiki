import type { Id } from "@server/postgres/runtime/dataModel";
import type { ReviewedProfileImportArgs } from "../../server/lib/contributorProfileImports";
import { MAX_CONTRIBUTOR_PROFILE_LINKS } from "../contributorProfileIdentity";

type ProjectionLink = {
  kind: string;
  url: string;
  notImportedReason?: string;
};

type StoredLink = { label: string; url: string };

type ExistingProfileProjection = {
  operation: "update-existing-links" | "reuse-existing";
  profileId: string;
  key: string;
  displayName: string;
  avatarUrl?: string | null;
  existingLinks: StoredLink[];
  addLinks: ProjectionLink[];
  evidenceOnlyLinks: ProjectionLink[];
};

type CreateProfileProjection = {
  operation: "create-candidate";
  key: string;
  displayName: string;
  aliases: string[];
  role: string;
  links: ProjectionLink[];
  evidenceOnlyLinks: ProjectionLink[];
  avatarUrl: string | null;
  avatarPlan?: { mode: string };
};

type ExclusionProjection = {
  sha256: string;
  reason: string;
  label: string | null;
};

export type ContributorProfileImportProjection = {
  artifactType: "replication-index-contributor-profile-import-projection";
  campaignId: string;
  counts: { profileLinkLimit: number };
  existingProfiles: ExistingProfileProjection[];
  createProfiles: CreateProfileProjection[];
  exclusions: ExclusionProjection[];
};

export type LiveContributorProfileSnapshot = {
  _id: Id<"contributorProfiles">;
  key: string;
  displayName: string;
  aliases: string[];
  avatarStorageId?: Id<"_storage">;
  avatarR2Key?: string;
  avatarUrl?: string;
  bio: string;
  role?: string;
  links: StoredLink[];
};

export type ContributorAvatarBinding = {
  avatarStorageId?: Id<"_storage">;
  avatarR2Key?: string;
  avatarUrl?: string;
};

function profileState(
  profile: Omit<LiveContributorProfileSnapshot, "_id">,
  avatar?: ContributorAvatarBinding,
) {
  const suppliedRefs = avatar
    ? [avatar.avatarStorageId, avatar.avatarR2Key, avatar.avatarUrl].filter(Boolean)
    : [];
  if (suppliedRefs.length > 1) throw new Error(`Profile ${profile.key} has multiple avatar references.`);
  // A missing or empty binding is not an instruction to clear an existing
  // avatar. New profiles have no existing ref, so their explicit nulls select
  // the public initials fallback.
  const selected = suppliedRefs.length === 1 ? avatar! : profile;
  const refs = [selected.avatarStorageId, selected.avatarR2Key, selected.avatarUrl].filter(Boolean);
  if (refs.length > 1) throw new Error(`Profile ${profile.key} has multiple avatar references.`);
  return {
    key: profile.key,
    displayName: profile.displayName,
    aliases: profile.aliases,
    avatarStorageId: selected.avatarStorageId ?? null,
    avatarR2Key: selected.avatarR2Key ?? null,
    avatarUrl: selected.avatarUrl ?? null,
    bio: profile.bio,
    role: profile.role ?? null,
    links: profile.links,
  };
}

function projectedLinks(links: ProjectionLink[]): StoredLink[] {
  return links.map((link) => ({ label: link.kind, url: link.url }));
}

function assertLinkPlan(key: string, links: StoredLink[], evidenceOnlyLinks: ProjectionLink[], limit: number) {
  if (links.length > limit) {
    throw new Error(`Profile ${key} exceeds the ${limit}-link reviewed plan limit.`);
  }
  for (const link of evidenceOnlyLinks) {
    if (!link.notImportedReason) {
      throw new Error(`Profile ${key} has an evidence-only link without a preservation reason.`);
    }
  }
}

function skippedEntry(exclusion: ExclusionProjection) {
  const creatorName = exclusion.label?.trim() || `Unresolved creator for ${exclusion.sha256}`;
  if (exclusion.reason === "collective-or-tradition-not-individual-profile") {
    return { outcome: "collective-or-tradition" as const, creatorName, creatorKind: "collective-or-tradition" as const };
  }
  if (exclusion.reason === "system-or-process-not-profile") {
    return { outcome: "system-or-process" as const, creatorName, creatorKind: "system-or-process" as const };
  }
  if (exclusion.reason === "unverified-public-identity") {
    return { outcome: "unverified" as const, creatorName, creatorKind: "unknown" as const };
  }
  if (exclusion.reason === "ambiguous-or-insufficient-identity") {
    return { outcome: "ambiguous" as const, creatorName, creatorKind: "ambiguous" as const };
  }
  return { outcome: "unresolved" as const, creatorName, creatorKind: "unknown" as const };
}

export function buildContributorProfileImportPayload(args: {
  projection: ContributorProfileImportProjection;
  liveProfiles: LiveContributorProfileSnapshot[];
  operationId: string;
  dryRun: boolean;
  avatarBindings?: Record<string, ContributorAvatarBinding>;
}): Omit<ReviewedProfileImportArgs, "apiKey"> {
  if (args.projection.artifactType !== "replication-index-contributor-profile-import-projection") {
    throw new Error("Unexpected contributor profile projection artifact type.");
  }
  if (args.operationId !== args.projection.campaignId) {
    throw new Error("Contributor import operationId must match the reviewed projection campaignId.");
  }
  const linkLimit = args.projection.counts.profileLinkLimit;
  if (!Number.isInteger(linkLimit) || linkLimit < 1 || linkLimit > MAX_CONTRIBUTOR_PROFILE_LINKS) {
    throw new Error("Contributor projection and application link limits disagree.");
  }
  const liveById = new Map(args.liveProfiles.map((profile) => [profile._id, profile]));
  const entries: ReviewedProfileImportArgs["entries"] = [];
  const projectedKeys = new Set([
    ...args.projection.existingProfiles.map((profile) => profile.key),
    ...args.projection.createProfiles.map((profile) => profile.key),
  ]);
  for (const key of Object.keys(args.avatarBindings ?? {})) {
    if (!projectedKeys.has(key)) {
      throw new Error(`Avatar binding key ${key} is not present in the reviewed projection.`);
    }
  }

  for (const projected of args.projection.existingProfiles) {
    if (projected.operation !== "update-existing-links" && projected.operation !== "reuse-existing") {
      throw new Error(`Unexpected existing-profile operation for ${projected.key}.`);
    }
    const profileId = projected.profileId as Id<"contributorProfiles">;
    const live = liveById.get(profileId);
    if (!live || live.key !== projected.key || live.displayName !== projected.displayName) {
      throw new Error(`Existing profile projection drifted for ${projected.key}.`);
    }
    if (JSON.stringify(live.links) !== JSON.stringify(projected.existingLinks)) {
      throw new Error(`Existing links drifted for ${projected.key}.`);
    }
    const desiredLinks = [...live.links, ...projectedLinks(projected.addLinks)];
    assertLinkPlan(projected.key, desiredLinks, projected.evidenceOnlyLinks, linkLimit);
    const expected = profileState(live);
    const desired = profileState({ ...live, links: desiredLinks }, args.avatarBindings?.[projected.key]);
    entries.push({
      outcome: "existing-profile",
      creatorName: projected.displayName,
      creatorKind: "person",
      profileId,
      expected,
      profile: desired,
    });
  }

  for (const projected of args.projection.createProfiles) {
    if (projected.operation !== "create-candidate") {
      throw new Error(`Unexpected create-profile operation for ${projected.key}.`);
    }
    const links = projectedLinks(projected.links);
    assertLinkPlan(projected.key, links, projected.evidenceOnlyLinks, linkLimit);
    const profile = profileState({
      key: projected.key,
      displayName: projected.displayName,
      aliases: projected.aliases,
      bio: "",
      role: projected.role,
      links,
    }, args.avatarBindings?.[projected.key]);
    entries.push({
      outcome: "reviewed-new",
      creatorName: projected.displayName,
      creatorKind: "person",
      expectedAbsent: true,
      profile,
    });
  }

  entries.push(...args.projection.exclusions.map(skippedEntry));
  if (entries.length > 50) throw new Error("Contributor projection exceeds the 50-entry mutation bound.");

  return {
    operationId: args.operationId,
    dryRun: args.dryRun,
    entries,
  };
}

import {
  normalizeContributorEmail,
  normalizeProfileAliases,
  sanitizeContributorAvatarUrl,
  sanitizeContributorBio,
  sanitizeContributorDisplayName,
  sanitizeContributorLinks,
  sanitizeContributorRole,
  toContributorDisplayName,
} from "../../lib/contributorProfileIdentity";
import type { ProfileLink, StaffNote, StoredProfile } from "./contributorProfiles";

export type EditorProfilePatchInput = {
  displayName?: string;
  bio?: string;
  role?: string | null;
  links?: ProfileLink[];
  aliases?: string[];
  avatarUrl?: string | null;
  avatarStorageId?: string | null;
  avatarR2Key?: string;
  membershipEmail?: string | null;
  exclude_from_gallery?: boolean;
  archival?: boolean;
  approved_replicator?: boolean;
  staffNote?: StaffNote | null;
};

export function buildEditorProfilePatch(
  input: EditorProfilePatchInput,
  existing: StoredProfile,
  actorEmail: string,
  now = new Date().toISOString(),
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    updatedAt: now,
    updatedBy: normalizeContributorEmail(actorEmail),
  };

  const nextDisplayName =
    input.displayName === undefined
      ? existing.displayName
      : sanitizeContributorDisplayName(input.displayName) ||
        existing.displayName ||
        toContributorDisplayName(existing.key);

  if (input.displayName !== undefined) {
    patch.displayName = nextDisplayName;
  }

  if (input.bio !== undefined) {
    patch.bio = sanitizeContributorBio(input.bio);
  }

  if (input.role !== undefined) {
    patch.role =
      input.role === null ? undefined : sanitizeContributorRole(input.role) || undefined;
  }

  if (input.links !== undefined) {
    patch.links = sanitizeContributorLinks(input.links);
  }

  if (input.aliases !== undefined) {
    patch.aliases = normalizeProfileAliases([
      ...input.aliases,
      existing.key.toLowerCase(),
      nextDisplayName,
    ]);
  } else if (input.displayName !== undefined) {
    patch.aliases = normalizeProfileAliases([
      ...(existing.aliases ?? []),
      existing.key.toLowerCase(),
      nextDisplayName,
    ]);
  }

  const requestedStorageId =
    typeof input.avatarStorageId === "string"
      ? input.avatarStorageId.trim()
      : input.avatarStorageId;
  if (input.avatarR2Key) {
    patch.avatarR2Key = input.avatarR2Key;
    patch.avatarStorageId = undefined;
    patch.avatarUrl = undefined;
  } else if (typeof requestedStorageId === "string" && requestedStorageId) {
    patch.avatarStorageId = requestedStorageId;
    patch.avatarR2Key = undefined;
    patch.avatarUrl = undefined;
  } else if (input.avatarUrl === null) {
    patch.avatarStorageId = undefined;
    patch.avatarR2Key = undefined;
    patch.avatarUrl = undefined;
  } else if (input.avatarUrl !== undefined) {
    patch.avatarStorageId = undefined;
    patch.avatarR2Key = undefined;
    patch.avatarUrl = sanitizeContributorAvatarUrl(input.avatarUrl) ?? undefined;
  } else if (
    requestedStorageId === null
    || requestedStorageId === ""
  ) {
    patch.avatarStorageId = undefined;
    patch.avatarR2Key = undefined;
    patch.avatarUrl = undefined;
  }

  if (input.membershipEmail !== undefined) {
    const email =
      input.membershipEmail === null ? "" : normalizeContributorEmail(input.membershipEmail);
    patch.membershipEmail = email || undefined;
  }

  if (input.exclude_from_gallery !== undefined) {
    patch.exclude_from_gallery = input.exclude_from_gallery === true ? true : undefined;
  }

  if (input.archival !== undefined) {
    patch.archival = input.archival === true ? true : undefined;
  }

  if (input.approved_replicator !== undefined) {
    patch.approved_replicator = input.approved_replicator === true ? true : undefined;
  }

  if (input.staffNote !== undefined) {
    const markdown =
      input.staffNote === null ? "" : sanitizeContributorBio(input.staffNote.markdown);
    if (!markdown.trim()) {
      patch.staffNote = undefined;
    } else {
      const attribution =
        input.staffNote === null ? "" : sanitizeContributorRole(input.staffNote.attribution);
      patch.staffNote = attribution ? { markdown, attribution } : { markdown };
    }
  }

  return patch;
}

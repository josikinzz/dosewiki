import { MAX_CONTRIBUTOR_PROFILE_LINKS as MAX_LINKS } from "@server/contributorProfileIdentity";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import {
  normalizeAvatarUpload,
  type NormalizedAvatarUpload,
} from "@server/next/contributorAvatarUpload";

const MAX_BIO_LENGTH = 4_000;
const MAX_ALIASES = 32;
const MAX_SHORT_TEXT = 200;
const MAX_URL_LENGTH = 2_000;

export type ProfilePatchBody = {
  key?: unknown;
  expectedUpdatedAt?: unknown;
  operationId?: unknown;
  displayName?: unknown;
  bio?: unknown;
  role?: unknown;
  links?: unknown;
  aliases?: unknown;
  membershipEmail?: unknown;
  avatarUrl?: unknown;
  exclude_from_gallery?: unknown;
  archival?: unknown;
  approved_replicator?: unknown;
  staffNote?: unknown;
  avatarUpload?: {
    filename?: unknown;
    mimeType?: unknown;
    base64?: unknown;
  };
};

type ProfileLink = { label: string; url: string };

export type ParsedProfilePatch = {
  key: string;
  expectedUpdatedAt: string | null;
  operationId?: string;
  patch: {
    displayName?: string;
    bio?: string;
    role?: string | null;
    links?: ProfileLink[];
    aliases?: string[];
    membershipEmail?: string | null;
    avatarUrl?: string | null;
    exclude_from_gallery?: boolean;
    archival?: boolean;
    approved_replicator?: boolean;
    staffNote?: { markdown: string; attribution?: string } | null;
  };
  avatarUpload: NormalizedAvatarUpload | null;
};

function requireProfileKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key || key.length > MAX_SHORT_TEXT) {
    throw new JsonBodyError(400, "A contributor profile key is required.");
  }
  return key;
}

function parseNullableText(raw: unknown, label: string): string | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === null) {
    return null;
  }
  if (typeof raw !== "string") {
    throw new JsonBodyError(400, `${label} must be a string or null.`);
  }
  if (raw.length > MAX_SHORT_TEXT) {
    throw new JsonBodyError(400, `${label} must be ${MAX_SHORT_TEXT} characters or fewer.`);
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) {
    throw new JsonBodyError(400, "Links must be an array.");
  }
  if (raw.length > MAX_LINKS) {
    throw new JsonBodyError(400, `A profile may carry at most ${MAX_LINKS} links.`);
  }

  return raw.map((entry) => {
    const link = entry as { label?: unknown; url?: unknown };
    const label = typeof link?.label === "string" ? link.label.trim() : "";
    const url = typeof link?.url === "string" ? link.url.trim() : "";
    if (!label || !url) {
      throw new JsonBodyError(400, "Every link needs both a label and a URL.");
    }
    if (label.length > MAX_SHORT_TEXT || url.length > MAX_URL_LENGTH) {
      throw new JsonBodyError(400, "That link label or URL is too long.");
    }
    return { label, url };
  });
}

function parseAliases(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new JsonBodyError(400, "Aliases must be an array.");
  }
  if (raw.length > MAX_ALIASES) {
    throw new JsonBodyError(400, `A profile may carry at most ${MAX_ALIASES} aliases.`);
  }

  return raw.map((entry) => {
    if (typeof entry !== "string") {
      throw new JsonBodyError(400, "Each alias must be a string.");
    }
    const alias = entry.trim();
    if (!alias || alias.length > MAX_SHORT_TEXT) {
      throw new JsonBodyError(400, `An alias must be 1 to ${MAX_SHORT_TEXT} characters.`);
    }
    return alias;
  });
}

function parseStaffNote(
  raw: unknown,
): { markdown: string; attribution?: string } | null {
  if (raw === null) {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new JsonBodyError(400, "The editor's note must be an object or null.");
  }

  const { markdown, attribution } = raw as { markdown?: unknown; attribution?: unknown };
  if (typeof markdown !== "string") {
    throw new JsonBodyError(400, "The editor's note markdown must be a string.");
  }
  if (markdown.length > MAX_BIO_LENGTH) {
    throw new JsonBodyError(
      400,
      `The editor's note must be ${MAX_BIO_LENGTH} characters or fewer.`,
    );
  }
  if (attribution !== undefined && attribution !== null && typeof attribution !== "string") {
    throw new JsonBodyError(400, "The editor's note attribution must be a string.");
  }
  const trimmedAttribution = typeof attribution === "string" ? attribution.trim() : "";
  if (trimmedAttribution.length > MAX_SHORT_TEXT) {
    throw new JsonBodyError(
      400,
      `The editor's note attribution must be ${MAX_SHORT_TEXT} characters or fewer.`,
    );
  }

  if (!markdown.trim()) {
    return null;
  }

  return trimmedAttribution
    ? { markdown, attribution: trimmedAttribution }
    : { markdown };
}

export function parseProfilePatchBody(raw: ProfilePatchBody): ParsedProfilePatch {
  const key = requireProfileKey(raw.key);
  if (raw.expectedUpdatedAt !== null && typeof raw.expectedUpdatedAt !== "string") {
    throw new JsonBodyError(400, "The expected profile revision must be a timestamp or null.");
  }
  if (raw.operationId !== undefined && (typeof raw.operationId !== "string" || !/^[\w-]{16,100}$/.test(raw.operationId))) {
    throw new JsonBodyError(400, "A valid publication operation ID is required.");
  }
  const patch: ParsedProfilePatch["patch"] = {};

  if (raw.displayName !== undefined) {
    if (typeof raw.displayName !== "string" || !raw.displayName.trim()) {
      throw new JsonBodyError(400, "A display name is required.");
    }
    if (raw.displayName.length > MAX_SHORT_TEXT) {
      throw new JsonBodyError(
        400,
        `The display name must be ${MAX_SHORT_TEXT} characters or fewer.`,
      );
    }
    patch.displayName = raw.displayName.trim();
  }

  if (raw.bio !== undefined) {
    if (typeof raw.bio !== "string") {
      throw new JsonBodyError(400, "The bio must be a string.");
    }
    if (raw.bio.length > MAX_BIO_LENGTH) {
      throw new JsonBodyError(400, `The bio must be ${MAX_BIO_LENGTH} characters or fewer.`);
    }
    patch.bio = raw.bio;
  }

  const role = parseNullableText(raw.role, "The role");
  if (role !== undefined) {
    patch.role = role;
  }

  const membershipEmail = parseNullableText(raw.membershipEmail, "The membership email");
  if (membershipEmail !== undefined) {
    patch.membershipEmail = membershipEmail;
  }

  const avatarUrl = parseNullableText(raw.avatarUrl, "The avatar URL");
  if (avatarUrl !== undefined) {
    patch.avatarUrl = avatarUrl;
  }

  if (raw.links !== undefined) {
    patch.links = parseLinks(raw.links);
  }

  if (raw.aliases !== undefined) {
    patch.aliases = parseAliases(raw.aliases);
  }

  if (raw.exclude_from_gallery !== undefined) {
    if (typeof raw.exclude_from_gallery !== "boolean") {
      throw new JsonBodyError(400, "The gallery exclusion flag must be a boolean.");
    }
    patch.exclude_from_gallery = raw.exclude_from_gallery;
  }

  if (raw.archival !== undefined) {
    if (typeof raw.archival !== "boolean") {
      throw new JsonBodyError(400, "The archival flag must be a boolean.");
    }
    patch.archival = raw.archival;
  }

  if (raw.approved_replicator !== undefined) {
    if (typeof raw.approved_replicator !== "boolean") {
      throw new JsonBodyError(400, "The approved replicator flag must be a boolean.");
    }
    patch.approved_replicator = raw.approved_replicator;
  }

  if (raw.staffNote !== undefined) {
    patch.staffNote = parseStaffNote(raw.staffNote);
  }

  let avatarUpload: NormalizedAvatarUpload | null;
  try {
    avatarUpload = normalizeAvatarUpload(raw.avatarUpload);
  } catch (error) {
    throw new JsonBodyError(400, error instanceof Error ? error.message : "Invalid avatar upload.");
  }

  return {
    key,
    expectedUpdatedAt: raw.expectedUpdatedAt as string | null,
    operationId: raw.operationId as string | undefined,
    patch,
    avatarUpload,
  };
}

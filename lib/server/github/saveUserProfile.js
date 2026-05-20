import { Buffer } from "node:buffer";

import { getPayloadByteLength } from "./validation.js";
import {
  TARGET_BRANCH,
  loadFileFromRepo,
} from "./client.js";
import {
  DEFAULT_GITHUB_FILE_CHANGE_TARGET,
  applyGitHubFileChangeSet,
  createDefaultGitHubRepositoryAdapter,
} from "./fileChange.js";

const USER_PROFILES_PATH = "src/data/config/userProfiles.json";
const MAX_BIO_LENGTH = 4000;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_LINKS = 3;
const MAX_LINK_LABEL_LENGTH = 60;
const HTTPS_PROTOCOL = "https:";
const AVATAR_DIRECTORY = "public/profile-avatars";
const AVATAR_PUBLIC_BASE_PATH = "/profile-avatars";
const AVATAR_CACHE_BUSTER_PATTERN = /[:.]/g;
const MAX_AVATAR_SIZE_BYTES = 1024 * 1024 * 2;
export const MAX_PROFILE_PAYLOAD_BYTES = 3 * 1024 * 1024;

const ALLOWED_AVATAR_MIME_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

class ValidationError extends RequestError {
  constructor(message) {
    super(400, message);
    this.name = "ValidationError";
  }
}

const toDisplayName = (key) =>
  key
    .split(/[_\-\s]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ") || key;

const sanitizeDisplayName = (value, { strict } = { strict: false }) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    if (strict) {
      throw new ValidationError("Display name must be a string.");
    }
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    if (strict) {
      throw new ValidationError(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
    }
    return trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH);
  }

  return trimmed;
};

const sanitizeBio = (value, { strict } = { strict: false }) => {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    if (strict) {
      throw new ValidationError("Bio must be a string.");
    }
    return "";
  }

  const normalized = value.replace(/\r\n/g, "\n");
  if (normalized.length > MAX_BIO_LENGTH) {
    if (strict) {
      throw new ValidationError(`Bio must be ${MAX_BIO_LENGTH} characters or fewer.`);
    }
    return normalized.slice(0, MAX_BIO_LENGTH);
  }

  return normalized;
};

const sanitizeAvatarUrl = (value, { strict } = { strict: false }) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    if (strict) {
      throw new ValidationError("Avatar URL must be a string.");
    }
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new globalThis.URL(trimmed, "https://dose.wiki");
    const isLocalAvatar = parsed.origin === "https://dose.wiki" && parsed.pathname.startsWith(`${AVATAR_PUBLIC_BASE_PATH}/`);
    if (parsed.protocol !== HTTPS_PROTOCOL && !isLocalAvatar) {
      throw new ValidationError("Avatar URL must use https.");
    }
    return isLocalAvatar ? `${AVATAR_PUBLIC_BASE_PATH}/${parsed.pathname.split("/").pop()}` : parsed.toString();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    if (strict) {
      throw new ValidationError("Avatar URL must be a valid absolute URL or local avatar path.");
    }
    return null;
  }
};

const sanitizeLinkLabel = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed.length > MAX_LINK_LABEL_LENGTH ? trimmed.slice(0, MAX_LINK_LABEL_LENGTH) : trimmed;
};

const sanitizeLinkUrl = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new globalThis.URL(trimmed);
    if (parsed.protocol !== HTTPS_PROTOCOL) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

const sanitizeLinks = (value, { strict } = { strict: false }) => {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    if (strict) {
      throw new ValidationError("Links must be an array.");
    }
    return [];
  }

  const normalizedLinks = [];

  value.slice(0, MAX_LINKS).forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const label = sanitizeLinkLabel(entry.label);
    const url = sanitizeLinkUrl(entry.url);

    if (!label && !url) {
      return;
    }

    if (!label || !url) {
      if (strict) {
        throw new ValidationError("Each link requires both a label and an https URL.");
      }
      return;
    }

    normalizedLinks.push({ label, url });
  });

  return normalizedLinks;
};

const normalizeProfileKey = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toUpperCase();
};

const normalizeIncomingProfile = (value, fallbackKey, avatarUrlOverride = undefined) => {
  const source = value && typeof value === "object" ? value : {};
  const explicitKey = normalizeProfileKey(source.key);
  const key = explicitKey || fallbackKey;

  if (!key) {
    throw new ValidationError("Profile key is required.");
  }

  const displayName = sanitizeDisplayName(source.displayName, { strict: true }) ?? toDisplayName(key);
  const bio = sanitizeBio(source.bio, { strict: true });
  const links = sanitizeLinks(source.links, { strict: true });
  const avatarUrl = avatarUrlOverride !== undefined
    ? avatarUrlOverride
    : sanitizeAvatarUrl(source.avatarUrl, { strict: true });

  return {
    key,
    displayName,
    bio,
    links,
    avatarUrl,
    aliases: Array.isArray(source.aliases)
      ? source.aliases.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    hasCustomBio: bio.trim().length > 0,
  };
};

const parseProfiles = (content) => {
  if (typeof content !== "string" || content.trim().length === 0) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Unable to parse userProfiles.json: ${error instanceof Error ? error.message : String(error)}`);
  }

  return Array.isArray(parsed) ? parsed : [];
};

const upsertProfile = (existingProfiles, nextProfile) => {
  const profileIndex = existingProfiles.findIndex((profile) => normalizeProfileKey(profile?.key) === nextProfile.key);

  if (profileIndex === -1) {
    return [...existingProfiles, nextProfile].sort((a, b) => a.key.localeCompare(b.key));
  }

  const updated = [...existingProfiles];
  updated[profileIndex] = {
    ...existingProfiles[profileIndex],
    ...nextProfile,
  };
  return updated;
};

const sanitizeAvatarUpload = (value) => {
  if (!value || typeof value !== "object") {
    throw new ValidationError("Avatar upload payload must be an object.");
  }

  const filename = typeof value.filename === "string" ? value.filename.trim() : "";
  const mimeType = typeof value.mimeType === "string" ? value.mimeType.trim().toLowerCase() : "";
  const extension = ALLOWED_AVATAR_MIME_TYPES.get(mimeType);
  const base64 = typeof value.base64 === "string" ? value.base64.trim() : "";

  if (!filename) {
    throw new ValidationError("Avatar filename is required.");
  }

  if (!extension) {
    throw new ValidationError("Avatar must be a PNG, JPG, or WebP image.");
  }

  if (!base64) {
    throw new ValidationError("Avatar image data is required.");
  }

  const sanitizedBase64 = base64.replace(/^data:[^;]+;base64,/, "");

  let sizeBytes = 0;
  try {
    sizeBytes = Buffer.from(sanitizedBase64, "base64").byteLength;
  } catch {
    throw new ValidationError("Avatar image data is not valid base64.");
  }

  if (sizeBytes === 0) {
    throw new ValidationError("Avatar image data is empty.");
  }

  if (sizeBytes > MAX_AVATAR_SIZE_BYTES) {
    const maxSizeMb = (MAX_AVATAR_SIZE_BYTES / (1024 * 1024)).toFixed(1);
    throw new ValidationError(`Avatar image must be ${maxSizeMb} MB or smaller.`);
  }

  return {
    filename,
    mimeType,
    extension,
    base64: sanitizedBase64,
  };
};

const buildAvatarAsset = (canonicalKey, extension, cacheBuster) => {
  const normalizedKey = canonicalKey.toLowerCase();
  const fileName = `${normalizedKey}-${cacheBuster}.${extension}`;
  return {
    repoPath: `${AVATAR_DIRECTORY}/${fileName}`,
    publicUrl: `${AVATAR_PUBLIC_BASE_PATH}/${fileName}`,
  };
};

export function getProfilePayloadByteLength(payload) {
  return getPayloadByteLength(payload);
}

export async function buildUserProfileFileChangeSet({
  body,
  submittedBy,
  existingProfiles = [],
  timestamp = new Date(),
} = {}) {
  const canonicalKey = typeof submittedBy === "string" ? submittedBy.trim().toUpperCase() : "";

  if (!canonicalKey) {
    throw new RequestError(400, "A contributor key is required to save a profile.");
  }

  const avatarUploadPayload = body.avatarUpload ? sanitizeAvatarUpload(body.avatarUpload) : null;
  let avatarAsset = null;

  if (avatarUploadPayload) {
    const cacheBuster = timestamp.toISOString().replace(AVATAR_CACHE_BUSTER_PATTERN, "-");
    avatarAsset = buildAvatarAsset(canonicalKey, avatarUploadPayload.extension, cacheBuster);
  }

  const normalizedProfile = normalizeIncomingProfile(
    body.profile,
    canonicalKey,
    avatarAsset?.publicUrl,
  );

  const nextProfiles = upsertProfile(existingProfiles, normalizedProfile);

  const previousSerialized = JSON.stringify(existingProfiles);
  const nextSerialized = JSON.stringify(nextProfiles);

  if (previousSerialized === nextSerialized) {
    return {
      success: true,
      unchanged: true,
      profile: normalizedProfile,
      submittedBy: canonicalKey,
    };
  }

  const serializedProfiles = JSON.stringify(nextProfiles, null, 2);
  const isoTimestamp = timestamp.toISOString();
  const files = [
    {
      name: "user-profiles",
      path: USER_PROFILES_PATH,
      content: serializedProfiles,
    },
  ];

  if (avatarUploadPayload && avatarAsset) {
    files.push({
      name: "profile-avatar",
      path: avatarAsset.repoPath,
      content: avatarUploadPayload.base64,
      encoding: "base64",
    });
  }

  const commitMessage = `Update profile for ${canonicalKey}`;

  return {
    changeSet: {
      kind: "backup",
      target: DEFAULT_GITHUB_FILE_CHANGE_TARGET,
      actor: { key: canonicalKey },
      message: commitMessage,
      timestamp: isoTimestamp,
      files,
    },
    profile: normalizedProfile,
    submittedBy: canonicalKey,
  };
}

export async function saveUserProfileWithGitHub({ body, submittedBy, githubToken, repository } = {}) {
  const timestamp = new Date();
  await buildUserProfileFileChangeSet({
    body,
    submittedBy,
    existingProfiles: [],
    timestamp,
  });

  const { content: existingContent } = await loadFileFromRepo(githubToken, USER_PROFILES_PATH, TARGET_BRANCH);
  const existingProfiles = parseProfiles(existingContent ?? "");
  const result = await buildUserProfileFileChangeSet({
    body,
    submittedBy,
    existingProfiles,
    timestamp,
  });

  if (result.unchanged) {
    return result;
  }

  const fileChangeResult = await applyGitHubFileChangeSet(result.changeSet, {
    repository: repository ?? createDefaultGitHubRepositoryAdapter(githubToken),
  });

  return {
    success: true,
    commitSha: fileChangeResult.commitSha,
    commitUrl: fileChangeResult.commitUrl,
    profile: result.profile,
    submittedBy: result.submittedBy,
    createdAt: fileChangeResult.createdAt,
  };
}

import { verifyCredentials } from "./_utils/passwords.js";
import { parseBody } from "./_utils/parseBody.js";
import {
  TARGET_BRANCH,
  buildCommitUrl,
  createBlob,
  createCommit,
  createTree,
  getRepositoryState,
  loadFileFromRepo,
  updateReference,
} from "./_utils/github.js";

const USER_PROFILES_PATH = "src/data/userProfiles.json";
const MAX_BIO_LENGTH = 4000;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_LINKS = 3;
const MAX_LINK_LABEL_LENGTH = 60;
const HTTPS_PROTOCOL = "https:";

class ValidationError extends Error {}

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
    const url = new URL(trimmed);
    if (url.protocol !== HTTPS_PROTOCOL) {
      throw new ValidationError("Avatar URL must use https://");
    }
    return url.toString();
  } catch (error) {
    if (strict) {
      throw new ValidationError("Avatar URL must be a valid https:// link.");
    }
    return null;
  }
};

const sanitizeLinks = (links, { strict } = { strict: false }) => {
  if (links === undefined || links === null) {
    return [];
  }

  if (!Array.isArray(links)) {
    if (strict) {
      throw new ValidationError("Links must be an array.");
    }
    return [];
  }

  const normalized = [];

  for (const entry of links) {
    if (normalized.length >= MAX_LINKS) {
      break;
    }

    if (!entry || typeof entry !== "object") {
      if (strict) {
        throw new ValidationError("Invalid link entry supplied.");
      }
      continue;
    }

    const rawLabel = entry.label;
    const rawUrl = entry.url;
    if (typeof rawLabel !== "string" || typeof rawUrl !== "string") {
      if (strict) {
        throw new ValidationError("Each link must include a label and url string.");
      }
      continue;
    }

    const labelCandidate = rawLabel.trim();
    const urlCandidate = rawUrl.trim();

    if (!labelCandidate || !urlCandidate) {
      if (strict) {
        throw new ValidationError("Link entries require both label and URL values.");
      }
      continue;
    }

    let label = labelCandidate;
    if (label.length > MAX_LINK_LABEL_LENGTH) {
      if (strict) {
        throw new ValidationError(`Link labels must be ${MAX_LINK_LABEL_LENGTH} characters or fewer.`);
      }
      label = label.slice(0, MAX_LINK_LABEL_LENGTH);
    }

    try {
      const parsedUrl = new URL(urlCandidate);
      if (parsedUrl.protocol !== HTTPS_PROTOCOL) {
        throw new ValidationError("Link URLs must use https://");
      }
      normalized.push({ label, url: parsedUrl.toString() });
    } catch (error) {
      if (strict) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new ValidationError("Link URLs must be valid https:// addresses.");
      }
    }
  }

  return normalized;
};

const normalizeStoredProfile = (record) => {
  if (!record || typeof record !== "object") {
    return null;
  }

  const rawKey = record.key;
  if (typeof rawKey !== "string") {
    return null;
  }

  const key = rawKey.trim().toUpperCase();
  if (!key) {
    return null;
  }

  const displayName = sanitizeDisplayName(record.displayName, { strict: false }) ?? toDisplayName(key);
  const avatarUrl = sanitizeAvatarUrl(record.avatarUrl, { strict: false });
  const bio = sanitizeBio(record.bio, { strict: false });
  const links = sanitizeLinks(record.links, { strict: false });

  const normalized = {
    key,
    displayName,
    bio,
    links,
  };

  if (avatarUrl) {
    normalized.avatarUrl = avatarUrl;
  }

  return normalized;
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

  if (!Array.isArray(parsed)) {
    return [];
  }

  const normalized = [];
  for (const entry of parsed) {
    const normalizedEntry = normalizeStoredProfile(entry);
    if (normalizedEntry) {
      normalized.push(normalizedEntry);
    }
  }

  normalized.sort((a, b) => a.key.localeCompare(b.key));
  return normalized;
};

const normalizeIncomingProfile = (profile, canonicalKey) => {
  if (!profile || typeof profile !== "object") {
    throw new ValidationError("Profile payload is required.");
  }

  const displayName = sanitizeDisplayName(profile.displayName, { strict: true }) ?? toDisplayName(canonicalKey);
  const avatarUrl = sanitizeAvatarUrl(profile.avatarUrl, { strict: true });
  const bio = sanitizeBio(profile.bio, { strict: true });
  const links = sanitizeLinks(profile.links, { strict: true });

  const normalized = {
    key: canonicalKey,
    displayName,
    bio,
    links,
  };

  if (avatarUrl) {
    normalized.avatarUrl = avatarUrl;
  }

  return normalized;
};

const upsertProfile = (profiles, nextProfile) => {
  const next = [...profiles];
  const index = next.findIndex((entry) => entry.key === nextProfile.key);
  if (index >= 0) {
    next[index] = nextProfile;
  } else {
    next.push(nextProfile);
  }
  next.sort((a, b) => a.key.localeCompare(b.key));
  return next;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return res.status(500).json({ error: "GitHub token missing from environment." });
  }

  const body = parseBody(req.body);
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (!trimmedUsername || !trimmedPassword) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const isValid = verifyCredentials(trimmedUsername, trimmedPassword);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const canonicalKey = trimmedUsername.toUpperCase();

  try {
    const normalizedProfile = normalizeIncomingProfile(body.profile, canonicalKey);

    const { content: existingContent } = await loadFileFromRepo(githubToken, USER_PROFILES_PATH, TARGET_BRANCH);
    const existingProfiles = parseProfiles(existingContent ?? "");
    const nextProfiles = upsertProfile(existingProfiles, normalizedProfile);

    const previousSerialized = JSON.stringify(existingProfiles);
    const nextSerialized = JSON.stringify(nextProfiles);

    if (previousSerialized === nextSerialized) {
      return res.status(200).json({
        success: true,
        unchanged: true,
        profile: normalizedProfile,
        submittedBy: canonicalKey,
      });
    }

    const serializedProfiles = JSON.stringify(nextProfiles, null, 2);
    const isoTimestamp = new Date().toISOString();
    const { parentSha, baseTreeSha } = await getRepositoryState(githubToken, TARGET_BRANCH);
    const profilesBlobSha = await createBlob(githubToken, serializedProfiles);
    const treeEntries = [
      {
        path: USER_PROFILES_PATH,
        mode: "100644",
        type: "blob",
        sha: profilesBlobSha,
      },
    ];

    const treeSha = await createTree(githubToken, baseTreeSha, treeEntries);
    const commitMessage = `Update profile for ${canonicalKey}`;
    const commitSha = await createCommit(githubToken, commitMessage, treeSha, parentSha, isoTimestamp);
    await updateReference(githubToken, commitSha, TARGET_BRANCH);

    return res.status(200).json({
      success: true,
      commitSha,
      commitUrl: buildCommitUrl(commitSha),
      profile: normalizedProfile,
      submittedBy: canonicalKey,
      createdAt: isoTimestamp,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error occurred.";
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
}

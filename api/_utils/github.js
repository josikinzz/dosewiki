import { Buffer } from "node:buffer";

export const REPO_OWNER = "josikinzz";
export const REPO_NAME = "dosewiki";
export const TARGET_BRANCH = "main";
export const USER_AGENT = "dose.wiki-dev-editor";

const API_BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

export const DEFAULT_COMMIT_AUTHOR = {
  name: "dose.wiki Dev Editor",
  email: "dev-editor@dose.wiki",
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

export const encodeRepositoryPath = (path) =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

export const githubRequest = async (token, path, options = {}) => {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
    ...(options.headers ?? {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  return { response, payload };
};

export const loadFileFromRepo = async (token, path, branch = TARGET_BRANCH) => {
  const encodedPath = encodeRepositoryPath(path);
  const { response, payload } = await githubRequest(token, `/contents/${encodedPath}?ref=${branch}`);

  if (response.status === 404) {
    return { content: null, sha: null };
  }

  if (!response.ok) {
    throw new Error(payload?.message ?? `Failed to load ${path}.`);
  }

  try {
    const encoding = payload?.encoding === "base64" ? "base64" : "utf8";
    const buffer = Buffer.from(payload?.content ?? "", encoding);
    const text = buffer.toString("utf8");
    const sha = typeof payload?.sha === "string" ? payload.sha : null;
    return { content: text, sha };
  } catch (error) {
    throw new Error(`Unable to decode ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const getRepositoryState = async (token, branch = TARGET_BRANCH) => {
  const { response: refResponse, payload: refPayload } = await githubRequest(token, `/git/ref/heads/${branch}`);

  if (!refResponse.ok) {
    throw new Error(refPayload?.message ?? "Unable to load repository reference.");
  }

  const parentSha = refPayload?.object?.sha;
  if (!isNonEmptyString(parentSha)) {
    throw new Error("Repository reference is missing a commit SHA.");
  }

  const { response: commitResponse, payload: commitPayload } = await githubRequest(
    token,
    `/git/commits/${parentSha}`,
  );

  if (!commitResponse.ok) {
    throw new Error(commitPayload?.message ?? "Unable to load parent commit.");
  }

  const baseTreeSha = commitPayload?.tree?.sha;
  if (!isNonEmptyString(baseTreeSha)) {
    throw new Error("Parent commit is missing tree metadata.");
  }

  return {
    parentSha,
    baseTreeSha,
  };
};

export const createBlob = async (token, content, encoding = "utf-8") => {
  const { response, payload } = await githubRequest(token, "/git/blobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, encoding }),
  });

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to create blob.");
  }

  if (!isNonEmptyString(payload?.sha)) {
    throw new Error("GitHub did not return a blob SHA.");
  }

  return payload.sha;
};

export const createTree = async (token, baseTreeSha, entries) => {
  const { response, payload } = await githubRequest(token, "/git/trees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: entries,
    }),
  });

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to create git tree.");
  }

  if (!isNonEmptyString(payload?.sha)) {
    throw new Error("GitHub did not return a tree SHA.");
  }

  return payload.sha;
};

export const createCommit = async (
  token,
  message,
  treeSha,
  parentSha,
  isoTimestamp,
  author = DEFAULT_COMMIT_AUTHOR,
) => {
  const authorRecord = {
    ...author,
    date: isoTimestamp,
  };

  const { response, payload } = await githubRequest(token, "/git/commits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
      author: authorRecord,
      committer: authorRecord,
    }),
  });

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to create commit.");
  }

  if (!isNonEmptyString(payload?.sha)) {
    throw new Error("GitHub did not return a commit SHA.");
  }

  return payload.sha;
};

export const updateReference = async (token, commitSha, branch = TARGET_BRANCH) => {
  const { response, payload } = await githubRequest(token, `/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commitSha, force: false }),
  });

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to update repository reference.");
  }
};

export const buildCommitUrl = (sha) => `https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${sha}`;

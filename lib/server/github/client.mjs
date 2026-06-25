import { Buffer } from "node:buffer";
import { createLogger } from "../logger.mjs";

const log = createLogger("github");

export const REPO_OWNER = "josikinzz";
export const REPO_NAME = "dosewiki-admin";
export const TARGET_BRANCH = "main";
export const USER_AGENT = "dose.wiki-dev-editor";

const API_BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

export const DEFAULT_COMMIT_AUTHOR = {
  name: "dose.wiki Dev Editor",
  email: "contact@dose.wiki",
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

  const url = `${API_BASE_URL}${path}`;
  const method = options.method || "GET";
  log.debug(`${method} ${path}`);

  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    log.error(`${method} ${path} failed:`, response.status, payload?.message || "Unknown error");
  }

  return { response, payload };
};

export const loadFileFromRepo = async (token, path, branch = TARGET_BRANCH) => {
  const encodedPath = encodeRepositoryPath(path);
  log.debug(`Loading file: ${path} from branch: ${branch}`);
  const { response, payload } = await githubRequest(token, `/contents/${encodedPath}?ref=${branch}`);

  if (response.status === 404) {
    log.debug(`File not found: ${path} (this may be okay for new files)`);
    return { content: null, sha: null };
  }

  if (!response.ok) {
    log.error(`Failed to load ${path}:`, payload?.message);
    throw new Error(payload?.message ?? `Failed to load ${path}.`);
  }

  log.debug(`Successfully loaded file: ${path}`);

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
  log.debug(`Getting repository state for ${REPO_OWNER}/${REPO_NAME} branch: ${branch}`);
  const { response: refResponse, payload: refPayload } = await githubRequest(token, `/git/ref/heads/${branch}`);

  if (!refResponse.ok) {
    log.error(`Failed to get branch ref:`, refPayload?.message, `(status: ${refResponse.status})`);
    throw new Error(refPayload?.message ?? "Unable to load repository reference.");
  }

  const parentSha = refPayload?.object?.sha;
  if (!isNonEmptyString(parentSha)) {
    log.error("Branch ref response missing SHA");
    throw new Error("Repository reference is missing a commit SHA.");
  }

  log.debug(`Got branch ref, parent SHA: ${parentSha.slice(0, 7)}`);

  const { response: commitResponse, payload: commitPayload } = await githubRequest(
    token,
    `/git/commits/${parentSha}`,
  );

  if (!commitResponse.ok) {
    log.error(`Failed to get parent commit:`, commitPayload?.message);
    throw new Error(commitPayload?.message ?? "Unable to load parent commit.");
  }

  const baseTreeSha = commitPayload?.tree?.sha;
  if (!isNonEmptyString(baseTreeSha)) {
    log.error("Commit response missing tree SHA");
    throw new Error("Parent commit is missing tree metadata.");
  }

  log.debug(`Got parent commit, tree SHA: ${baseTreeSha.slice(0, 7)}`);

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
  log.debug(`Updating branch ${branch} to commit ${commitSha.slice(0, 7)}`);
  const { response, payload } = await githubRequest(token, `/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commitSha, force: false }),
  });

  if (!response.ok) {
    log.error(`Failed to update branch reference:`, payload?.message, `(status: ${response.status})`);
    log.error("This often means the token lacks push permissions or the branch is protected");
    throw new Error(payload?.message ?? "Failed to update repository reference.");
  }

  log.info("Branch reference updated successfully");
};

export const buildCommitUrl = (sha) => `https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${sha}`;

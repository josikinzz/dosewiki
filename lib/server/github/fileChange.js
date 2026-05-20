import {
  DEFAULT_COMMIT_AUTHOR,
  REPO_NAME,
  REPO_OWNER,
  TARGET_BRANCH,
  buildCommitUrl,
  createBlob,
  createCommit,
  createTree,
  getRepositoryState,
  updateReference,
} from "./client.js";

export const DEFAULT_GITHUB_FILE_CHANGE_TARGET = Object.freeze({
  owner: REPO_OWNER,
  repo: REPO_NAME,
  branch: TARGET_BRANCH,
});

const FILE_CHANGE_KINDS = new Set(["backup", "export"]);

export class GitHubFileChangeError extends Error {
  constructor(message, { cause, code } = {}) {
    super(message);
    this.name = "GitHubFileChangeError";
    this.code = code ?? "GITHUB_FILE_CHANGE_FAILED";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const normalizeTarget = (target = {}) => ({
  owner: isNonEmptyString(target.owner) ? target.owner.trim() : DEFAULT_GITHUB_FILE_CHANGE_TARGET.owner,
  repo: isNonEmptyString(target.repo) ? target.repo.trim() : DEFAULT_GITHUB_FILE_CHANGE_TARGET.repo,
  branch: isNonEmptyString(target.branch) ? target.branch.trim() : DEFAULT_GITHUB_FILE_CHANGE_TARGET.branch,
});

const normalizeActor = (actor) => {
  if (typeof actor === "string" && actor.trim().length > 0) {
    return { key: actor.trim() };
  }

  if (!actor || typeof actor !== "object") {
    throw new GitHubFileChangeError("A GitHub file change actor is required.", { code: "INVALID_CHANGE_SET" });
  }

  const key = typeof actor.key === "string" ? actor.key.trim() : "";
  if (!key) {
    throw new GitHubFileChangeError("A GitHub file change actor key is required.", { code: "INVALID_CHANGE_SET" });
  }

  return {
    ...actor,
    key,
  };
};

const normalizeFileUpdates = (files) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new GitHubFileChangeError("At least one GitHub file update is required.", { code: "INVALID_CHANGE_SET" });
  }

  return files.map((file, index) => {
    if (!file || typeof file !== "object") {
      throw new GitHubFileChangeError(`GitHub file update ${index + 1} must be an object.`, {
        code: "INVALID_CHANGE_SET",
      });
    }

    const path = typeof file.path === "string" ? file.path.trim() : "";
    if (!path) {
      throw new GitHubFileChangeError(`GitHub file update ${index + 1} is missing a path.`, {
        code: "INVALID_CHANGE_SET",
      });
    }

    if (typeof file.content !== "string") {
      throw new GitHubFileChangeError(`GitHub file update ${path} must provide string content.`, {
        code: "INVALID_CHANGE_SET",
      });
    }

    return {
      name: isNonEmptyString(file.name) ? file.name.trim() : path,
      path,
      content: file.content,
      encoding: file.encoding === "base64" ? "base64" : "utf-8",
    };
  });
};

export const createDefaultGitHubRepositoryAdapter = (token) => ({
  getState: (branch) => getRepositoryState(token, branch),
  createBlob: (content, encoding) => createBlob(token, content, encoding),
  createTree: (baseTreeSha, entries) => createTree(token, baseTreeSha, entries),
  createCommit: (message, treeSha, parentSha, isoTimestamp, author) =>
    createCommit(token, message, treeSha, parentSha, isoTimestamp, author),
  updateReference: (commitSha, branch) => updateReference(token, commitSha, branch),
  buildCommitUrl,
});

export const validateGitHubFileChangeSet = (changeSet) => {
  if (!changeSet || typeof changeSet !== "object") {
    throw new GitHubFileChangeError("GitHub file change set must be an object.", { code: "INVALID_CHANGE_SET" });
  }

  const kind = typeof changeSet.kind === "string" ? changeSet.kind.trim() : "";
  if (!FILE_CHANGE_KINDS.has(kind)) {
    throw new GitHubFileChangeError("GitHub file change kind must be backup or export.", {
      code: "INVALID_CHANGE_SET",
    });
  }

  const message = typeof changeSet.message === "string" ? changeSet.message.trim() : "";
  if (!message) {
    throw new GitHubFileChangeError("GitHub file change commit message is required.", {
      code: "INVALID_CHANGE_SET",
    });
  }

  return {
    kind,
    target: normalizeTarget(changeSet.target),
    actor: normalizeActor(changeSet.actor),
    message,
    files: normalizeFileUpdates(changeSet.files),
    author: changeSet.author && typeof changeSet.author === "object" ? changeSet.author : DEFAULT_COMMIT_AUTHOR,
    timestamp:
      changeSet.timestamp instanceof Date
        ? changeSet.timestamp.toISOString()
        : isNonEmptyString(changeSet.timestamp)
          ? changeSet.timestamp.trim()
          : new Date().toISOString(),
  };
};

const mapRepositoryError = (error, phase) => {
  const message = error instanceof Error ? error.message : String(error);
  if (phase === "updateReference") {
    return new GitHubFileChangeError(`Unable to update GitHub branch reference: ${message}`, {
      cause: error,
      code: "BRANCH_UPDATE_FAILED",
    });
  }

  return new GitHubFileChangeError(`Unable to apply GitHub file change during ${phase}: ${message}`, {
    cause: error,
  });
};

export async function applyGitHubFileChangeSet(changeSet, { repository } = {}) {
  const normalized = validateGitHubFileChangeSet(changeSet);
  const repo = repository ?? createDefaultGitHubRepositoryAdapter(changeSet.githubToken);

  if (!repo || typeof repo !== "object") {
    throw new GitHubFileChangeError("A GitHub repository adapter is required.", { code: "INVALID_REPOSITORY_ADAPTER" });
  }

  let state;
  try {
    state = await repo.getState(normalized.target.branch);
  } catch (error) {
    throw mapRepositoryError(error, "getState");
  }

  const parentSha = typeof state?.parentSha === "string" ? state.parentSha : "";
  const baseTreeSha = typeof state?.baseTreeSha === "string" ? state.baseTreeSha : "";
  if (!parentSha || !baseTreeSha) {
    throw new GitHubFileChangeError("GitHub repository state is missing parent or tree SHA.", {
      code: "MISSING_REPOSITORY_SHA",
    });
  }

  const treeEntries = [];
  for (const file of normalized.files) {
    let blobSha;
    try {
      blobSha = await repo.createBlob(file.content, file.encoding);
    } catch (error) {
      throw mapRepositoryError(error, "createBlob");
    }

    if (!isNonEmptyString(blobSha)) {
      throw new GitHubFileChangeError(`GitHub did not return a blob SHA for ${file.path}.`, {
        code: "MISSING_BLOB_SHA",
      });
    }

    treeEntries.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blobSha,
    });
  }

  let treeSha;
  try {
    treeSha = await repo.createTree(baseTreeSha, treeEntries);
  } catch (error) {
    throw mapRepositoryError(error, "createTree");
  }

  if (!isNonEmptyString(treeSha)) {
    throw new GitHubFileChangeError("GitHub did not return a tree SHA.", { code: "MISSING_TREE_SHA" });
  }

  let commitSha;
  try {
    commitSha = await repo.createCommit(normalized.message, treeSha, parentSha, normalized.timestamp, normalized.author);
  } catch (error) {
    throw mapRepositoryError(error, "createCommit");
  }

  if (!isNonEmptyString(commitSha)) {
    throw new GitHubFileChangeError("GitHub did not return a commit SHA.", { code: "MISSING_COMMIT_SHA" });
  }

  try {
    await repo.updateReference(commitSha, normalized.target.branch);
  } catch (error) {
    throw mapRepositoryError(error, "updateReference");
  }

  return {
    success: true,
    kind: normalized.kind,
    target: normalized.target,
    actor: normalized.actor,
    commitSha,
    commitUrl:
      typeof repo.buildCommitUrl === "function"
        ? repo.buildCommitUrl(commitSha, normalized.target)
        : buildCommitUrl(commitSha),
    createdAt: normalized.timestamp,
    files: normalized.files.map(({ name, path, encoding }) => ({ name, path, encoding })),
  };
}

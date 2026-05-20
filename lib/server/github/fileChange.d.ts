import type { CommitAuthor, GitTreeEntry, RepositoryState } from "./client.js";

export type GitHubFileChangeTarget = {
  owner: string;
  repo: string;
  branch: string;
};

export type GitHubFileChangeActor = {
  key: string;
  [key: string]: unknown;
};

export type GitHubFileUpdateInput = {
  name?: string;
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
};

export type NormalizedGitHubFileUpdate = Required<GitHubFileUpdateInput>;

export type GitHubFileChangeSet = {
  kind: "backup" | "export";
  target?: Partial<GitHubFileChangeTarget>;
  actor: string | GitHubFileChangeActor;
  message: string;
  files: GitHubFileUpdateInput[];
  author?: CommitAuthor;
  timestamp?: string | Date;
  githubToken?: string;
};

export type NormalizedGitHubFileChangeSet = {
  kind: "backup" | "export";
  target: GitHubFileChangeTarget;
  actor: GitHubFileChangeActor;
  message: string;
  files: NormalizedGitHubFileUpdate[];
  author: CommitAuthor;
  timestamp: string;
};

export type GitHubRepositoryAdapter = {
  getState(branch: string): Promise<RepositoryState>;
  createBlob(content: string, encoding: "utf-8" | "base64"): Promise<string>;
  createTree(baseTreeSha: string, entries: GitTreeEntry[]): Promise<string>;
  createCommit(
    message: string,
    treeSha: string,
    parentSha: string,
    isoTimestamp: string,
    author: CommitAuthor,
  ): Promise<string>;
  updateReference(commitSha: string, branch: string): Promise<void>;
  buildCommitUrl?(sha: string, target?: GitHubFileChangeTarget): string;
};

export type GitHubFileChangeResult = {
  success: true;
  kind: "backup" | "export";
  target: GitHubFileChangeTarget;
  actor: GitHubFileChangeActor;
  commitSha: string;
  commitUrl: string;
  createdAt: string;
  files: Array<Pick<NormalizedGitHubFileUpdate, "name" | "path" | "encoding">>;
};

export const DEFAULT_GITHUB_FILE_CHANGE_TARGET: Readonly<GitHubFileChangeTarget>;

export class GitHubFileChangeError extends Error {
  code: string;
  constructor(message: string, options?: { cause?: unknown; code?: string });
}

export function createDefaultGitHubRepositoryAdapter(
  token: string,
): GitHubRepositoryAdapter;
export function validateGitHubFileChangeSet(
  changeSet: unknown,
): NormalizedGitHubFileChangeSet;
export function applyGitHubFileChangeSet(
  changeSet: unknown,
  options?: { repository?: Partial<GitHubRepositoryAdapter> },
): Promise<GitHubFileChangeResult>;

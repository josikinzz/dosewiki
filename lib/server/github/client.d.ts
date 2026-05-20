export type GitHubRequestOptions = RequestInit & {
  headers?: HeadersInit;
};

export type GitHubRequestResult = {
  response: Response;
  payload: unknown;
};

export type RepositoryState = {
  parentSha: string;
  baseTreeSha: string;
};

export type CommitAuthor = {
  name: string;
  email: string;
};

export const REPO_OWNER: string;
export const REPO_NAME: string;
export const TARGET_BRANCH: string;
export const USER_AGENT: string;
export const DEFAULT_COMMIT_AUTHOR: CommitAuthor;

export function encodeRepositoryPath(path: string): string;
export function githubRequest(
  token: string,
  path: string,
  options?: GitHubRequestOptions,
): Promise<GitHubRequestResult>;
export function loadFileFromRepo(
  token: string,
  path: string,
  branch?: string,
): Promise<{ content: string | null; sha: string | null }>;
export function getRepositoryState(
  token: string,
  branch?: string,
): Promise<RepositoryState>;
export function createBlob(
  token: string,
  content: string,
  encoding?: "utf-8" | "base64",
): Promise<string>;
export function createTree(
  token: string,
  baseTreeSha: string,
  entries: GitTreeEntry[],
): Promise<string>;
export function createCommit(
  token: string,
  message: string,
  treeSha: string,
  parentSha: string,
  isoTimestamp: string,
  author?: CommitAuthor,
): Promise<string>;
export function updateReference(
  token: string,
  commitSha: string,
  branch?: string,
): Promise<void>;
export function buildCommitUrl(sha: string): string;

export type GitTreeEntry = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string;
};

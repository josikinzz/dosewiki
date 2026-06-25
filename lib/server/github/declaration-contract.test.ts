import { describe, expect, it } from "vitest";

import * as client from "./client.mjs";
import {
  DEFAULT_COMMIT_AUTHOR,
  REPO_NAME,
  REPO_OWNER,
  TARGET_BRANCH,
  USER_AGENT,
  buildCommitUrl,
  createBlob,
  createCommit,
  createTree,
  encodeRepositoryPath,
  getRepositoryState,
  githubRequest,
  loadFileFromRepo,
  updateReference,
  type CommitAuthor,
  type GitTreeEntry,
  type RepositoryState,
} from "./client.mjs";
import * as fileChange from "./fileChange.mjs";
import {
  DEFAULT_GITHUB_FILE_CHANGE_TARGET,
  GitHubFileChangeError,
  applyGitHubFileChangeSet,
  createDefaultGitHubRepositoryAdapter,
  validateGitHubFileChangeSet,
  type GitHubFileChangeResult,
  type GitHubFileChangeSet,
  type GitHubRepositoryAdapter,
  type NormalizedGitHubFileChangeSet,
} from "./fileChange.mjs";
import * as saveSubstanceIndex from "./saveSubstanceIndex.mjs";
import {
  RequestError as SaveSubstanceIndexRequestError,
  buildSubstanceIndexFileChangeSet,
  saveSubstanceIndexWithGitHub,
  type SaveSubstanceIndexResult,
  type SubstanceIndexFileChangeSetResult,
  type SubstanceIndexSaveBody,
} from "./saveSubstanceIndex.mjs";
import * as saveUserProfile from "./saveUserProfile.mjs";
import {
  MAX_PROFILE_PAYLOAD_BYTES,
  RequestError as SaveUserProfileRequestError,
  buildUserProfileFileChangeSet,
  getProfilePayloadByteLength,
  saveUserProfileWithGitHub,
  type SaveUserProfileBody,
  type SaveUserProfileResult,
  type UserProfile,
} from "./saveUserProfile.mjs";
import * as validation from "./validation.mjs";
import {
  getPayloadByteLength,
  validateArticlesPayload,
  type ArticleValidationResult,
} from "./validation.mjs";

type IsNever<T> = [T] extends [never] ? true : false;

const assertType = <T>(_value: T) => {};

const expectedClientExports = [
  "DEFAULT_COMMIT_AUTHOR",
  "REPO_NAME",
  "REPO_OWNER",
  "TARGET_BRANCH",
  "USER_AGENT",
  "buildCommitUrl",
  "createBlob",
  "createCommit",
  "createTree",
  "encodeRepositoryPath",
  "getRepositoryState",
  "githubRequest",
  "loadFileFromRepo",
  "updateReference",
] as const satisfies readonly (keyof typeof client)[];

const expectedFileChangeExports = [
  "DEFAULT_GITHUB_FILE_CHANGE_TARGET",
  "GitHubFileChangeError",
  "applyGitHubFileChangeSet",
  "createDefaultGitHubRepositoryAdapter",
  "validateGitHubFileChangeSet",
] as const satisfies readonly (keyof typeof fileChange)[];

const expectedSaveSubstanceIndexExports = [
  "RequestError",
  "buildSubstanceIndexFileChangeSet",
  "saveSubstanceIndexWithGitHub",
] as const satisfies readonly (keyof typeof saveSubstanceIndex)[];

const expectedSaveUserProfileExports = [
  "MAX_PROFILE_PAYLOAD_BYTES",
  "RequestError",
  "buildUserProfileFileChangeSet",
  "getProfilePayloadByteLength",
  "saveUserProfileWithGitHub",
] as const satisfies readonly (keyof typeof saveUserProfile)[];

const expectedValidationExports = [
  "getPayloadByteLength",
  "validateArticlesPayload",
] as const satisfies readonly (keyof typeof validation)[];

assertType<IsNever<Exclude<keyof typeof client, (typeof expectedClientExports)[number]>>>(
  true,
);
assertType<
  IsNever<Exclude<keyof typeof fileChange, (typeof expectedFileChangeExports)[number]>>
>(true);
assertType<
  IsNever<
    Exclude<
      keyof typeof saveSubstanceIndex,
      (typeof expectedSaveSubstanceIndexExports)[number]
    >
  >
>(true);
assertType<
  IsNever<
    Exclude<keyof typeof saveUserProfile, (typeof expectedSaveUserProfileExports)[number]>
  >
>(true);
assertType<
  IsNever<Exclude<keyof typeof validation, (typeof expectedValidationExports)[number]>>
>(true);

const commitAuthorContract: CommitAuthor = DEFAULT_COMMIT_AUTHOR;
const getRepositoryStateContract: (
  token: string,
  branch?: string,
) => Promise<RepositoryState> = getRepositoryState;
const treeEntryContract: GitTreeEntry = {
  path: "src/data/example.json",
  mode: "100644",
  type: "blob",
  sha: "blob-sha",
};
void commitAuthorContract;
void treeEntryContract;
const githubRequestContract: (
  token: string,
  path: string,
) => Promise<{ response: Response; payload: unknown }> = githubRequest;
const loadFileContract: (
  token: string,
  path: string,
  branch?: string,
) => Promise<{ content: string | null; sha: string | null }> = loadFileFromRepo;
const createBlobContract: (
  token: string,
  content: string,
  encoding?: "utf-8" | "base64",
) => Promise<string> = createBlob;
const createTreeContract: (
  token: string,
  baseTreeSha: string,
  entries: GitTreeEntry[],
) => Promise<string> = createTree;
const createCommitContract: (
  token: string,
  message: string,
  treeSha: string,
  parentSha: string,
  isoTimestamp: string,
  author?: CommitAuthor,
) => Promise<string> = createCommit;
const updateReferenceContract: (
  token: string,
  commitSha: string,
  branch?: string,
) => Promise<void> = updateReference;

assertType<string>(REPO_OWNER);
assertType<string>(REPO_NAME);
assertType<string>(TARGET_BRANCH);
assertType<string>(USER_AGENT);
assertType<string>(encodeRepositoryPath("src/data/example.json"));
assertType<string>(buildCommitUrl("commit-sha"));
assertType<(token: string, branch?: string) => Promise<RepositoryState>>(
  getRepositoryStateContract,
);
assertType<
  (token: string, path: string) => Promise<{ response: Response; payload: unknown }>
>(githubRequestContract);
assertType<
  (
    token: string,
    path: string,
    branch?: string,
  ) => Promise<{ content: string | null; sha: string | null }>
>(loadFileContract);
assertType<
  (
    token: string,
    content: string,
    encoding?: "utf-8" | "base64",
  ) => Promise<string>
>(createBlobContract);
assertType<
  (token: string, baseTreeSha: string, entries: GitTreeEntry[]) => Promise<string>
>(createTreeContract);
assertType<
  (
    token: string,
    message: string,
    treeSha: string,
    parentSha: string,
    isoTimestamp: string,
    author?: CommitAuthor,
  ) => Promise<string>
>(createCommitContract);
assertType<(token: string, commitSha: string, branch?: string) => Promise<void>>(
  updateReferenceContract,
);

const repositoryAdapterContract: GitHubRepositoryAdapter = {
  getState: async () => ({ parentSha: "parent-sha", baseTreeSha: "tree-sha" }),
  createBlob: async () => "blob-sha",
  createTree: async () => "tree-sha",
  createCommit: async () => "commit-sha",
  updateReference: async () => undefined,
  buildCommitUrl: (sha) => `https://example.test/${sha}`,
};
const fileChangeSetContract: GitHubFileChangeSet = {
  kind: "backup",
  actor: { key: "EDITOR" },
  message: "Update backup",
  files: [{ path: "src/data/example.json", content: "{}\n" }],
};
void repositoryAdapterContract;
void fileChangeSetContract;
const validateGitHubFileChangeSetContract: (
  changeSet: GitHubFileChangeSet,
) => NormalizedGitHubFileChangeSet = validateGitHubFileChangeSet;
const applyGitHubFileChangeSetContract: (
  changeSet: GitHubFileChangeSet,
  options?: { repository?: GitHubRepositoryAdapter },
) => Promise<GitHubFileChangeResult> = applyGitHubFileChangeSet;

assertType<Readonly<{ owner: string; repo: string; branch: string }>>(
  DEFAULT_GITHUB_FILE_CHANGE_TARGET,
);
assertType<GitHubFileChangeError>(
  new GitHubFileChangeError("message", { code: "TEST" }),
);
assertType<GitHubRepositoryAdapter>(createDefaultGitHubRepositoryAdapter("token"));
assertType<(changeSet: GitHubFileChangeSet) => NormalizedGitHubFileChangeSet>(
  validateGitHubFileChangeSetContract,
);
assertType<
  (
    changeSet: GitHubFileChangeSet,
    options?: { repository?: GitHubRepositoryAdapter },
  ) => Promise<GitHubFileChangeResult>
>(applyGitHubFileChangeSetContract);

const substanceBodyContract: SubstanceIndexSaveBody = {
  skipArticles: true,
  generatorPrompt: "Write carefully.",
};
void substanceBodyContract;
const buildSubstanceIndexFileChangeSetContract: (options?: {
  body?: SubstanceIndexSaveBody;
  submittedBy?: string;
}) => Promise<SubstanceIndexFileChangeSetResult> = buildSubstanceIndexFileChangeSet;
const saveSubstanceIndexWithGitHubContract: (options?: {
  body?: SubstanceIndexSaveBody;
  submittedBy?: string;
  githubToken?: string;
  repository?: GitHubRepositoryAdapter;
}) => Promise<SaveSubstanceIndexResult> = saveSubstanceIndexWithGitHub;

assertType<SaveSubstanceIndexRequestError>(
  new SaveSubstanceIndexRequestError(400, "Bad request"),
);
assertType<
  (options?: {
    body?: SubstanceIndexSaveBody;
    submittedBy?: string;
  }) => Promise<SubstanceIndexFileChangeSetResult>
>(buildSubstanceIndexFileChangeSetContract);
assertType<
  (options?: {
    body?: SubstanceIndexSaveBody;
    submittedBy?: string;
    githubToken?: string;
    repository?: GitHubRepositoryAdapter;
  }) => Promise<SaveSubstanceIndexResult>
>(saveSubstanceIndexWithGitHubContract);

const userProfileBodyContract: SaveUserProfileBody = {
  profile: {
    key: "EDITOR",
    displayName: "Editor",
    bio: "",
    links: [],
  },
};
const userProfileContract: UserProfile = {
  key: "EDITOR",
  displayName: "Editor",
  bio: "",
  links: [],
  avatarUrl: null,
  aliases: [],
  hasCustomBio: false,
};
void userProfileContract;
const buildUserProfileFileChangeSetContract: (options?: {
  body?: SaveUserProfileBody;
  submittedBy?: string;
  existingProfiles?: UserProfile[];
}) => Promise<unknown> = buildUserProfileFileChangeSet;
const saveUserProfileWithGitHubContract: (options?: {
  body?: SaveUserProfileBody;
  submittedBy?: string;
  githubToken?: string;
  repository?: GitHubRepositoryAdapter;
}) => Promise<SaveUserProfileResult> = saveUserProfileWithGitHub;

assertType<number>(MAX_PROFILE_PAYLOAD_BYTES);
assertType<number>(getProfilePayloadByteLength(userProfileBodyContract));
assertType<SaveUserProfileRequestError>(
  new SaveUserProfileRequestError(400, "Bad request"),
);
assertType<
  (options?: {
    body?: SaveUserProfileBody;
    submittedBy?: string;
    existingProfiles?: UserProfile[];
  }) => Promise<unknown>
>(buildUserProfileFileChangeSetContract);
assertType<
  (options?: {
    body?: SaveUserProfileBody;
    submittedBy?: string;
    githubToken?: string;
    repository?: GitHubRepositoryAdapter;
  }) => Promise<SaveUserProfileResult>
>(saveUserProfileWithGitHubContract);

const validationResultContract: ArticleValidationResult = validateArticlesPayload([]);

assertType<number>(getPayloadByteLength({ value: "hello" }));
assertType<ArticleValidationResult>(validationResultContract);

describe("GitHub helper declaration contract", () => {
  it.each([
    ["client", client, expectedClientExports],
    ["fileChange", fileChange, expectedFileChangeExports],
    ["saveSubstanceIndex", saveSubstanceIndex, expectedSaveSubstanceIndexExports],
    ["saveUserProfile", saveUserProfile, expectedSaveUserProfileExports],
    ["validation", validation, expectedValidationExports],
  ] as const)("keeps %s declared public exports aligned with runtime exports", (
    _name,
    moduleExports,
    expectedExports,
  ) => {
    expect(Object.keys(moduleExports).sort()).toEqual([...expectedExports].sort());
  });
});

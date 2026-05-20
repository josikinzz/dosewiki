import type {
  GitHubFileChangeSet,
  GitHubRepositoryAdapter,
} from "./fileChange.js";

export type RequestErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 500;

export class RequestError extends Error {
  status: RequestErrorStatus | number;
  constructor(status: RequestErrorStatus | number, message: string);
}

export type ChangedArticle = {
  id: number;
  title: string;
  slug: string;
};

export type ChangeLogEntry = {
  id: string;
  createdAt: string;
  commit: {
    sha: string;
    url: string;
    message: string;
  };
  markdown: string;
  articles: ChangedArticle[];
  submittedBy: string;
};

export type SubstanceIndexSaveBody = {
  articlesData?: unknown;
  skipArticles?: boolean;
  psychoactiveIndexManualData?: Record<string, unknown>;
  aboutMarkdown?: string;
  aboutSubtitleMarkdown?: string;
  aboutConfig?: Record<string, unknown>;
  generatorPrompt?: string;
  changedArticles?: unknown[];
  commitMessage?: string;
  changelogMarkdown?: string;
};

export type SubstanceIndexFileChangeSetResult = {
  changeSet: GitHubFileChangeSet & {
    kind: "backup";
    actor: { key: string };
    timestamp: string;
  };
  entry: ChangeLogEntry;
};

export type SaveSubstanceIndexResult = {
  success: true;
  commitSha: string;
  commitUrl: string;
  createdAt: string;
  submittedBy: string;
  entry: ChangeLogEntry;
};

export function buildSubstanceIndexFileChangeSet(options?: {
  body?: SubstanceIndexSaveBody;
  submittedBy?: string;
  existingChangeLogEntries?: ChangeLogEntry[];
  timestamp?: Date;
  entryId?: string;
}): Promise<SubstanceIndexFileChangeSetResult>;

export function saveSubstanceIndexWithGitHub(options?: {
  body?: SubstanceIndexSaveBody;
  submittedBy?: string;
  githubToken?: string;
  repository?: GitHubRepositoryAdapter;
}): Promise<SaveSubstanceIndexResult>;

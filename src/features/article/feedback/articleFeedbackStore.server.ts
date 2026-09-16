import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { makeFunctionReference } from "@server/postgres/runtime/api";

import {
  getPublicIntakeWriteCapability,
  getServerDataWriteCapability,
} from "@server/data/serverWriteCapability";
import {
  createArticleFeedbackRow,
  validateArticleFeedback,
  type ArticleFeedbackInput,
  type ArticleFeedbackRow,
  type ArticleFeedbackStatus,
} from "./articleFeedback";

export type ArticleFeedbackQueueItem = Pick<
  ArticleFeedbackRow,
  | "id"
  | "status"
  | "substance_slug"
  | "substance_title"
  | "category"
  | "importance"
  | "details"
  | "source_url"
  | "contact_email"
  | "honeypot_triggered"
  | "review_notes"
  | "reviewed_by"
  | "reviewed_at"
  | "created_at"
>;

export class ArticleFeedbackStorageConfigurationError extends Error {
  constructor(message = "Article feedback storage is not configured.") {
    super(message);
    // Not a string literal: the guardrails lint rule flags 40-char literals as AWS-key-like.
    this.name = ArticleFeedbackStorageConfigurationError.name;
  }
}

export class ArticleFeedbackValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
    this.name = "ArticleFeedbackValidationError";
  }
}

export class ArticleFeedbackNotFoundError extends Error {
  constructor(id: string) {
    super(`Article feedback not found: ${id}`);
    this.name = "ArticleFeedbackNotFoundError";
  }
}

type DataCallableClient = {
  mutation(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
  mutationAsService(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
  query(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
};

export type ArticleFeedbackCreateContext = {
  ip?: string;
  ip_hash_secret?: string;
};

export type ArticleFeedbackListFilters = {
  status?: ArticleFeedbackStatus;
  limit?: number;
};

export type ArticleFeedbackCountFilters = {
  statuses: readonly ArticleFeedbackStatus[];
};

const createFeedbackRef = makeFunctionReference<
  "mutation",
  { apiKey: string; feedback: ArticleFeedbackRow },
  ArticleFeedbackRow
>("articleFeedback:create");

const listFeedbackRef = makeFunctionReference<
  "query",
  { apiKey: string; status?: ArticleFeedbackStatus; limit?: number },
  ArticleFeedbackQueueItem[]
>("articleFeedback:list");

const countFeedbackRef = makeFunctionReference<
  "query",
  { apiKey: string; statuses: ArticleFeedbackStatus[] },
  number
>("articleFeedback:countByStatus");

const transitionFeedbackRef = makeFunctionReference<
  "mutation",
  {
    apiKey: string;
    actorEmail: string;
    id: string;
    status: ArticleFeedbackStatus;
    reviewer: string;
    note?: string;
  },
  ArticleFeedbackQueueItem
>("articleFeedback:transition");

type FeedbackCreateOptions = {
  client: Pick<DataCallableClient, "mutationAsService">;
  apiKey: string;
  idFactory?: () => string;
  now?: () => Date;
};

async function createFeedback(
  options: FeedbackCreateOptions,
  input: ArticleFeedbackInput,
  context: ArticleFeedbackCreateContext = {},
): Promise<ArticleFeedbackRow> {
  const validation = validateArticleFeedback(input);
  if (validation.ok === false) throw new ArticleFeedbackValidationError(validation.errors);
  const row = createArticleFeedbackRow(validation.normalized, {
    id: options.idFactory?.() ?? randomUUID(),
    now: options.now?.() ?? new Date(),
    ip_hash: hashIpAddress(context.ip, context.ip_hash_secret),
  });
  return await options.client.mutationAsService(createFeedbackRef, {
    apiKey: options.apiKey,
    feedback: row,
  }) as ArticleFeedbackRow;
}

export class DataArticleFeedbackStore {
  constructor(
    private readonly options: {
      client: DataCallableClient;
      apiKey: string;
      idFactory?: () => string;
      now?: () => Date;
    },
  ) {}

  async create(
    input: ArticleFeedbackInput,
    context: ArticleFeedbackCreateContext = {},
  ): Promise<ArticleFeedbackRow> {
    return createFeedback(this.options, input, context);
  }

  async list(filters: ArticleFeedbackListFilters = {}): Promise<ArticleFeedbackQueueItem[]> {
    return await this.options.client.query(listFeedbackRef, {
      apiKey: this.options.apiKey,
      ...(filters.status ? { status: filters.status } : {}),
      limit: clampLimit(filters.limit),
    }) as ArticleFeedbackQueueItem[];
  }

  /** Total rows in the given statuses, computed on the server: no list travels. */
  async count(filters: ArticleFeedbackCountFilters): Promise<number> {
    return await this.options.client.query(countFeedbackRef, {
      apiKey: this.options.apiKey,
      statuses: [...filters.statuses],
    }) as number;
  }

  async transition(
    id: string,
    options: { status: ArticleFeedbackStatus; reviewer: string; actorEmail: string; note?: string },
  ): Promise<ArticleFeedbackQueueItem> {
    try {
      return await this.options.client.mutation(transitionFeedbackRef, {
        apiKey: this.options.apiKey,
        actorEmail: options.actorEmail,
        id,
        status: options.status,
        reviewer: options.reviewer,
        ...(options.note !== undefined ? { note: options.note } : {}),
      }) as ArticleFeedbackQueueItem;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Article feedback not found")) {
        throw new ArticleFeedbackNotFoundError(id);
      }
      throw error;
    }
  }
}

let store: DataArticleFeedbackStore | null = null;
let storeCacheKey: string | null = null;

export async function getPublicArticleFeedbackStore(): Promise<
  Pick<DataArticleFeedbackStore, "create">
> {
  const capability = getPublicIntakeWriteCapability();
  if (!capability) {
    throw new ArticleFeedbackStorageConfigurationError(
      "Configure the Postgres target and the public-intake create credential to enable public article feedback.",
    );
  }

  return { create: (input, context) => createFeedback(capability, input, context) };
}

export async function getArticleFeedbackStore(): Promise<DataArticleFeedbackStore> {
  const writeCapability = getServerDataWriteCapability();
  if (writeCapability.ok === false) {
    throw new ArticleFeedbackStorageConfigurationError(
      "Configure the Postgres target and an editorial write credential to enable private article feedback.",
    );
  }

  const { capability } = writeCapability;
  const apiKey =
    capability.getAdminIntentToken("editorArticleWrite") || capability.adminKey;
  const cacheKey = `${capability.deployment.writeUrl}:${apiKey}`;

  if (store && storeCacheKey === cacheKey) {
    return store;
  }

  store = new DataArticleFeedbackStore({
    client: capability.client,
    apiKey,
  });
  storeCacheKey = cacheKey;
  return store;
}


export function getArticleFeedbackIpHashSecret(): string | undefined {
  return (
    process.env.ARTICLE_FEEDBACK_IP_HASH_SECRET ||
    process.env.TRIP_REPORT_SUBMISSIONS_IP_HASH_SECRET ||
    undefined
  );
}

function hashIpAddress(ip: string | undefined, secret: string | undefined): string | undefined {
  if (!ip || !secret) {
    return undefined;
  }

  const digest = createHmac("sha256", secret).update(ip).digest("hex");
  return `sha256:${digest}`;
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 250));
}

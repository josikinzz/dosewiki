import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { makeFunctionReference } from "convex/server";

import {
  getPublicIntakeWriteCapability,
  getServerConvexWriteCapability,
} from "@server/convex/serverWriteCapability";
import {
  createArticleFeedbackRow,
  validateArticleFeedback,
  type ArticleFeedbackInput,
  type ArticleFeedbackRow,
  type ArticleFeedbackStatus,
} from "./articleFeedback";

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

type ConvexCallableClient = {
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
  ArticleFeedbackRow[]
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
  ArticleFeedbackRow
>("articleFeedback:transition");

export class ConvexArticleFeedbackStore {
  constructor(
    private readonly options: {
      client: ConvexCallableClient;
      apiKey: string;
      idFactory?: () => string;
      now?: () => Date;
    },
  ) {}

  async create(
    input: ArticleFeedbackInput,
    context: ArticleFeedbackCreateContext = {},
  ): Promise<ArticleFeedbackRow> {
    const validation = validateArticleFeedback(input);
    if (validation.ok === false) {
      throw new ArticleFeedbackValidationError(validation.errors);
    }

    const row = createArticleFeedbackRow(validation.normalized, {
      id: this.options.idFactory?.() ?? randomUUID(),
      now: this.options.now?.() ?? new Date(),
      ip_hash: hashIpAddress(context.ip, context.ip_hash_secret),
    });

    return await this.options.client.mutationAsService(createFeedbackRef, {
      apiKey: this.options.apiKey,
      feedback: row,
    }) as ArticleFeedbackRow;
  }

  async list(filters: ArticleFeedbackListFilters = {}): Promise<ArticleFeedbackRow[]> {
    return await this.options.client.query(listFeedbackRef, {
      apiKey: this.options.apiKey,
      ...(filters.status ? { status: filters.status } : {}),
      limit: clampLimit(filters.limit),
    }) as ArticleFeedbackRow[];
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
  ): Promise<ArticleFeedbackRow> {
    try {
      return await this.options.client.mutation(transitionFeedbackRef, {
        apiKey: this.options.apiKey,
        actorEmail: options.actorEmail,
        id,
        status: options.status,
        reviewer: options.reviewer,
        ...(options.note !== undefined ? { note: options.note } : {}),
      }) as ArticleFeedbackRow;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Article feedback not found")) {
        throw new ArticleFeedbackNotFoundError(id);
      }
      throw error;
    }
  }
}

let store: ConvexArticleFeedbackStore | null = null;
let storeCacheKey: string | null = null;

export async function getPublicArticleFeedbackStore(): Promise<
  Pick<ConvexArticleFeedbackStore, "create">
> {
  const capability = getPublicIntakeWriteCapability();
  if (!capability) {
    throw new ArticleFeedbackStorageConfigurationError(
      "Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL plus CONVEX_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE to enable public article feedback.",
    );
  }

  return new ConvexArticleFeedbackStore({
    client: capability.client,
    apiKey: capability.apiKey,
  });
}

export async function getArticleFeedbackStore(): Promise<ConvexArticleFeedbackStore> {
  const writeCapability = getServerConvexWriteCapability();
  if (writeCapability.ok === false) {
    throw new ArticleFeedbackStorageConfigurationError(
      "Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL plus CONVEX_ADMIN_KEY to enable private article feedback.",
    );
  }

  const { capability } = writeCapability;
  const apiKey =
    capability.getAdminIntentToken("editorArticleWrite") || capability.adminKey;
  const cacheKey = `${capability.deployment.writeUrl}:${apiKey}`;

  if (store && storeCacheKey === cacheKey) {
    return store;
  }

  store = new ConvexArticleFeedbackStore({
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

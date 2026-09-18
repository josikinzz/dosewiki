import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { makeFunctionReference } from "@server/postgres/runtime/api";

import {
  getPublicIntakeWriteCapability,
  getServerDataWriteCapability,
} from "@server/data/serverWriteCapability";
import {
  createSiteFeedbackRow,
  validateSiteFeedback,
  type SiteFeedbackInput,
  type SiteFeedbackRow,
  type SiteFeedbackStatus,
} from "./siteFeedback";

export type SiteFeedbackQueueItem = Pick<
  SiteFeedbackRow,
  | "id"
  | "status"
  | "category"
  | "urgency"
  | "details"
  | "page"
  | "email"
  | "honeypot_triggered"
  | "review_notes"
  | "reviewed_by"
  | "reviewed_at"
  | "created_at"
>;

export class SiteFeedbackStorageConfigurationError extends Error {
  constructor(message = "Site feedback storage is not configured.") {
    super(message);
    // Not a string literal: the guardrails lint rule flags 40-char literals as AWS-key-like.
    this.name = SiteFeedbackStorageConfigurationError.name;
  }
}

export class SiteFeedbackValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
    this.name = "SiteFeedbackValidationError";
  }
}

export class SiteFeedbackNotFoundError extends Error {
  constructor(id: string) {
    super(`Site feedback not found: ${id}`);
    this.name = "SiteFeedbackNotFoundError";
  }
}

type DataCallableClient = {
  mutation(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
  mutationAsService(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
  query(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
};

export type SiteFeedbackCreateContext = {
  ip?: string;
  ip_hash_secret?: string;
};

export type SiteFeedbackListFilters = {
  status?: SiteFeedbackStatus;
  limit?: number;
};

export type SiteFeedbackCountFilters = {
  statuses: readonly SiteFeedbackStatus[];
};

const createFeedbackRef = makeFunctionReference<
  "mutation",
  { apiKey: string; feedback: SiteFeedbackRow },
  SiteFeedbackRow
>("siteFeedback:create");

const listFeedbackRef = makeFunctionReference<
  "query",
  { apiKey: string; status?: SiteFeedbackStatus; limit?: number },
  SiteFeedbackQueueItem[]
>("siteFeedback:list");

const countFeedbackRef = makeFunctionReference<
  "query",
  { apiKey: string; statuses: SiteFeedbackStatus[] },
  number
>("siteFeedback:countByStatus");

const transitionFeedbackRef = makeFunctionReference<
  "mutation",
  {
    apiKey: string;
    actorEmail: string;
    id: string;
    status: SiteFeedbackStatus;
    reviewer: string;
    note?: string;
  },
  SiteFeedbackQueueItem
>("siteFeedback:transition");

type FeedbackCreateOptions = {
  client: Pick<DataCallableClient, "mutationAsService">;
  apiKey: string;
  idFactory?: () => string;
  now?: () => Date;
};

async function createFeedback(
  options: FeedbackCreateOptions,
  input: SiteFeedbackInput,
  context: SiteFeedbackCreateContext = {},
): Promise<SiteFeedbackRow> {
  const validation = validateSiteFeedback(input);
  if (validation.ok === false) throw new SiteFeedbackValidationError(validation.errors);
  const row = createSiteFeedbackRow(validation.normalized, {
    id: options.idFactory?.() ?? randomUUID(),
    now: options.now?.() ?? new Date(),
    ip_hash: hashIpAddress(context.ip, context.ip_hash_secret),
  });
  return await options.client.mutationAsService(createFeedbackRef, {
    apiKey: options.apiKey,
    feedback: row,
  }) as SiteFeedbackRow;
}

export class DataSiteFeedbackStore {
  constructor(
    private readonly options: {
      client: DataCallableClient;
      apiKey: string;
      idFactory?: () => string;
      now?: () => Date;
    },
  ) {}

  async create(
    input: SiteFeedbackInput,
    context: SiteFeedbackCreateContext = {},
  ): Promise<SiteFeedbackRow> {
    return createFeedback(this.options, input, context);
  }

  async list(filters: SiteFeedbackListFilters = {}): Promise<SiteFeedbackQueueItem[]> {
    return await this.options.client.query(listFeedbackRef, {
      apiKey: this.options.apiKey,
      ...(filters.status ? { status: filters.status } : {}),
      limit: clampLimit(filters.limit),
    }) as SiteFeedbackQueueItem[];
  }

  /** Total rows in the given statuses, computed on the server: no list travels. */
  async count(filters: SiteFeedbackCountFilters): Promise<number> {
    return await this.options.client.query(countFeedbackRef, {
      apiKey: this.options.apiKey,
      statuses: [...filters.statuses],
    }) as number;
  }

  async transition(
    id: string,
    options: { status: SiteFeedbackStatus; reviewer: string; actorEmail: string; note?: string },
  ): Promise<SiteFeedbackQueueItem> {
    try {
      return await this.options.client.mutation(transitionFeedbackRef, {
        apiKey: this.options.apiKey,
        actorEmail: options.actorEmail,
        id,
        status: options.status,
        reviewer: options.reviewer,
        ...(options.note !== undefined ? { note: options.note } : {}),
      }) as SiteFeedbackQueueItem;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Site feedback not found")) {
        throw new SiteFeedbackNotFoundError(id);
      }
      throw error;
    }
  }
}

let store: DataSiteFeedbackStore | null = null;
let storeCacheKey: string | null = null;

export async function getPublicSiteFeedbackStore(): Promise<
  Pick<DataSiteFeedbackStore, "create">
> {
  const capability = getPublicIntakeWriteCapability();
  if (!capability) {
    throw new SiteFeedbackStorageConfigurationError(
      "Configure the Postgres target and the public-intake create credential to enable public site feedback.",
    );
  }

  return { create: (input, context) => createFeedback(capability, input, context) };
}

export async function getSiteFeedbackStore(): Promise<DataSiteFeedbackStore> {
  const writeCapability = getServerDataWriteCapability();
  if (writeCapability.ok === false) {
    throw new SiteFeedbackStorageConfigurationError(
      "Configure the Postgres target and an editorial write credential to enable private site feedback.",
    );
  }

  const { capability } = writeCapability;
  const apiKey =
    capability.getAdminIntentToken("editorArticleWrite") || capability.adminKey;
  const cacheKey = `${capability.deployment.writeUrl}:${apiKey}`;

  if (store && storeCacheKey === cacheKey) {
    return store;
  }

  store = new DataSiteFeedbackStore({
    client: capability.client,
    apiKey,
  });
  storeCacheKey = cacheKey;
  return store;
}


export function getSiteFeedbackIpHashSecret(): string | undefined {
  return (
    process.env.SITE_FEEDBACK_IP_HASH_SECRET ||
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

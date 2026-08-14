import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { makeFunctionReference } from "convex/server";

import { getServerConvexWriteCapability } from "@server/convex/serverWriteCapability";
import {
  createSiteFeedbackRow,
  validateSiteFeedback,
  type SiteFeedbackInput,
  type SiteFeedbackRow,
  type SiteFeedbackStatus,
} from "./siteFeedback";

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

type ConvexCallableClient = {
  mutation(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
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

const createFeedbackRef = makeFunctionReference<
  "mutation",
  { apiKey: string; feedback: SiteFeedbackRow },
  SiteFeedbackRow
>("siteFeedback:create");

const listFeedbackRef = makeFunctionReference<
  "query",
  { apiKey: string; status?: SiteFeedbackStatus; limit?: number },
  SiteFeedbackRow[]
>("siteFeedback:list");

const transitionFeedbackRef = makeFunctionReference<
  "mutation",
  {
    apiKey: string;
    id: string;
    status: SiteFeedbackStatus;
    reviewer: string;
    notes?: string;
  },
  SiteFeedbackRow
>("siteFeedback:transition");

export class ConvexSiteFeedbackStore {
  constructor(
    private readonly options: {
      client: ConvexCallableClient;
      apiKey: string;
      idFactory?: () => string;
      now?: () => Date;
    },
  ) {}

  async create(
    input: SiteFeedbackInput,
    context: SiteFeedbackCreateContext = {},
  ): Promise<SiteFeedbackRow> {
    const validation = validateSiteFeedback(input);
    if (validation.ok === false) {
      throw new SiteFeedbackValidationError(validation.errors);
    }

    const row = createSiteFeedbackRow(validation.normalized, {
      id: this.options.idFactory?.() ?? randomUUID(),
      now: this.options.now?.() ?? new Date(),
      ip_hash: hashIpAddress(context.ip, context.ip_hash_secret),
    });

    return await this.options.client.mutation(createFeedbackRef, {
      apiKey: this.options.apiKey,
      feedback: row,
    }) as SiteFeedbackRow;
  }

  async list(filters: SiteFeedbackListFilters = {}): Promise<SiteFeedbackRow[]> {
    return await this.options.client.query(listFeedbackRef, {
      apiKey: this.options.apiKey,
      ...(filters.status ? { status: filters.status } : {}),
      limit: clampLimit(filters.limit),
    }) as SiteFeedbackRow[];
  }

  async transition(
    id: string,
    options: { status: SiteFeedbackStatus; reviewer: string; notes?: string },
  ): Promise<SiteFeedbackRow> {
    try {
      return await this.options.client.mutation(transitionFeedbackRef, {
        apiKey: this.options.apiKey,
        id,
        status: options.status,
        reviewer: options.reviewer,
        ...(options.notes !== undefined ? { notes: options.notes } : {}),
      }) as SiteFeedbackRow;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Site feedback not found")) {
        throw new SiteFeedbackNotFoundError(id);
      }
      throw error;
    }
  }
}

let store: ConvexSiteFeedbackStore | null = null;
let storeCacheKey: string | null = null;

export async function getSiteFeedbackStore(): Promise<ConvexSiteFeedbackStore> {
  const writeCapability = getServerConvexWriteCapability();
  if (writeCapability.ok === false) {
    throw new SiteFeedbackStorageConfigurationError(
      "Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL plus CONVEX_ADMIN_KEY to enable private site feedback.",
    );
  }

  const { capability } = writeCapability;
  const apiKey =
    capability.getAdminIntentToken("editorArticleWrite") || capability.adminKey;
  const cacheKey = `${capability.deployment.writeUrl}:${apiKey}`;

  if (store && storeCacheKey === cacheKey) {
    return store;
  }

  store = new ConvexSiteFeedbackStore({
    client: capability.client,
    apiKey,
  });
  storeCacheKey = cacheKey;
  return store;
}

export function resetSiteFeedbackStoreForTests() {
  store = null;
  storeCacheKey = null;
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

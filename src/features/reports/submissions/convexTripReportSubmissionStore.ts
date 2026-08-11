import { randomUUID } from "node:crypto";

import { makeFunctionReference } from "convex/server";

import {
  buildConvexTripReportImportPayload,
  createTripReportSubmission,
  validateTripReportSubmission,
  type ConvexTripReportImportPayload,
  type TransitionTripReportSubmissionOptions,
  type TripReportSubmissionInput,
  type TripReportSubmissionRow,
  type TripReportSubmissionStatus,
} from "./tripReportSubmissions";

type ConvexCallableClient = {
  mutation(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
  query(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
};

export type TripReportSubmissionListFilters = {
  status?: TripReportSubmissionStatus;
  limit?: number;
};

export type TripReportSubmissionCreateResult = {
  row: TripReportSubmissionRow;
  warnings: string[];
};

export type TripReportSubmissionPromotionPreviewResult = {
  row: TripReportSubmissionRow;
  payload: ConvexTripReportImportPayload;
};

export type TripReportSubmissionPromotionResult = {
  submission: TripReportSubmissionRow;
  reportId: string;
  payload: ConvexTripReportImportPayload;
};

// Contributor attribution for a published report is chosen by the promoting
// editor, so it travels with the promotion call rather than the submission.
export type TripReportSubmissionPromotionOptions = {
  profileKey?: string;
  // Acknowledges a byline that matches an existing contributor. Convex refuses
  // the promotion without either this or a matching profile key.
  confirmAuthorNameClaim?: boolean;
};

export interface TripReportSubmissionStore {
  create(input: TripReportSubmissionInput): Promise<TripReportSubmissionCreateResult>;
  list(filters?: TripReportSubmissionListFilters): Promise<TripReportSubmissionRow[]>;
  get(id: string): Promise<TripReportSubmissionRow | null>;
  transition(id: string, options: TransitionTripReportSubmissionOptions): Promise<TripReportSubmissionRow>;
  previewPromotion(
    id: string,
    options?: TripReportSubmissionPromotionOptions & { reviewer?: string },
  ): Promise<TripReportSubmissionPromotionPreviewResult>;
  promote(
    id: string,
    options: { reviewer: string; notes?: string } & TripReportSubmissionPromotionOptions,
  ): Promise<TripReportSubmissionPromotionResult>;
}

export class TripReportSubmissionValidationError extends Error {
  constructor(readonly errors: string[], readonly warnings: string[]) {
    super(errors.join(" "));
    this.name = "TripReportSubmissionValidationError";
  }
}

export class TripReportSubmissionNotFoundError extends Error {
  constructor(id: string) {
    super(`Trip report submission not found: ${id}`);
    this.name = "TripReportSubmissionNotFoundError";
  }
}

const createSubmissionRef = makeFunctionReference<
  "mutation",
  { apiKey: string; submission: TripReportSubmissionRow },
  TripReportSubmissionRow
>("tripReportSubmissions:create");

const listSubmissionsRef = makeFunctionReference<
  "query",
  { apiKey: string; status?: TripReportSubmissionStatus; limit?: number },
  TripReportSubmissionRow[]
>("tripReportSubmissions:list");

const getSubmissionRef = makeFunctionReference<
  "query",
  { apiKey: string; id: string },
  TripReportSubmissionRow | null
>("tripReportSubmissions:get");

const transitionSubmissionRef = makeFunctionReference<
  "mutation",
  {
    apiKey: string;
    id: string;
    status: TripReportSubmissionStatus;
    reviewer: string;
    notes?: string;
  },
  TripReportSubmissionRow
>("tripReportSubmissions:transition");

const previewPromotionRef = makeFunctionReference<
  "query",
  {
    apiKey: string;
    id: string;
    profileKey?: string;
    reviewer?: string;
    confirmAuthorNameClaim?: boolean;
  },
  TripReportSubmissionPromotionPreviewResult
>("tripReportSubmissions:previewPromotion");

const promoteSubmissionRef = makeFunctionReference<
  "mutation",
  {
    apiKey: string;
    id: string;
    reviewer: string;
    notes?: string;
    profileKey?: string;
    confirmAuthorNameClaim?: boolean;
  },
  TripReportSubmissionPromotionResult
>("tripReportSubmissions:promote");

export class ConvexTripReportSubmissionStore implements TripReportSubmissionStore {
  constructor(
    private readonly options: {
      client: ConvexCallableClient;
      apiKey: string;
      idFactory?: () => string;
      now?: () => Date;
    },
  ) {}

  async create(input: TripReportSubmissionInput): Promise<TripReportSubmissionCreateResult> {
    const validation = validateTripReportSubmission(input);
    if (validation.ok === false) {
      throw new TripReportSubmissionValidationError(validation.errors, validation.warnings);
    }

    const row = createTripReportSubmission(input, {
      id: this.options.idFactory?.() ?? randomUUID(),
      now: this.options.now?.() ?? new Date(),
    });

    const stored = await this.options.client.mutation(createSubmissionRef, {
      apiKey: this.options.apiKey,
      submission: row,
    }) as TripReportSubmissionRow;

    return {
      row: stored,
      warnings: validation.warnings,
    };
  }

  async list(filters: TripReportSubmissionListFilters = {}): Promise<TripReportSubmissionRow[]> {
    return await this.options.client.query(listSubmissionsRef, {
      apiKey: this.options.apiKey,
      ...(filters.status ? { status: filters.status } : {}),
      limit: clampLimit(filters.limit),
    }) as TripReportSubmissionRow[];
  }

  async get(id: string): Promise<TripReportSubmissionRow | null> {
    return await this.options.client.query(getSubmissionRef, {
      apiKey: this.options.apiKey,
      id,
    }) as TripReportSubmissionRow | null;
  }

  async transition(
    id: string,
    options: TransitionTripReportSubmissionOptions,
  ): Promise<TripReportSubmissionRow> {
    try {
      return await this.options.client.mutation(transitionSubmissionRef, {
        apiKey: this.options.apiKey,
        id,
        status: options.status,
        reviewer: options.reviewer,
        ...(options.notes !== undefined ? { notes: options.notes } : {}),
      }) as TripReportSubmissionRow;
    } catch (error) {
      throw mapKnownSubmissionError(error, id);
    }
  }

  async previewPromotion(
    id: string,
    options: TripReportSubmissionPromotionOptions & { reviewer?: string } = {},
  ): Promise<TripReportSubmissionPromotionPreviewResult> {
    try {
      return await this.options.client.query(previewPromotionRef, {
        apiKey: this.options.apiKey,
        id,
        ...(options.profileKey ? { profileKey: options.profileKey } : {}),
        ...(options.reviewer ? { reviewer: options.reviewer } : {}),
        ...(options.confirmAuthorNameClaim ? { confirmAuthorNameClaim: true } : {}),
      }) as TripReportSubmissionPromotionPreviewResult;
    } catch (error) {
      throw mapKnownSubmissionError(error, id);
    }
  }

  async promote(
    id: string,
    options: { reviewer: string; notes?: string } & TripReportSubmissionPromotionOptions,
  ): Promise<TripReportSubmissionPromotionResult> {
    try {
      return await this.options.client.mutation(promoteSubmissionRef, {
        apiKey: this.options.apiKey,
        id,
        reviewer: options.reviewer,
        ...(options.notes !== undefined ? { notes: options.notes } : {}),
        ...(options.profileKey ? { profileKey: options.profileKey } : {}),
        ...(options.confirmAuthorNameClaim ? { confirmAuthorNameClaim: true } : {}),
      }) as TripReportSubmissionPromotionResult;
    } catch (error) {
      throw mapKnownSubmissionError(error, id);
    }
  }
}

export function buildLocalTripReportPromotionPayload(
  row: TripReportSubmissionRow,
): ConvexTripReportImportPayload {
  return buildConvexTripReportImportPayload(row);
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 250));
}

function mapKnownSubmissionError(error: unknown, id: string): Error {
  if (error instanceof Error && error.message.includes("Trip report submission not found")) {
    return new TripReportSubmissionNotFoundError(id);
  }

  return error instanceof Error ? error : new Error(String(error));
}

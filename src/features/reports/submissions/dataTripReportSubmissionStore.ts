import { randomUUID } from "node:crypto";

import { makeFunctionReference } from "@server/postgres/runtime/api";

import {
  createTripReportSubmission,
  validateTripReportSubmission,
  type DataTripReportImportPayload,
  type TransitionTripReportSubmissionOptions,
  type TripReportSubmissionInput,
  type TripReportSubmissionRow,
  type TripReportSubmissionStatus,
} from "./tripReportSubmissions";

type DataCallableClient = {
  mutation(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
  mutationAsService(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
  query(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
};

export type TripReportSubmissionListFilters = {
  status?: TripReportSubmissionStatus;
  limit?: number;
};

export type TripReportSubmissionStatusFilters = {
  statuses: readonly TripReportSubmissionStatus[];
};

export type TripReportSubmissionPortalSummary = Pick<
  TripReportSubmissionRow,
  "id" | "status" | "title" | "author_name" | "created_at"
> & {
  report: Pick<TripReportSubmissionRow["report"], "subject" | "substances" | "tags">;
};

export type TripReportSubmissionPortalIndex = {
  needsReview: TripReportSubmissionPortalSummary[];
  history: TripReportSubmissionPortalSummary[];
};

export type TripReportSubmissionCreateResult = {
  row: TripReportSubmissionRow;
  warnings: string[];
};

export type TripReportSubmissionPromotionPreviewResult = {
  row: TripReportSubmissionRow;
  payload: DataTripReportImportPayload;
};

export type TripReportSubmissionPromotionResult = {
  submission: TripReportSubmissionRow;
  reportId: string;
  payload: DataTripReportImportPayload;
};

/** The signed-in member a route acts as; Postgres resolves their real role from it. */
export type TripReportSubmissionActor = {
  actorEmail: string;
};

// Contributor attribution for a published report is chosen by the promoting
// editor, so it travels with the promotion call rather than the submission.
export type TripReportSubmissionPromotionOptions = {
  profileKey?: string;
  // Acknowledges a byline that matches an existing contributor. Postgres refuses
  // the promotion without either this or a matching profile key.
  confirmAuthorNameClaim?: boolean;
};

export interface TripReportSubmissionStore {
  create(input: TripReportSubmissionInput): Promise<TripReportSubmissionCreateResult>;
  /** Newest rows first, capped at 250: the browse path. */
  list(filters?: TripReportSubmissionListFilters): Promise<TripReportSubmissionRow[]>;
  /** Every row in the given statuses, newest first, uncapped: what `count` counts. */
  listByStatuses(filters: TripReportSubmissionStatusFilters): Promise<TripReportSubmissionRow[]>;
  /** Compact, non-overlapping portal rows with uncapped needs review and the existing history window. */
  listPortalSummaries(): Promise<TripReportSubmissionPortalIndex>;
  /** Total rows in the given statuses, computed on the server: no list travels. */
  count(filters: TripReportSubmissionStatusFilters): Promise<number>;
  get(id: string): Promise<TripReportSubmissionRow | null>;
  transition(
    id: string,
    options: TransitionTripReportSubmissionOptions & TripReportSubmissionActor,
  ): Promise<TripReportSubmissionRow>;
  previewPromotion(
    id: string,
    options?: TripReportSubmissionPromotionOptions & { reviewer?: string; actorEmail?: string },
  ): Promise<TripReportSubmissionPromotionPreviewResult>;
  promote(
    id: string,
    options: { reviewer: string; notes?: string } & TripReportSubmissionPromotionOptions &
      TripReportSubmissionActor,
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

const listSubmissionsByStatusesRef = makeFunctionReference<
  "query",
  { apiKey: string; statuses: TripReportSubmissionStatus[] },
  TripReportSubmissionRow[]
>("tripReportSubmissions:listByStatuses");

const listPortalSummariesRef = makeFunctionReference<
  "query",
  { apiKey: string },
  TripReportSubmissionPortalIndex
>("tripReportSubmissions:listPortalSummaries");

const countSubmissionsRef = makeFunctionReference<
  "query",
  { apiKey: string; statuses: TripReportSubmissionStatus[] },
  number
>("tripReportSubmissions:countByStatus");

const getSubmissionRef = makeFunctionReference<
  "query",
  { apiKey: string; id: string },
  TripReportSubmissionRow | null
>("tripReportSubmissions:get");

const transitionSubmissionRef = makeFunctionReference<
  "mutation",
  {
    apiKey: string;
    actorEmail: string;
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
    actorEmail?: string;
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
    actorEmail: string;
    id: string;
    reviewer: string;
    notes?: string;
    profileKey?: string;
    confirmAuthorNameClaim?: boolean;
  },
  TripReportSubmissionPromotionResult
>("tripReportSubmissions:promote");

export async function createSubmissionForIntake(
  options: {
    client: Pick<DataCallableClient, "mutationAsService">;
    apiKey: string;
    idFactory?: () => string;
    now?: () => Date;
  },
  input: TripReportSubmissionInput,
): Promise<TripReportSubmissionCreateResult> {
  const validation = validateTripReportSubmission(input);
  if (validation.ok === false) {
    throw new TripReportSubmissionValidationError(validation.errors, validation.warnings);
  }
  const row = createTripReportSubmission(input, {
    id: options.idFactory?.() ?? randomUUID(),
    now: options.now?.() ?? new Date(),
  });
  const stored = await options.client.mutationAsService(createSubmissionRef, {
    apiKey: options.apiKey,
    submission: row,
  }) as TripReportSubmissionRow;
  return { row: stored, warnings: validation.warnings };
}

export class DataTripReportSubmissionStore implements TripReportSubmissionStore {
  constructor(
    private readonly options: {
      client: DataCallableClient;
      apiKey: string;
      idFactory?: () => string;
      now?: () => Date;
    },
  ) {}

  async create(input: TripReportSubmissionInput): Promise<TripReportSubmissionCreateResult> {
    return createSubmissionForIntake(this.options, input);
  }

  async list(filters: TripReportSubmissionListFilters = {}): Promise<TripReportSubmissionRow[]> {
    return await this.options.client.query(listSubmissionsRef, {
      apiKey: this.options.apiKey,
      ...(filters.status ? { status: filters.status } : {}),
      limit: clampLimit(filters.limit),
    }) as TripReportSubmissionRow[];
  }

  async listByStatuses(filters: TripReportSubmissionStatusFilters): Promise<TripReportSubmissionRow[]> {
    return await this.options.client.query(listSubmissionsByStatusesRef, {
      apiKey: this.options.apiKey,
      statuses: [...filters.statuses],
    }) as TripReportSubmissionRow[];
  }

  async listPortalSummaries(): Promise<TripReportSubmissionPortalIndex> {
    return await this.options.client.query(listPortalSummariesRef, {
      apiKey: this.options.apiKey,
    }) as TripReportSubmissionPortalIndex;
  }

  async count(filters: TripReportSubmissionStatusFilters): Promise<number> {
    return await this.options.client.query(countSubmissionsRef, {
      apiKey: this.options.apiKey,
      statuses: [...filters.statuses],
    }) as number;
  }

  async get(id: string): Promise<TripReportSubmissionRow | null> {
    return await this.options.client.query(getSubmissionRef, {
      apiKey: this.options.apiKey,
      id,
    }) as TripReportSubmissionRow | null;
  }

  async transition(
    id: string,
    options: TransitionTripReportSubmissionOptions & TripReportSubmissionActor,
  ): Promise<TripReportSubmissionRow> {
    try {
      return await this.options.client.mutation(transitionSubmissionRef, {
        apiKey: this.options.apiKey,
        actorEmail: options.actorEmail,
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
    options: TripReportSubmissionPromotionOptions & { reviewer?: string; actorEmail?: string } = {},
  ): Promise<TripReportSubmissionPromotionPreviewResult> {
    try {
      return await this.options.client.query(previewPromotionRef, {
        apiKey: this.options.apiKey,
        ...(options.actorEmail ? { actorEmail: options.actorEmail } : {}),
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
    options: { reviewer: string; notes?: string } & TripReportSubmissionPromotionOptions &
      TripReportSubmissionActor,
  ): Promise<TripReportSubmissionPromotionResult> {
    try {
      return await this.options.client.mutation(promoteSubmissionRef, {
        apiKey: this.options.apiKey,
        actorEmail: options.actorEmail,
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


function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 250));
}

function mapKnownSubmissionError(error: unknown, id: string): Error {
  if (error instanceof Error && error.message.includes("Trip report submission not found")) {
    return new TripReportSubmissionNotFoundError(id);
  }

  return error instanceof Error ? error : new Error(String(error));
}

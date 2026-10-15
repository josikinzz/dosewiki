import { PostgresError } from "@server/postgres/runtime/values";
import { NextResponse } from "next/server";

const POSTGRES_ERROR_MARKER = Symbol.for("dosewiki.PostgresError");

const MAX_REJECTION_MESSAGE_LENGTH = 500;

const DEFAULT_REJECTION_CODE = "DATA_REJECTED";

const DEFAULT_REJECTION_STATUS = 400;

const REJECTION_STATUS_BY_CODE: Record<string, number> = {
  FIELD_CONFLICT: 409,
  ARTICLE_CONFLICT: 409,
  EDIT_CONFLICT: 409,
  EDIT_OPERATION_REUSED: 409,
  PROFILE_CONFLICT: 409,
  PROFILE_OPERATION_REUSED: 409,
  REPORT_OPERATION_REUSED: 409,
  REPORT_CONFLICT: 409,
  CONFLICT: 409,
  REPLICATION_CHANGE_REUSED: 409,
  REPLICATION_NOT_FOUND: 404,
  COLLECTION_NOT_FOUND: 404,
  ARTICLE_CHANGE_REUSED: 409,
  ARTICLE_BATCH_REUSED: 409,
  ARTICLE_CREATE_EXISTS: 409,
  ARTICLE_REVISION_MISSING: 404,
  ARTICLE_NOT_FOUND: 404,
  FLAG_NOT_FOUND: 404,
  UNAUTHORIZED: 403,
  FORBIDDEN: 403,
  NOT_OWNER: 403,
  PROPOSAL_NOT_FOUND: 404,
  PROPOSAL_STATUS_INVALID: 409,
  PROPOSAL_BASELINE_STALE: 409,
  PROPOSAL_SELF_APPROVAL: 403,
  REVERT_CONFLICT: 409,
  REVIEW_REVISION_OUTDATED: 409,
  REVIEW_ALREADY_COMPLETED: 409,
  INBOX_CLAIM_HELD: 409,
};

export type DataRejection = {
  code: string;
  message: string;
  status: number;
};

function isPostgresError(error: unknown): boolean {
  if (error instanceof PostgresError) return true;

  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<PropertyKey, unknown>)[POSTGRES_ERROR_MARKER] === true
  );
}

function renderableMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_REJECTION_MESSAGE_LENGTH) return null;
  return trimmed;
}

function rejectionCode(value: unknown): string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value)
    ? value
    : DEFAULT_REJECTION_CODE;
}

export function classifyDataRejection(error: unknown): DataRejection | null {
  if (!isPostgresError(error)) return null;

  const data: unknown = (error as { data?: unknown }).data;

  if (typeof data === "string") {
    const message = renderableMessage(data);
    if (!message) return null;
    return { code: DEFAULT_REJECTION_CODE, message, status: DEFAULT_REJECTION_STATUS };
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;

  const payload = data as Record<string, unknown>;
  const message = renderableMessage(payload.message);
  if (!message) return null;

  const code = rejectionCode(payload.code);
  return {
    code,
    message,
    status: Object.prototype.hasOwnProperty.call(REJECTION_STATUS_BY_CODE, code) ? REJECTION_STATUS_BY_CODE[code] : DEFAULT_REJECTION_STATUS,
  };
}

export function dataRejectionResponse(error: unknown): NextResponse | null {
  const rejection = classifyDataRejection(error);
  if (!rejection) return null;

  return NextResponse.json(
    { error: rejection.message, code: rejection.code },
    { status: rejection.status },
  );
}

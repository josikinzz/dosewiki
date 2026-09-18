/**
 * Classifies a deliberate Postgres rejection so a protected route can tell the
 * caller *why* the write was refused.
 *
 * `PostgresError` signals a deliberate write refusal with reader-safe text.
 * Other failures, including auth errors, network faults and bugs, stay behind
 * the route's generic message so internal details cannot leak.
 * That split is the whole contract: the marker class is the permission to
 * speak, never the message string.
 *
 * A rejection surfaces as:
 *
 *   { error: "<human-readable reason>", code: "<STABLE_CODE>" }
 *
 * with the status from `REJECTION_STATUS_BY_CODE`. `code` is the part a client
 * may branch on; `error` is the part it may show. Callers should never parse
 * `error` — its wording is editorial copy and will change.
 */
import { PostgresError } from "@server/postgres/runtime/values";
import { NextResponse } from "next/server";

/** Shared across duplicate server bundles of the owned error class. */
const POSTGRES_ERROR_MARKER = Symbol.for("dosewiki.PostgresError");

/**
 * Longest rejection text forwarded to a caller.
 *
 * Deliberate refusals are one or two sentences. Anything longer is a sign the
 * payload picked up something that was never meant for a reader — a serialized
 * document, a stack — so it falls through to the generic path instead of being
 * truncated into half a sentence. The full error is still logged.
 */
const MAX_REJECTION_MESSAGE_LENGTH = 500;

/** Applied to any deliberate rejection that did not name a code of its own. */
const DEFAULT_REJECTION_CODE = "DATA_REJECTED";

const DEFAULT_REJECTION_STATUS = 400;

/**
 * Codes whose HTTP meaning is not "the request was bad".
 *
 * HTTP status is a route-layer concern, so the mapping lives here rather than
 * in the Postgres functions: mutations name a stable code, this table decides
 * what that means over the wire. An unrecognized code is a 400 — a deliberate
 * refusal the client should not simply retry.
 */
const REJECTION_STATUS_BY_CODE: Record<string, number> = {
  // Conflicts require reconciling the current record, not resending stale data.
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
};

export type DataRejection = {
  /** Stable, machine-readable reason. Safe to branch on. */
  code: string;
  /** Human-readable reason, safe to render to an editor verbatim. */
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

/** Accepts only text that is plausibly copy someone wrote for a reader. */
function renderableMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_REJECTION_MESSAGE_LENGTH) return null;
  return trimmed;
}

/**
 * Codes are SCREAMING_SNAKE_CASE by convention; anything else is treated as an
 * absent code rather than passed through, so a client's `code` comparison is
 * always against a value from a fixed vocabulary.
 */
function rejectionCode(value: unknown): string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value)
    ? value
    : DEFAULT_REJECTION_CODE;
}

/**
 * Returns the deliberate rejection payload, or `null` when no safely renderable
 * refusal is present. A malformed PostgresError is a thrower bug, not copy.
 */
export function classifyDataRejection(error: unknown): DataRejection | null {
  if (!isPostgresError(error)) return null;

  const data: unknown = (error as { data?: unknown }).data;

  // A bare string payload predates the structured form and carries no code.
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

/** The response for a deliberate rejection, or `null` to fall through. */
export function dataRejectionResponse(error: unknown): NextResponse | null {
  const rejection = classifyDataRejection(error);
  if (!rejection) return null;

  return NextResponse.json(
    { error: rejection.message, code: rejection.code },
    { status: rejection.status },
  );
}

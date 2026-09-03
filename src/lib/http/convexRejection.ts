/**
 * Classifies a deliberate Convex rejection so a protected route can tell the
 * caller *why* the write was refused.
 *
 * `ConvexError` is this repository's signal for "the write layer turned this
 * request down on purpose, and the text travelling with it was written for a
 * person to read". Everything else a mutation can throw — `AuthError`, a
 * function missing from the deployment, a network fault, a bug — is not that,
 * and must stay behind the route's generic message so nothing internal leaks.
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
import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";

/**
 * Convex tags its own error class with this symbol, which survives a
 * duplicated ESM/CJS copy of `convex/values` in a way `instanceof` does not.
 */
const CONVEX_ERROR_MARKER = Symbol.for("ConvexError");

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
const DEFAULT_REJECTION_CODE = "CONVEX_REJECTED";

const DEFAULT_REJECTION_STATUS = 400;

/**
 * Codes whose HTTP meaning is not "the request was bad".
 *
 * HTTP status is a route-layer concern, so the mapping lives here rather than
 * in the Convex functions: mutations name a stable code, this table decides
 * what that means over the wire. An unrecognized code is a 400 — a deliberate
 * refusal the client should not simply retry.
 */
const REJECTION_STATUS_BY_CODE = new Map<string, number>([
  // The stored value moved under the editor. Distinct from a bad request
  // because the fix is "reload and retry", not "send something else".
  ["FIELD_CONFLICT", 409],
  ["ARTICLE_NOT_FOUND", 404],
  ["FLAG_NOT_FOUND", 404],
  ["UNAUTHORIZED", 403],
  ["FORBIDDEN", 403],
  // The actor may write this kind of record but not this one: someone else's
  // playlist or trip report. Same HTTP meaning as FORBIDDEN, distinct code so
  // the client can say "not yours" rather than "not allowed".
  ["NOT_OWNER", 403],
  ["PROPOSAL_NOT_FOUND", 404],
  // The proposal is no longer in a state the action applies to (already
  // applied, rejected, or superseded), or production moved under it: the
  // queue is stale, reload it.
  ["PROPOSAL_STATUS_INVALID", 409],
  ["REVERT_CONFLICT", 409],
]);

export type ConvexRejection = {
  /** Stable, machine-readable reason. Safe to branch on. */
  code: string;
  /** Human-readable reason, safe to render to an editor verbatim. */
  message: string;
  status: number;
};

function isConvexError(error: unknown): boolean {
  if (error instanceof ConvexError) return true;

  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<PropertyKey, unknown>)[CONVEX_ERROR_MARKER] === true
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
 * Returns the rejection a Convex error is carrying, or `null` when the error is
 * not a deliberate refusal — including a `ConvexError` whose payload holds
 * nothing safely renderable, which is a bug in the thrower, not a message.
 */
export function classifyConvexRejection(error: unknown): ConvexRejection | null {
  if (!isConvexError(error)) return null;

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
    status: REJECTION_STATUS_BY_CODE.get(code) ?? DEFAULT_REJECTION_STATUS,
  };
}

/** The response for a deliberate rejection, or `null` to fall through. */
export function convexRejectionResponse(error: unknown): NextResponse | null {
  const rejection = classifyConvexRejection(error);
  if (!rejection) return null;

  return NextResponse.json(
    { error: rejection.message, code: rejection.code },
    { status: rejection.status },
  );
}

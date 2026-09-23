/**
 * One vocabulary for Postgres failures, shared by the runtime client (which
 * retries) and the server data client (which reports).
 *
 * - `transient`: the transaction rolled back and the same work can run again.
 *   Serialization failure 40001, deadlock 40P01, lock timeout 55P03, too many
 *   connections 53300, and a pool acquisition timeout.
 * - `frozen`: the write freeze refused the work. Either the process-level
 *   `DataWriteFrozenError`, or Postgres refusing a write inside the
 *   `BEGIN READ ONLY` transaction a frozen writer opens (25006). Never retried.
 * - `permanent`: everything else. Retrying cannot change the outcome.
 *
 * `isConnectionLoss` is a separate question: the socket or the session ended
 * under the statement. A read-only transaction can rerun on a fresh
 * connection; a write cannot, because its COMMIT may already have landed.
 *
 * `isReplayableOnFreshConnection` joins the two for work that is idempotent
 * by construction (upsert by `_id`, keyset SELECT, TRUNCATE): it can run
 * again on a new client after either a transient failure or a lost session.
 */

import { isDataWriteFrozenError } from "../runtime/dataWriteFreeze";

export type PostgresErrorClass = "transient" | "permanent" | "frozen";

const TRANSIENT_SQLSTATES: ReadonlySet<string> = new Set(["40001", "40P01", "55P03", "53300"]);
const READ_ONLY_SQL_TRANSACTION = "25006";

/** pg-pool's two acquisition timeouts: queued for a slot, and a new connection's handshake. */
const POOL_ACQUISITION_TIMEOUT_MESSAGES: ReadonlySet<string> = new Set([
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
]);

/** Server ended the session: admin shutdown, crash shutdown, cannot connect now, and class 08 connection exceptions. */
const CONNECTION_LOSS_SQLSTATES: ReadonlySet<string> = new Set(["57P01", "57P02", "57P03", "08000", "08003", "08006"]);
const CONNECTION_LOSS_SOCKET_CODES: ReadonlySet<string> = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED"]);
/**
 * pg's messages for a socket that closed under an active query, for reusing a
 * client after that, and for `query_timeout` firing on a socket that went
 * silent without closing.
 */
const CONNECTION_LOSS_MESSAGES: ReadonlySet<string> = new Set([
  "Connection terminated unexpectedly",
  "Query read timeout",
  "Connection terminated",
  "Client has encountered a connection error and is not queryable",
]);

function isConnectionLossOne(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && (CONNECTION_LOSS_SQLSTATES.has(code) || CONNECTION_LOSS_SOCKET_CODES.has(code))) return true;
  return error instanceof Error && CONNECTION_LOSS_MESSAGES.has(error.message);
}

export function isConnectionLoss(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let current = error; current && typeof current === "object" && !seen.has(current); current = (current as { cause?: unknown }).cause) {
    seen.add(current);
    if (isConnectionLossOne(current)) return true;
  }
  return false;
}

function classifyOne(error: unknown): PostgresErrorClass | null {
  if (isDataWriteFrozenError(error)) return "frozen";
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  if (code === READ_ONLY_SQL_TRANSACTION) return "frozen";
  if (typeof code === "string" && TRANSIENT_SQLSTATES.has(code)) return "transient";
  if (error instanceof Error && POOL_ACQUISITION_TIMEOUT_MESSAGES.has(error.message)) return "transient";
  return null;
}

export function classifyPostgresError(error: unknown): PostgresErrorClass {
  const seen = new Set<unknown>();
  for (let current = error; current && !seen.has(current); current = (current as { cause?: unknown }).cause) {
    seen.add(current);
    const found = classifyOne(current);
    if (found) return found;
    if (typeof current !== "object") break;
  }
  return "permanent";
}

/** Idempotent work only: a transient failure or a lost session, never a frozen refusal. */
export function isReplayableOnFreshConnection(error: unknown): boolean {
  const errorClass = classifyPostgresError(error);
  if (errorClass === "frozen") return false;
  return errorClass === "transient" || isConnectionLoss(error);
}

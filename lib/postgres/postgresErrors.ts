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

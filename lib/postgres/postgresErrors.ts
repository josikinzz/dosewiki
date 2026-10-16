import { isDataWriteFrozenError } from "../runtime/dataWriteFreeze";

export type PostgresErrorClass = "transient" | "permanent" | "frozen";

const TRANSIENT_SQLSTATES: ReadonlySet<string> = new Set(["40001", "40P01", "55P03", "53300"]);
const READ_ONLY_SQL_TRANSACTION = "25006";

const POOL_ACQUISITION_TIMEOUT_MESSAGES: ReadonlySet<string> = new Set([
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
]);

const CONNECTION_LOSS_SQLSTATES: ReadonlySet<string> = new Set(["57P01", "57P02", "57P03", "08000", "08003", "08006"]);
const CONNECTION_LOSS_SOCKET_CODES: ReadonlySet<string> = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED"]);
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

export function isReplayableOnFreshConnection(error: unknown): boolean {
  const errorClass = classifyPostgresError(error);
  if (errorClass === "frozen") return false;
  return errorClass === "transient" || isConnectionLoss(error);
}

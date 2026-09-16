/**
 * Process-level maintenance write freeze.
 *
 * `DATA_WRITES_FROZEN` makes every application and operator writer refuse
 * new work while reads keep serving. The guard is environment-based so it
 * remains enforceable before a database connection is available.
 *
 * Semantics:
 * - unset or empty: writes are allowed (a normal deployment says nothing).
 * - `0`, `false`, `off`, `no`: writes are allowed, spelled out on purpose so a
 *   runbook can set the variable everywhere and lift it by value.
 * - any other value, including an unrecognised one: every writer refuses. A
 *   typo freezes rather than silently reopening writes.
 *
 * Refusal is a `DataWriteFrozenError` carrying `code: "DATA_WRITES_FROZEN"`, so
 * the cutover runbook and `scripts/postgres/rehearse-release.ts` can assert the
 * refusal by code instead of by message text. Reads are never gated here.
 */

const DATA_WRITES_FROZEN_ENV_VAR = "DATA_WRITES_FROZEN"

/** Machine-readable refusal code; asserted by the release rehearsal and the runbook. */
export const DATA_WRITES_FROZEN_CODE = "DATA_WRITES_FROZEN";

const WRITES_ALLOWED_VALUES: Record<string, true> = {
  "": true,
  "0": true,
  false: true,
  off: true,
  no: true,
};

/** Any environment bag; `process.env` in this repo is a declared interface without an index signature. */
export type DataWriteFreezeEnv = { readonly [key: string]: string | undefined };

export function isDataWriteFreezeActive(env: DataWriteFreezeEnv = process.env): boolean {
  const raw = env[DATA_WRITES_FROZEN_ENV_VAR];
  if (typeof raw !== "string") return false;
  return WRITES_ALLOWED_VALUES[raw.trim().toLowerCase()] !== true;
}

export class DataWriteFrozenError extends Error {
  readonly code = DATA_WRITES_FROZEN_CODE;
  readonly functionName: string;

  constructor(functionName: string) {
    super(
      `Data writes are frozen (${DATA_WRITES_FROZEN_ENV_VAR}): ${functionName} refused before any statement ran.`,
    );
    this.name = "DataWriteFrozenError";
    this.functionName = functionName;
  }
}

export function isDataWriteFrozenError(error: unknown): error is DataWriteFrozenError {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return error.code === DATA_WRITES_FROZEN_CODE;
}

/** Throws before a mutation or action reaches either backend while the freeze is on. */
export function assertDataWritesNotFrozen(
  functionName: string,
  env: DataWriteFreezeEnv = process.env,
): void {
  if (isDataWriteFreezeActive(env)) {
    throw new DataWriteFrozenError(functionName);
  }
}

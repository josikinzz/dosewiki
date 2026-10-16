const DATA_WRITES_FROZEN_ENV_VAR = "DATA_WRITES_FROZEN"

export const DATA_WRITES_FROZEN_CODE = "DATA_WRITES_FROZEN";

const WRITES_ALLOWED_VALUES: Record<string, true> = {
  "": true,
  "0": true,
  false: true,
  off: true,
  no: true,
};

export type DataWriteFreezeEnv = { readonly [key: string]: string | undefined };

export function isDataWriteFreezeActive(env: DataWriteFreezeEnv = process.env): boolean {
  const raw = env[DATA_WRITES_FROZEN_ENV_VAR];
  if (typeof raw !== "string") return false;
  return WRITES_ALLOWED_VALUES[raw.trim().toLowerCase()] !== true;
}

export class DataWriteFrozenError extends Error {
  readonly code = DATA_WRITES_FROZEN_CODE;
  readonly functionName: string;
  readonly cause?: unknown;

  constructor(functionName: string, options?: { cause: unknown }) {
    super(
      options
        ? `Data writes are frozen: ${functionName} was refused by a read-only database transaction.`
        : `Data writes are frozen (${DATA_WRITES_FROZEN_ENV_VAR}): ${functionName} refused before any statement ran.`,
    );
    this.name = "DataWriteFrozenError";
    this.functionName = functionName;
    if (options) this.cause = options.cause;
  }
}

export function isDataWriteFrozenError(error: unknown): error is DataWriteFrozenError {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return error.code === DATA_WRITES_FROZEN_CODE;
}

export function assertDataWritesNotFrozen(
  functionName: string,
  env: DataWriteFreezeEnv = process.env,
): void {
  if (isDataWriteFreezeActive(env)) {
    throw new DataWriteFrozenError(functionName);
  }
}

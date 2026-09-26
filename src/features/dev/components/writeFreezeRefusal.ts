/**
 * The write-freeze refusal, with no React in it, so server modules (the
 * glossary export and import routes read `glossaryModel`) can recognise it.
 * `writeFreeze.ts` re-exports both for the browser.
 */

/**
 * The code every write route answers with while `DATA_WRITES_FROZEN` is on
 * (a 503 whose body carries `code: "DATA_WRITES_FROZEN"`). Mirrors
 * `DATA_WRITES_FROZEN_CODE` in `lib/runtime/dataWriteFreeze.ts`; the browser
 * bundle never imports the server module.
 */
export const WRITE_FREEZE_CODE = "DATA_WRITES_FROZEN";

/** True when a response is the freeze refusal: status 503 with the freeze code. */
export function isWriteFreezeRefusal(status: number, payload: unknown): boolean {
  return status === 503
    && payload !== null
    && typeof payload === "object"
    && (payload as { code?: unknown }).code === WRITE_FREEZE_CODE;
}

export const WRITE_FREEZE_CODE = "DATA_WRITES_FROZEN";

export function isWriteFreezeRefusal(status: number, payload: unknown): boolean {
  return status === 503
    && payload !== null
    && typeof payload === "object"
    && (payload as { code?: unknown }).code === WRITE_FREEZE_CODE;
}

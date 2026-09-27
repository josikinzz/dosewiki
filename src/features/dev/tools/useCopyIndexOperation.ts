"use client";
import { useCallback, useRef, useState } from "react";
import { isWriteFreezeRefusal } from "../components/writeFreeze";
export type CopyIndexReceipt = { revision: number; replayed: boolean; unchanged: boolean };

/**
 * A publication the route answered with a refusal. It carries the status and
 * the route's stable `code` so a caller can tell a revision conflict (409,
 * `EDIT_CONFLICT`) or the write freeze (503, `DATA_WRITES_FROZEN`) from any
 * other failure; `message` is the route's own words, as before.
 */
export class CopyIndexRefusal extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "CopyIndexRefusal";
    this.status = status;
    this.code = code;
  }
  /** Someone published after the draft was opened. */
  get conflict(): boolean {
    return this.status === 409;
  }
  /** The write freeze refused it before anything was written. */
  get frozen(): boolean {
    return isWriteFreezeRefusal(this.status, { code: this.code });
  }
}

/** An uncertain write keeps its exact identity; it must be reconciled before another draft can replace it. */
export function useCopyIndexOperation() {
  const pending = useRef<{ identity: string; operationId: string; uncertain: boolean } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const serialize = useCallback((body: object): string => {
    const identity = JSON.stringify(body);
    if (pending.current?.uncertain && pending.current.identity !== identity) throw new Error("A prior publication has no confirmed outcome. Restore that request and retry it before changing or discarding this draft.");
    if (pending.current?.identity !== identity) pending.current = { identity, operationId: crypto.randomUUID(), uncertain: true };
    pending.current.uncertain = true; setUncertain(true);
    return JSON.stringify({ ...body, operationId: pending.current.operationId });
  }, []);
  const acknowledge = useCallback((response: { ok: boolean; status: number }, payload: unknown): CopyIndexReceipt => {
    const value = payload && typeof payload === "object" ? payload : {};
    if (!response.ok) {
      // A 4xx is a definite refusal, and so is the write freeze: its 503 is
      // answered before any statement runs, so nothing can have been written.
      if ((response.status >= 400 && response.status < 500) || isWriteFreezeRefusal(response.status, value)) {
        if (pending.current) pending.current.uncertain = false;
        setUncertain(false);
      }
      const code = "code" in value && typeof value.code === "string" ? value.code : null;
      throw new CopyIndexRefusal("error" in value && typeof value.error === "string" ? value.error : "Publication was rejected. Your draft is preserved.", response.status, code);
    }
    if (!("revision" in value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || !("replayed" in value) || typeof value.replayed !== "boolean" || !("unchanged" in value) || typeof value.unchanged !== "boolean") throw new Error("Publication was not confirmed. Retry the same publication to confirm it before closing.");
    if (pending.current) pending.current.uncertain = false;
    setUncertain(false);
    return { revision: value.revision, replayed: value.replayed, unchanged: value.unchanged };
  }, []);
  return { serialize, acknowledge, uncertain };
}

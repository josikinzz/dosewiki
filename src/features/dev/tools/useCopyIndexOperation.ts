"use client";
import { useCallback, useRef, useState } from "react";
export type CopyIndexReceipt = { revision: number; replayed: boolean; unchanged: boolean };

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
      if (response.status >= 400 && response.status < 500) {
        if (pending.current) pending.current.uncertain = false;
        setUncertain(false);
      }
      throw new Error("error" in value && typeof value.error === "string" ? value.error : "Publication was rejected. Your draft is preserved.");
    }
    if (!("revision" in value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || !("replayed" in value) || typeof value.replayed !== "boolean" || !("unchanged" in value) || typeof value.unchanged !== "boolean") throw new Error("No valid publication receipt was received. Retry the same publication to reconcile it before closing.");
    if (pending.current) pending.current.uncertain = false;
    setUncertain(false);
    return { revision: value.revision, replayed: value.replayed, unchanged: value.unchanged };
  }, []);
  return { serialize, acknowledge, uncertain };
}

import { useEffect, useSyncExternalStore } from "react";

/**
 * The code every write route answers with while `DATA_WRITES_FROZEN` is on
 * (a 503 whose body carries `code: "DATA_WRITES_FROZEN"`). Mirrors
 * `DATA_WRITES_FROZEN_CODE` in `lib/runtime/dataWriteFreeze.ts`; the browser
 * bundle never imports the server module.
 */
export const WRITE_FREEZE_CODE = "DATA_WRITES_FROZEN";

/**
 * What the editor shell knows about the write freeze. The browser has no
 * read of the flag itself, so it learns from the first refused write and
 * forgets on the next write that lands. `null` until a write has answered.
 */
type WriteFreezeState = { frozen: boolean; since: number | null };

let state: WriteFreezeState = { frozen: false, since: null };
const listeners = new Set<() => void>();

function set(next: WriteFreezeState) {
  if (next.frozen === state.frozen) return;
  state = next;
  for (const listener of listeners) listener();
}

/** A write came back refused by the freeze. */
export function reportWriteFreeze(now = Date.now()) {
  set({ frozen: true, since: now });
}

/** A write landed, so the freeze (if one was seen) is over. */
export function clearWriteFreeze() {
  set({ frozen: false, since: null });
}

/** True when a response is the freeze refusal: status 503 with the freeze code. */
export function isWriteFreezeRefusal(status: number, payload: unknown): boolean {
  return status === 503
    && payload !== null
    && typeof payload === "object"
    && (payload as { code?: unknown }).code === WRITE_FREEZE_CODE;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the last write this browser made was refused by the freeze. */
export function useWriteFreeze(): WriteFreezeState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = input instanceof Request ? input.url : input.toString();
    return new URL(raw, window.location.href);
  } catch {
    return null;
  }
}

/**
 * Watches this tab's own API writes for the freeze refusal, so the shell can
 * say "writes are paused" before an editor loses more work to it. Every tool
 * writes through `fetch`, most of them directly, so the one place that sees
 * all of them is `fetch` itself. The wrapper only reads: it passes every
 * request through unchanged, clones a 503 body to look for the code, and puts
 * the original `fetch` back when the shell unmounts. Mount it once, at the
 * shell root.
 */
export function useWriteFreezeObserver() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    const original = window.fetch;
    const observed: typeof window.fetch = async (input, init) => {
      const response = await original(input, init);
      try {
        const url = requestUrl(input);
        if (url && url.origin === window.location.origin && url.pathname.startsWith("/api/") && WRITE_METHODS.has(requestMethod(input, init))) {
          if (response.status === 503) {
            void response.clone().json()
              .then((payload: unknown) => {
                if (isWriteFreezeRefusal(response.status, payload)) reportWriteFreeze();
              })
              .catch(() => undefined);
          } else if (response.ok) {
            clearWriteFreeze();
          }
        }
      } catch {
        // Observation must never change what the caller receives.
      }
      return response;
    };
    window.fetch = observed;
    return () => {
      if (window.fetch === observed) window.fetch = original;
    };
  }, []);
}

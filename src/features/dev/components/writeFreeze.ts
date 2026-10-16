import { useEffect, useSyncExternalStore } from "react";

import { WRITE_FREEZE_CODE, isWriteFreezeRefusal } from "./writeFreezeRefusal";

export { WRITE_FREEZE_CODE, isWriteFreezeRefusal };

type WriteFreezeState = { frozen: boolean; since: number | null };

let state: WriteFreezeState = { frozen: false, since: null };
const listeners = new Set<() => void>();

function set(next: WriteFreezeState) {
  if (next.frozen === state.frozen) return;
  state = next;
  for (const listener of listeners) listener();
}

export function reportWriteFreeze(now = Date.now()) {
  set({ frozen: true, since: now });
}

export function clearWriteFreeze() {
  set({ frozen: false, since: null });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

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
      }
      return response;
    };
    window.fetch = observed;
    return () => {
      if (window.fetch === observed) window.fetch = original;
    };
  }, []);
}

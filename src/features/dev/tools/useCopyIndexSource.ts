"use client";
import { useCallback, useEffect, useState } from "react";

/** Bounded copy/layout reads use the authenticated HTTP bridge, never browser admin credentials. */
export function useCopyIndexSource<T>(url: string | null) {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<{ url: string | null; data?: T; error: string | null }>({ url: null, error: null });
  const reload = useCallback(() => setGeneration((value) => value + 1), []);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setState((current) => current.url === url ? { ...current, error: null } : { url, error: null });
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "The editing source could not be loaded.");
      if (!controller.signal.aborted) setState({ url, data: body as T, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ url, error: error instanceof Error ? error.message : "The editing source could not be loaded." });
    });
    return () => controller.abort();
  }, [url, generation]);
  return { data: state.url === url ? state.data : undefined, error: state.url === url ? state.error : null, reload };
}

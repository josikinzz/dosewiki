import { useEffect, useLayoutEffect, useRef } from "react";

import { dismissPrePaintRouteStateCover } from "@/components/common/PrePaintRouteStateCover";
import { replaceCurrentIndexViewPath } from "@/utils/navigation";

export type LegacyIndexHashResolution<T extends string> =
  | { view: T; pathname: string }
  | { redirect: string }
  | null;

/**
 * Preserve old hash-tab URLs without ever exposing their default server view.
 * Canonical path routes arrive already resolved; this hook only migrates an
 * incoming legacy fragment and then removes it from the visible URL.
 */
export function useLegacyIndexHashRoute<T extends string>({
  value,
  setValue,
  resolve,
  coverId,
  redirect,
}: {
  value: T;
  setValue: (value: T) => void;
  resolve: (hash: string) => LegacyIndexHashResolution<T>;
  coverId: string;
  redirect?: (pathname: string) => void;
}) {
  const pendingViewRef = useRef<T | null>(null);

  useLayoutEffect(() => {
    if (pendingViewRef.current === value) {
      pendingViewRef.current = null;
      dismissPrePaintRouteStateCover(coverId);
    }
  }, [coverId, value]);

  useEffect(() => {
    const migrate = () => {
      if (!window.location.hash) {
        dismissPrePaintRouteStateCover(coverId);
        return;
      }

      const resolution = resolve(window.location.hash);
      if (!resolution) {
        dismissPrePaintRouteStateCover(coverId);
        return;
      }
      if ("redirect" in resolution) {
        redirect?.(resolution.redirect);
        return;
      }

      replaceCurrentIndexViewPath(resolution.pathname);
      if (resolution.view === value) {
        dismissPrePaintRouteStateCover(coverId);
        return;
      }
      pendingViewRef.current = resolution.view;
      setValue(resolution.view);
    };

    migrate();
    window.addEventListener("hashchange", migrate);
    return () => window.removeEventListener("hashchange", migrate);
  }, [coverId, redirect, resolve, setValue, value]);
}

import { useCallback, useRef } from "react";
import type { DevModeOpenOptions } from "./devModeTypes";

export function useDevNavigationState({
  getCurrentPath,
  navigate,
}: {
  getCurrentPath?: () => string;
  navigate?: (path: string) => void;
}) {
  const lastVisitedPathRef = useRef<string | null>(null);

  const readCurrentPath = useCallback(() => {
    if (getCurrentPath) {
      return getCurrentPath();
    }

    if (typeof window !== "undefined") {
      return window.location.pathname || "/substances";
    }

    return "/substances";
  }, [getCurrentPath]);

  const navigateToPath = useCallback((path: string) => {
    if (navigate) {
      navigate(path);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [navigate]);

  const isDevPath = useCallback((value: string | null | undefined) => {
    if (typeof value !== "string") {
      return false;
    }

    return value.startsWith("/dev");
  }, []);

  const open = useCallback((options?: DevModeOpenOptions) => {
    const currentPath = readCurrentPath();
    if (!currentPath) {
      return;
    }

    if (!isDevPath(currentPath)) {
      lastVisitedPathRef.current = currentPath;
    }

    const requestedTab = options?.tab ?? "edit";
    const slug = options?.slug?.trim();
    const nextPath = slug && slug.length > 0 ? `/dev/${requestedTab}/${slug}` : `/dev/${requestedTab}`;

    if (currentPath !== nextPath) {
      navigateToPath(nextPath);
      return;
    }

    if (!isDevPath(currentPath)) {
      navigateToPath(nextPath);
    }
  }, [isDevPath, navigateToPath, readCurrentPath]);

  const close = useCallback(() => {
    const currentPath = readCurrentPath();
    const fallback = lastVisitedPathRef.current && !isDevPath(lastVisitedPathRef.current)
      ? lastVisitedPathRef.current
      : "/substances";

    if (currentPath !== fallback) {
      navigateToPath(fallback);
      return;
    }

    if (navigate) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.history.pushState(null, "", "/substances");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [isDevPath, navigate, navigateToPath, readCurrentPath]);

  return { close, open };
}

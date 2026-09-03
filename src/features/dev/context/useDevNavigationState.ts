import { useCallback } from "react";

export function useDevNavigationState({
  getCurrentPath,
  navigate,
}: {
  getCurrentPath?: () => string;
  navigate?: (path: string) => void;
}) {
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

  const close = useCallback(() => {
    const currentPath = readCurrentPath();

    if (currentPath !== "/substances") {
      navigateToPath("/substances");
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
  }, [navigate, navigateToPath, readCurrentPath]);

  return { close };
}

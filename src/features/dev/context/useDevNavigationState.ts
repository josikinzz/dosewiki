import { useCallback, useEffect } from "react";

const DEFAULT_RETURN_PATH = "/substances";
const RETURN_PATH_KEY = "dosewiki:editor-return-path";
/** Pages that are part of getting into the editor, never a place to return to. */
const EDITOR_ENTRY_PREFIXES = ["/dev", "/sign-in", "/unauthorized", "/api"];

/**
 * The same-site page a referrer names, unless it is the editor itself or a
 * step on the way in. The public pages open the editor with plain links, so a
 * full load of /dev carries the page the editor came from as its referrer.
 */
export function editorReturnPathFromReferrer(referrer: string, origin: string): string | null {
  if (!referrer) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.origin !== origin) {
    return null;
  }
  const isEntryStep = EDITOR_ENTRY_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
  return isEntryStep ? null : `${url.pathname}${url.search}${url.hash}`;
}

function readStoredReturnPath(): string | null {
  try {
    return window.sessionStorage.getItem(RETURN_PATH_KEY);
  } catch {
    return null;
  }
}

export function useDevNavigationState({
  getCurrentPath,
  navigate,
}: {
  getCurrentPath?: () => string;
  navigate?: (path: string) => void;
}) {
  // Remember where the editor was opened from for the whole tab session, so a
  // reload inside /dev or the sign-in bounce does not forget it.
  useEffect(() => {
    const fromReferrer = editorReturnPathFromReferrer(document.referrer, window.location.origin);
    if (!fromReferrer) {
      return;
    }
    try {
      window.sessionStorage.setItem(RETURN_PATH_KEY, fromReferrer);
    } catch {
      // Storage can be off (private mode); Leave then falls back to the index.
    }
  }, []);

  const readCurrentPath = useCallback(() => {
    if (getCurrentPath) {
      return getCurrentPath();
    }

    if (typeof window !== "undefined") {
      return window.location.pathname || DEFAULT_RETURN_PATH;
    }

    return DEFAULT_RETURN_PATH;
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
    const returnPath = (typeof window === "undefined" ? null : readStoredReturnPath()) ?? DEFAULT_RETURN_PATH;

    if (currentPath !== returnPath) {
      navigateToPath(returnPath);
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
      window.history.pushState(null, "", DEFAULT_RETURN_PATH);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [navigate, navigateToPath, readCurrentPath]);

  return { close };
}

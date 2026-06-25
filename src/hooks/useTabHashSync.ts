import { useEffect } from "react";

/**
 * Two-way sync between a tab's active value and the URL hash so index tabs are
 * deep-linkable (e.g. `/chemical-classes#tryptamine`, `/substances#stimulant`).
 *
 * On mount and on `hashchange` it reads the hash and, when it names a valid tab,
 * selects it. Pair with {@link writeTabHash} in the tab `onValueChange` handler
 * to push the active tab back into the hash. `replaceState` doesn't emit
 * `hashchange`, so there's no feedback loop.
 */
export function useTabHashSync(opts: {
  setValue: (value: string) => void;
  isValid: (value: string) => boolean;
}) {
  const { setValue, isValid } = opts;
  useEffect(() => {
    const apply = () => {
      const raw = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
      if (raw && isValid(raw)) {
        setValue(raw);
      }
    };
    apply();
    // The `#tab` fragment is tab state, not a scroll anchor. When landing on the
    // page from a deep link (e.g. a substance-article badge), the browser/router
    // jumps toward the fragment, leaving the page scrolled down. Reset to the top
    // so opening a new page always starts at the top. Runs after the router's
    // own scroll pass (post-paint effect), so this wins.
    if (window.location.hash) {
      window.scrollTo({ top: 0, left: 0 });
    }
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
    // Read once on mount and on subsequent hashchange events; entries are static
    // for these index pages, so re-running per render isn't needed.
  }, []);
}

/** Replace the URL hash without a navigation or scroll jump. */
export function writeTabHash(value: string) {
  if (typeof window === "undefined") return;
  const url = `${window.location.pathname}${window.location.search}#${value}`;
  window.history.replaceState(null, "", url);
}

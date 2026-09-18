import { useEffect, useState } from "react";

/**
 * Reactive `window.matchMedia(query).matches`. SSR-safe: `false` during the
 * server render and until the effect runs, then tracks the query for as long
 * as the component is mounted. Re-subscribes when `query` changes.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const list = window.matchMedia(query);
    const update = () => {
      setMatches(list.matches);
    };

    update();

    if (typeof list.addEventListener === "function") {
      list.addEventListener("change", update);
      return () => {
        list.removeEventListener("change", update);
      };
    }

    // Safari < 14 exposes only the deprecated listener pair.
    list.addListener(update);
    return () => {
      list.removeListener(update);
    };
  }, [query]);

  return matches;
}

import { useEffect, useState } from "react";

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

    list.addListener(update);
    return () => {
      list.removeListener(update);
    };
  }, [query]);

  return matches;
}

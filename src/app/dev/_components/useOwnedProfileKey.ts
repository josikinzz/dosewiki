"use client";

import { useEffect, useState } from "react";

/**
 * Resolves the signed-in editor's canonical contributor key without holding up
 * the HTML.
 *
 * `contributorProfiles:getOwnedProfile` needs the server's admin intent token,
 * so it cannot move into the browser; awaiting it in the route component
 * instead pushed an uncached Postgres round trip in front of every byte of the
 * `/dev` response. The route now hands the unresolved promise down and this
 * hook adopts the answer when it lands. Until then the shell runs on the key
 * derived from the session email — the same value that read falls back to when
 * no profile is bound to the address — so the first paint and the hydration
 * pass agree.
 */
export function useOwnedProfileKey(
  derivedProfileKey: string | undefined,
  ownedProfileKey: Promise<string | null> | undefined,
): string | undefined {
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  useEffect(() => {
    setResolvedKey(null);

    if (!ownedProfileKey) {
      return;
    }

    let cancelled = false;
    // Promise.resolve is load-bearing: across the RSC boundary this arrives as
    // a React thenable whose .then() returns undefined, so chaining .catch()
    // off it crashes the shell.
    Promise.resolve(ownedProfileKey).then(
      (key) => {
        if (!cancelled && key) {
          setResolvedKey(key);
        }
      },
      (error: unknown) => {
        console.error("Unable to resolve the owned contributor profile key.", error);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [ownedProfileKey]);

  return resolvedKey ?? derivedProfileKey;
}

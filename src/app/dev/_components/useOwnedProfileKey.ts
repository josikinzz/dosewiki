"use client";

import { useEffect, useState } from "react";

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

"use client";

import { useEffect, useState } from "react";
import { loadOcl, type OclModule } from "./loadOcl";

export interface UseOclResult {
  ocl: OclModule | null;
  error: string | null;
}

export function useOcl(enabled = true): UseOclResult {
  const [ocl, setOcl] = useState<OclModule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadOcl().then(
      (mod) => alive && setOcl(mod),
      (err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { ocl, error };
}

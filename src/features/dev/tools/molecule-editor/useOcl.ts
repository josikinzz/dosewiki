"use client";

/**
 * OpenChemLib module hook for the brand SVG renderer (`renderMoleculeSvg.ts`)
 * — the render-side counterpart of `useRdkit` (which now serves only the InChI
 * stereo guard). Resolves once per session via the shared `loadOcl` loader.
 */
import { useEffect, useState } from "react";
import { loadOcl, type OclModule } from "./loadOcl";

export interface UseOclResult {
  ocl: OclModule | null;
  error: string | null;
}

/** Returns the OpenChemLib module once ready (null while loading), or an error string. */
export function useOcl(): UseOclResult {
  const [ocl, setOcl] = useState<OclModule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadOcl().then(
      (mod) => alive && setOcl(mod),
      (err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      alive = false;
    };
  }, []);

  return { ocl, error };
}

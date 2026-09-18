"use client";

/**
 * Shared lazy loader for the OpenChemLib bundle (the repository-owned fork in
 * `vendor/openchemlib`). Dynamically imported so the ~1 MB library stays out of
 * every public page bundle — only the `/dev` molecule surfaces pay for it, and
 * they already do for the drawing canvas (`OclEditor.tsx`).
 */

export type OclModule = typeof import("openchemlib");

let oclPromise: Promise<OclModule> | null = null;

export function loadOcl(): Promise<OclModule> {
  if (!oclPromise) {
    oclPromise = import("openchemlib").then((mod) =>
      "Molecule" in mod ? (mod as OclModule) : (mod as { default: OclModule }).default,
    );
  }
  return oclPromise;
}

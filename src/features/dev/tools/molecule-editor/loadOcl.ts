"use client";

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

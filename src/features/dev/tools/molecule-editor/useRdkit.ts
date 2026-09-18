"use client";

/**
 * Lazily load the RDKit.js MinimalLib WASM in the browser, once per session.
 *
 * The 6.6 MB WASM is fetched at runtime from `/public/rdkit` (copied there by
 * `scripts/tools/copyRdkitAssets.mjs`) via a plain <script> tag + `locateFile`, so it
 * never enters any webpack/Next bundle — only the `/dev` Molecule editor pays for it.
 */
import { useEffect, useState } from "react";
import type { RdkitModuleLike } from "./stereoGuard";

type InitRDKit = (opts?: {
  locateFile?: (file: string) => string;
}) => Promise<RdkitModuleLike>;

/** Read the loader the /public script registers, without colliding with the
 * package's own `Window.initRDKitModule` global declaration. */
function globalLoader(): InitRDKit | undefined {
  return (window as unknown as { initRDKitModule?: InitRDKit }).initRDKitModule;
}

let rdkitPromise: Promise<RdkitModuleLike> | null = null;

function loadRdkit(): Promise<RdkitModuleLike> {
  if (rdkitPromise) return rdkitPromise;
  rdkitPromise = new Promise<RdkitModuleLike>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("RDKit.js requires a browser environment"));
      return;
    }
    const init = () => {
      const fn = globalLoader();
      if (!fn) {
        reject(new Error("RDKit loader did not register initRDKitModule"));
        return;
      }
      fn({ locateFile: () => "/rdkit/RDKit_minimal.wasm" }).then(resolve, reject);
    };

    if (globalLoader()) {
      init();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-rdkit-loader]",
    );
    if (existing) {
      existing.addEventListener("load", init);
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load /rdkit/RDKit_minimal.js")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "/rdkit/RDKit_minimal.js";
    script.async = true;
    script.dataset.rdkitLoader = "true";
    script.addEventListener("load", init);
    script.addEventListener("error", () =>
      reject(new Error("Failed to load /rdkit/RDKit_minimal.js")),
    );
    document.head.appendChild(script);
  });
  return rdkitPromise;
}

export interface UseRdkitResult {
  rdkit: RdkitModuleLike | null;
  error: string | null;
}

/** Returns the RDKit module once enabled and ready, or an error string. */
export function useRdkit(enabled = true): UseRdkitResult {
  const [rdkit, setRdkit] = useState<RdkitModuleLike | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadRdkit().then(
      (mod) => alive && setRdkit(mod),
      (err: unknown) =>
        alive && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { rdkit, error };
}

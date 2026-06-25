#!/usr/bin/env node
/**
 * Copy the RDKit.js MinimalLib runtime (loader + WASM) from the installed
 * `@rdkit/rdkit` package into `public/rdkit/` so it can be served as a static
 * asset and lazy-loaded by the `/dev` Molecule editor.
 *
 * Idempotent: skips files whose size already matches, so it is cheap to run on
 * every `predev` / `prebuild`. Run manually after bumping `@rdkit/rdkit`.
 */
import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(repoRoot, "node_modules", "@rdkit", "rdkit", "dist");
const outDir = join(repoRoot, "public", "rdkit");
const FILES = ["RDKit_minimal.js", "RDKit_minimal.wasm"];

async function size(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let copied = 0;
  for (const file of FILES) {
    const src = join(distDir, file);
    const dest = join(outDir, file);
    if ((await size(src)) === -1) {
      console.error(
        `[rdkit:assets] missing ${src} - is @rdkit/rdkit installed?`,
      );
      process.exitCode = 1;
      return;
    }
    if ((await size(src)) === (await size(dest))) continue;
    await cp(src, dest);
    copied += 1;
  }
  console.log(
    copied === 0
      ? "[rdkit:assets] public/rdkit up to date"
      : `[rdkit:assets] copied ${copied} file(s) to public/rdkit`,
  );
}

main();

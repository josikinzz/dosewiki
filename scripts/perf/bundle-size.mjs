#!/usr/bin/env node
/**
 * scripts/perf/bundle-size.mjs: deterministic build-side bundle metric.
 *
 * Next.js 16's build table no longer prints "First Load JS", so we recompute the
 * shared client JS baseline (the chunks every App Router route downloads on first
 * load) directly from `.next/build-manifest.json`, reporting both raw and gzipped
 * bytes. We also list the heaviest individual chunks to guide what to trim.
 *
 * Reproducible: same source + same build = same numbers. Run after `npm run build`.
 *
 * Usage: node scripts/perf/bundle-size.mjs
 */

import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const NEXT = ".next";
const manifestPath = join(NEXT, "build-manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`No ${manifestPath}; run \`npm run build\` first.`);
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function sizeOf(relFromStatic) {
  // manifest entries are like "static/chunks/foo.js" relative to .next
  const p = join(NEXT, relFromStatic);
  if (!existsSync(p)) return { raw: 0, gz: 0, missing: true };
  const buf = readFileSync(p);
  return { raw: buf.length, gz: gzipSync(buf).length };
}

const sharedFiles = [
  ...(manifest.rootMainFiles || []),
  ...(manifest.polyfillFiles || []),
];

let sharedRaw = 0;
let sharedGz = 0;
const perFile = [];
for (const f of sharedFiles) {
  const s = sizeOf(f);
  sharedRaw += s.raw;
  sharedGz += s.gz;
  perFile.push({ file: f, raw: s.raw, gz: s.gz });
}

// Heaviest chunks overall (gzipped) — optimization targets.
const chunkDir = join(NEXT, "static", "chunks");
const chunks = [];
function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) walk(full);
    else if (name.name.endsWith(".js")) {
      const buf = readFileSync(full);
      chunks.push({
        file: full.replace(`${NEXT}/`, ""),
        raw: buf.length,
        gz: gzipSync(buf).length,
      });
    }
  }
}
if (existsSync(chunkDir)) walk(chunkDir);
chunks.sort((a, b) => b.gz - a.gz);

const kb = (n) => Math.round((n / 1024) * 10) / 10;

const out = {
  sharedFirstLoadJs: { rawKB: kb(sharedRaw), gzKB: kb(sharedGz), files: perFile.length },
  sharedFiles: perFile.map((f) => ({ file: f.file, rawKB: kb(f.raw), gzKB: kb(f.gz) })),
  totalChunks: chunks.length,
  totalChunksGzKB: kb(chunks.reduce((s, c) => s + c.gz, 0)),
  heaviestChunks: chunks.slice(0, 15).map((c) => ({ file: c.file, rawKB: kb(c.raw), gzKB: kb(c.gz) })),
};

console.log(JSON.stringify(out, null, 2));

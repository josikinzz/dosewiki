import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  classifiedDirectProductionWriterPaths,
  productionWriterClassifications,
} from "./production-writer-inventory.mjs";
import { detectProductionWriteSignals } from "./production-writer-detector.mjs";

const repoRoot = process.cwd();
const scriptsRoot = resolve(repoRoot, "scripts");
const scriptExtensions = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const path = resolve(dir, entry);
    const relativePath = relative(repoRoot, path);
    if (
      relativePath.startsWith("scripts/deprecated/") ||
      relativePath.includes("/archive/")
    ) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      walk(path, files);
    } else if (
      scriptExtensions.has(extname(path)) &&
      !/\.(?:test|spec)\.[^.]+$/.test(path)
    ) {
      files.push(relativePath);
    }
  }
  return files;
}

const activeScriptDetections = walk(scriptsRoot).map((path) => ({
  path,
  detection: detectProductionWriteSignals(
    readFileSync(resolve(repoRoot, path), "utf8"),
    path,
  ),
}));

const SHARED_CLIENT_LIBRARIES = new Set([
  "scripts/lib/data-ops-run-context.mjs",
  "scripts/lib/data-client.ts",
]);

// Local-Postgres rehearsals and parity harnesses write scratch rows through
// the runtime and are gated by targetGuard (loopback only unless
// --allow-remote plus POSTGRES_IMPORT_CONFIRM), not by the Postgres deployment
// ceremony. The `it.each` below holds them to that guard.
const POSTGRES_GUARDED_WRITER_PATTERN =
  /^scripts\/postgres\/(?:(?:rehearse-[^/]+|parity[^/]*)|rebuild-derived-tables)\.ts$/;

function activeDirectMutationWriters() {
  return activeScriptDetections
    .filter(({ path }) => !SHARED_CLIENT_LIBRARIES.has(path) && !POSTGRES_GUARDED_WRITER_PATTERN.test(path))
    .filter(({ detection }) => detection.kinds.includes("data-mutation"))
    .map(({ path }) => path)
    .sort();
}

function postgresRehearsalWriters() {
  return activeScriptDetections
    .filter(({ path, detection }) => POSTGRES_GUARDED_WRITER_PATTERN.test(path) && detection.kinds.includes("data-mutation"))
    .map(({ path }) => path)
    .sort();
}

function hasStrongBoundary(source) {
  return (
    (source.includes("production-write-command.mjs") &&
      /assertProductionWriteAllowed|executeProductionWrite/.test(source)) ||
    (source.includes("assertDataOpsWriteAllowed") &&
      source.includes("data-ops-run-context.mjs")) ||
    source.includes("createBatchTargetClient")
  );
}

function sourceWithoutGuardedDryRunReadFallbacks(source) {
  // The write assertion makes command.targetUrl mandatory, so later terms in
  // this leftmost-target chain are reachable only while reporting a dry run.
  return source.replace(
    /const\s+readUrl\s*=\s*command\.targetUrl\s*(?:\?\?|\|\|)[^;]+;/g,
    "",
  );
}

describe("production writer command surface", () => {
  it("classifies every active direct Postgres mutation file", () => {
    expect(activeDirectMutationWriters().filter((path) => !classifiedDirectProductionWriterPaths.includes(path))).toEqual([]);
  });

  it.each(postgresRehearsalWriters())("%s writes only behind the Postgres target guard", (path) => {
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    expect(source).toMatch(/guardTarget\(|createDataClient\(/);
  });

  it("classifies indirect Postgres CLI and HTTP mutation entrypoints", () => {
    const classified = new Set([
      ...classifiedDirectProductionWriterPaths,
      ...productionWriterClassifications.guardedIndirectEntrypoint,
    ]);
    const unclassified = activeScriptDetections.filter(({ path, detection }) => {
      const kinds = detection.kinds;
      const exemption = productionWriterClassifications.detectorExemption.some(
        ({ path: exemptPath, reason }) => exemptPath === path && reason.length > 0,
      );
      return (
        (kinds.includes("data-cli-write") || kinds.includes("http-write")) &&
        !classified.has(path) &&
        !exemption
      );
    }).map(({ path }) => path);

    expect(unclassified).toEqual([]);
  });

  it.each(productionWriterClassifications.productionBoundary)(
    "%s uses the explicit production-write boundary",
    (path) => {
      const source = readFileSync(resolve(repoRoot, path), "utf8");
      expect(source).toContain("production-write-command.mjs");
      expect(source).toMatch(/assertProductionWriteAllowed|executeProductionWrite/);
      expect(sourceWithoutGuardedDryRunReadFallbacks(source)).not.toMatch(
        /process\.env\.(?:POSTGRES_POOLED_URL|POSTGRES_DIRECT_URL)/,
      );
    },
  );

  it.each(productionWriterClassifications.dataOpsBoundary)(
    "%s uses the shared data-ops write assertion",
    (path) => {
      const source = readFileSync(resolve(repoRoot, path), "utf8");
      expect(source).toContain("assertDataOpsWriteAllowed");
    },
  );

  it.each(productionWriterClassifications.delegatedModule)(
    "$path is reachable only through classified guarded entrypoints",
    ({ guardedEntrypoints }) => {
      expect(guardedEntrypoints.length).toBeGreaterThan(0);
      for (const entrypoint of guardedEntrypoints) {
        const source = readFileSync(resolve(repoRoot, entrypoint), "utf8");
        expect(hasStrongBoundary(source), entrypoint).toBe(true);
      }
    },
  );

  it.each(productionWriterClassifications.guardedIndirectEntrypoint)(
    "%s cannot reach its delegated write without a strong boundary",
    (path) => {
      const source = readFileSync(resolve(repoRoot, path), "utf8");
      expect(hasStrongBoundary(source)).toBe(true);
    },
  );

});

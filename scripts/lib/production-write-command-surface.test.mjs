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

const POSTGRES_GUARDED_WRITER_PATTERN =
  /^scripts\/postgres\/(?:rehearse-[^/]+|parity[^/]*)\.ts$/;
const REHEARSAL_PATTERN = /^scripts\/postgres\/rehearse-[^/]+\.ts$/;

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

function unclassifiedRawSqlWriters(detections) {
  const classified = new Set([
    ...classifiedDirectProductionWriterPaths,
    ...productionWriterClassifications.guardedIndirectEntrypoint,
    ...productionWriterClassifications.localRehearsal,
  ]);
  return detections
    .filter(({ path, detection }) => detection.kinds.includes("raw-sql-write") && !classified.has(path))
    .map(({ path }) => path)
    .sort();
}

const STORAGE_UPLOAD_CONFIRMATIONS = {
  "scripts/build/publishSocialCardsToR2.mjs": ["--confirm-operation", "--confirm-plan", "--confirm-target", "--confirm-bucket"],
  "scripts/replications/prepare-r2-image-renditions.ts": ["--confirm-write", "--confirm-plan"],
  "scripts/replications/run-local-r2-upload-batches.mjs": ["--confirm-write"],
};

const INDIRECT_WRITE_KINDS =["data-cli-write", "http-write", "library-write", "subprocess-write"];

function unclassifiedIndirectWriters(detections) {
  const classified = new Set([
    ...classifiedDirectProductionWriterPaths,
    ...productionWriterClassifications.guardedIndirectEntrypoint,
    ...productionWriterClassifications.localRehearsal,
    ...productionWriterClassifications.storageUploadEntrypoint,
  ]);
  return detections
    .filter(({ path, detection }) => {
      const exemption = productionWriterClassifications.detectorExemption.some(
        ({ path: exemptPath, reason }) => exemptPath === path && reason.length > 0,
      );
      return detection.kinds.some((kind) => INDIRECT_WRITE_KINDS.includes(kind)) && !classified.has(path) && !exemption;
    })
    .map(({ path }) => path)
    .sort();
}

function hasStrongBoundary(source) {
  return (
    (source.includes("production-write-command.mjs") &&
      /authorizeProductionWrite|assertProductionWriteAllowed|executeProductionWrite/.test(source)) ||
    (source.includes("assertDataOpsWriteAllowed") &&
      source.includes("data-ops-run-context.mjs")) ||
    source.includes("createBatchTargetClient")
  );
}

function sourceWithoutGuardedDryRunReadFallbacks(source) {
  return source.replace(
    /const\s+readUrl\s*=\s*command\.targetUrl\s*(?:\?\?|\|\|)[^;]+;/g,
    "",
  );
}

describe("production writer command surface", () => {
  it("classifies every active direct Postgres mutation file", () => {
    expect(activeDirectMutationWriters().filter((path) => !classifiedDirectProductionWriterPaths.includes(path))).toEqual([]);
  });

  it("holds the derived-table rebuild to the production boundary, not the rehearsal exemption", () => {
    const rebuild = "scripts/postgres/rebuild-derived-tables.ts";
    expect(POSTGRES_GUARDED_WRITER_PATTERN.test(rebuild)).toBe(false);
    expect(activeDirectMutationWriters()).toContain(rebuild);
    expect(productionWriterClassifications.productionBoundary).toContain(rebuild);
  });

  it("classifies every active raw SQL writer", () => {
    expect(unclassifiedRawSqlWriters(activeScriptDetections)).toEqual([]);
  });

  it("fails for a raw SQL writer that has no classification", () => {
    const path = "scripts/fixture/unclassified-truncate.mjs";
    const detection = detectProductionWriteSignals(`await client.query("TRUNCATE x")`, path);
    expect(unclassifiedRawSqlWriters([...activeScriptDetections, { path, detection }])).toEqual([path]);
  });

  it.each(productionWriterClassifications.localRehearsal)("%s admits only an unfrozen loopback target", (path) => {
    expect(path).toMatch(REHEARSAL_PATTERN);
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    expect(source).toMatch(/resolveLocalRehearsalTarget\(/);
    expect(source).not.toMatch(/guardTarget\(|resolveTarget\(/);
  });

  it.each(postgresRehearsalWriters())("%s writes only behind a Postgres target guard", (path) => {
    if (REHEARSAL_PATTERN.test(path)) {
      expect(productionWriterClassifications.localRehearsal).toContain(path);
      return;
    }
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    expect(source).toMatch(/guardTarget\(|createDataClient\(/);
  });

  it.each(
    activeScriptDetections
      .map(({ path }) => path)
      .filter((path) => REHEARSAL_PATTERN.test(path) && !productionWriterClassifications.localRehearsal.includes(path)),
  )("%s is a read-only rehearsal outside the local rehearsal inventory", (path) => {
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    expect(source).not.toMatch(/insertDocument|patchDocument|deleteDocument|withTransaction|spawnSync|\.mutation\(|\.sql\(/);
    expect(activeScriptDetections.find((entry) => entry.path === path).detection.kinds).toEqual([]);
  });

  it("classifies indirect library, subprocess, and HTTP write entrypoints", () => {
    expect(unclassifiedIndirectWriters(activeScriptDetections)).toEqual([]);
  });

  it.each([
    "scripts/postgres/migrate.ts",
    "scripts/translation/live-mirror.ts",
    "scripts/translation/load-glosses.ts",
    ...productionWriterClassifications.storageUploadEntrypoint,
  ])("%s produces a write signal the inventory must answer", (path) => {
    const { detection } = activeScriptDetections.find((entry) => entry.path === path);
    expect(detection.kinds.filter((kind) => INDIRECT_WRITE_KINDS.includes(kind))).not.toEqual([]);
  });

  it.each([
    ["scripts/fixture/library-writer.ts", `import { upsertGlosses } from "../../lib/translation/glossaryGloss";\nawait upsertGlosses(rows, "fixture");`],
    ["scripts/fixture/namespace-writer.ts", `import * as store from "../../lib/translation/segmentStore";\nawait store.enqueueTranslationJobs(["zh-Hans"], slugs);`],
    ["scripts/fixture/rclone-upload.mjs", `const copy = ["copy", root, remote];\nspawnSync("rclone", copy);`],
    ["scripts/fixture/schema-launch.ts", `const command = ["bunx", "drizzle-kit", "migrate"];\nspawnSync(command[0], command.slice(1));`],
    ["scripts/fixture/parameterized-put.ts", `const send = (method, url) => fetch(url, { method });\nawait send("PUT", key);`],
  ])("fails admission for an unclassified write in %s", (path, source) => {
    const detection = detectProductionWriteSignals(source, path);
    expect(unclassifiedIndirectWriters([...activeScriptDetections, { path, detection }])).toEqual([path]);
  });

  it.each([
    ["scripts/fixture/library-reader.ts", `import { loadGlosses } from "../../lib/translation/glossaryGloss";\nawait loadGlosses();`],
    ["scripts/fixture/script-guard.ts", `import { authorizeProductionWrite } from "../lib/production-write-command.mjs";\nauthorizeProductionWrite(command);`],
    ["scripts/fixture/rclone-read.mjs", `execFile("rclone", ["lsjson", remote]);`],
    ["scripts/fixture/schema-generate.ts", `spawnSync("bunx", ["drizzle-kit", "generate"]);`],
    ["scripts/fixture/static-read.ts", `const head = (method, url) => fetch(url, { method: "HEAD" });\nawait head("PUT", key);`],
  ])("raises no write signal for the read-only %s", (path, source) => {
    expect(detectProductionWriteSignals(source, path).signals).toEqual([]);
  });

  it.each(productionWriterClassifications.productionBoundary)(
    "%s uses the explicit production-write boundary",
    (path) => {
      const source = readFileSync(resolve(repoRoot, path), "utf8");
      expect(source).toContain("production-write-command.mjs");
      expect(source).toMatch(/authorizeProductionWrite|assertProductionWriteAllowed|executeProductionWrite/);
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

  it("names the native confirmation contract of every storage uploader", () => {
    expect(Object.keys(STORAGE_UPLOAD_CONFIRMATIONS).sort()).toEqual(
      [...productionWriterClassifications.storageUploadEntrypoint].sort(),
    );
  });

  it.each(productionWriterClassifications.storageUploadEntrypoint)(
    "%s asserts the write freeze behind its storage write confirmation",
    (path) => {
      const source = readFileSync(resolve(repoRoot, path), "utf8");
      expect(source).toMatch(/\bassertDataWritesNotFrozen\(/);
      for (const flag of STORAGE_UPLOAD_CONFIRMATIONS[path]) {
        expect(source, flag).toContain(flag);
      }
    },
  );

  it("never exempts a storage writer as a detector false positive", () => {
    const exempt = new Set(productionWriterClassifications.detectorExemption.map(({ path }) => path));
    expect(productionWriterClassifications.storageUploadEntrypoint.filter((path) => exempt.has(path))).toEqual([]);
  });

});

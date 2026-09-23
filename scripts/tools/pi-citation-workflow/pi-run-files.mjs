/**
 * Run-local JSON, digest, path, and manifest helpers for the Pi run manifest
 * controller. Paths stay inside the citation run and its workbench.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import { CITABLE_SECTIONS, MANIFEST_FILE, SECTION_STATUSES } from "./pi-run-schema.mjs";

export function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertManifestMutable(manifest) {
  if (manifest.outcome === "needs_review" || manifest.finalizedAt) {
    throw new Error("Cannot mutate a finalized manifest");
  }
}

export function now() {
  return new Date().toISOString();
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function writeJsonAtomically(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function textLength(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().length;
  if (Array.isArray(value)) return value.reduce((total, item) => total + textLength(item), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((total, item) => total + textLength(item), 0);
  return 0;
}

export function taskPath(runPath) {
  return resolve(runPath, "citation-task.json");
}

export function manifestPath(runPath) {
  return resolve(runPath, MANIFEST_FILE);
}

export function pathForManifest(runPath, requestedPath) {
  if (!requestedPath) return null;
  const absolute = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(runPath, requestedPath);
  const rel = relative(runPath, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("artifact paths must remain inside the citation run directory");
  return rel || basename(absolute);
}

export function resolveWorkbench(runPath, requestedPath) {
  const workbench = resolve(requestedPath ?? dirname(dirname(runPath)));
  const expectedRun = resolve(workbench, "runs", basename(runPath));
  if (expectedRun !== runPath) {
    throw new Error(`Run directory must be workbench/runs/<run-id>: expected ${expectedRun}, received ${runPath}`);
  }
  if (!existsSync(resolve(workbench, "package.json"))) {
    throw new Error(`Workbench package.json does not exist: ${resolve(workbench, "package.json")}`);
  }
  return workbench;
}

export function runPathRelativeToWorkbench(workbench, runPath) {
  const runRelative = relative(workbench, runPath);
  if (runRelative.startsWith("..") || isAbsolute(runRelative)) throw new Error("Run path is outside the selected workbench");
  return runRelative;
}

export function readManifest(runPath) {
  const path = manifestPath(runPath);
  if (!existsSync(path)) throw new Error(`Pi run manifest does not exist: ${path}. Run init first.`);
  const manifest = readJson(path);
  if (manifest.schemaVersion !== "dosewiki_pi_citation_run_v1") throw new Error(`Unsupported Pi run manifest schema at ${path}`);
  return { path, manifest };
}

export function appendEvent(manifest, event) {
  manifest.events ??= [];
  manifest.events.push({ at: now(), ...event });
  manifest.updatedAt = now();
}

export function allSectionsTerminal(manifest) {
  return CITABLE_SECTIONS.every((section) => SECTION_STATUSES.has(manifest.sections?.[section]?.status));
}

export function fileDigest(path) {
  return existsSync(path) ? sha256(path) : null;
}

export function sectionDigests(runPath) {
  const directory = resolve(runPath, "sections");
  if (!existsSync(directory)) return {};
  return Object.fromEntries(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => [`sections/${file}`, sha256(resolve(directory, file))]),
  );
}

export function proposalInputDigests(runPath) {
  const directory = resolve(runPath, "proposal-input");
  if (!existsSync(directory)) return null;
  return Object.fromEntries(
    readdirSync(directory)
      .sort()
      .map((file) => {
        const path = resolve(directory, file);
        if (!statSync(path).isFile()) throw new Error(`proposal-input may contain files only: ${path}`);
        return [`proposal-input/${file}`, sha256(path)];
      }),
  );
}

export function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

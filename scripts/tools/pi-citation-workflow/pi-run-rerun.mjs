/**
 * Corrective rerun preparation: reserve a unique successor run, copy read-only
 * proposal inputs, and reuse accepted section artifacts whose hashes still match.
 */

import { randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { CITABLE_SECTIONS } from "./pi-run-schema.mjs";
import { appendEvent, now, pathForManifest, readManifest, sha256, writeJsonAtomically } from "./pi-run-files.mjs";
import { writeGateLog } from "./pi-run-gates.mjs";

export function copyProposalInputsForRerun(parentRunPath, rerunPath) {
  const source = resolve(parentRunPath, "proposal-input");
  if (!existsSync(source)) return;
  const destination = resolve(rerunPath, "proposal-input");
  mkdirSync(destination, { recursive: false, mode: 0o755 });
  for (const file of readdirSync(source).sort()) {
    const from = resolve(source, file);
    const to = resolve(destination, file);
    if (!lstatSync(from).isFile() || lstatSync(from).isSymbolicLink()) {
      throw new Error(`Finalized proposal input must be a regular file: ${from}`);
    }
    copyFileSync(from, to);
    chmodSync(to, 0o444);
  }
}

export function reserveCorrectiveRerunDirectory(workbench, parentRunId) {
  const runsRoot = resolve(workbench, "runs");
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const runId = `${parentRunId}--correction-${randomUUID()}`;
    const runPath = resolve(runsRoot, runId);
    try {
      mkdirSync(runPath, { recursive: false, mode: 0o755 });
      return { runId, runPath };
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error("Unable to reserve a unique corrective rerun directory");
}

export function reuseAcceptedSections(parentRunPath, rerunPath, parentManifest) {
  const { path: rerunManifestPath, manifest: rerunManifest } = readManifest(rerunPath);
  const reused = [];
  const notReused = [];
  for (const section of CITABLE_SECTIONS) {
    const parentRecord = parentManifest.sections?.[section];
    if (parentRecord?.status !== "checked") continue;
    if (!parentRecord.artifact || !parentRecord.artifactSha256) {
      notReused.push({ section, reason: "accepted manifest record lacks an artifact path or hash" });
      continue;
    }
    let source;
    try {
      source = resolve(parentRunPath, pathForManifest(parentRunPath, parentRecord.artifact));
    } catch (error) {
      notReused.push({ section, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (!existsSync(source)) {
      notReused.push({ section, reason: "accepted artifact is missing" });
      continue;
    }
    const sourceStat = lstatSync(source);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      notReused.push({ section, reason: "accepted artifact is not a regular file" });
      continue;
    }
    const currentSha256 = sha256(source);
    if (currentSha256 !== parentRecord.artifactSha256) {
      notReused.push({ section, reason: "accepted artifact hash no longer matches the manifest" });
      continue;
    }

    const artifact = `sections/${section}.json`;
    const destination = resolve(rerunPath, artifact);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    const checkLog = writeGateLog(rerunPath, `section-${section}-reuse-check`, {
      command: ["reuse-sections", basename(parentRunPath), parentRecord.artifact],
      cwd: rerunPath,
      exitCode: 0,
      stdout: `Reused accepted ${section} artifact with matching SHA-256.\n`,
      stderr: "",
      error: null,
      parentCheckLog: parentRecord.checkLog ?? null,
      parentRecheckedAt: parentRecord.recheckedAt ?? null,
      artifactSha256: currentSha256,
    });
    rerunManifest.sections[section] = {
      ...rerunManifest.sections[section],
      status: "checked",
      workerId: parentRecord.workerId ?? null,
      model: parentRecord.model ?? null,
      artifact,
      artifactSha256: currentSha256,
      checkLog,
      recordedAt: now(),
      reusedFrom: {
        runId: parentManifest.runId,
        artifact: parentRecord.artifact,
        checkLog: parentRecord.checkLog ?? null,
        acceptedAt: parentRecord.recheckedAt ?? parentRecord.recordedAt ?? null,
      },
    };
    appendEvent(rerunManifest, { type: "section_reused", section, fromRunId: parentManifest.runId, artifact, artifactSha256: currentSha256, checkLog });
    reused.push({ section, artifact, artifactSha256: currentSha256, checkLog });
  }
  writeJsonAtomically(rerunManifestPath, rerunManifest);
  return { reused, notReused };
}

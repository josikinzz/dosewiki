/**
 * Task identity checks: local proposal bindings, corrective rerun linkage, and
 * the match between the current citation task and its initialized manifest.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { CITABLE_SECTIONS, CORRECTIVE_RERUN_SCHEMA, normalizeTaskSelectedSections } from "./pi-run-schema.mjs";
import { equalJson, isPlainRecord, manifestPath, readJson, readManifest, sha256, taskPath, textLength } from "./pi-run-files.mjs";

function isLocalProposalTask(task) {
  return task?.inputBinding?.kind === "local_section_proposal" ||
    task?.provenance?.source === "local_section_proposal";
}

export function assertLocalProposalTask(task, runPath) {
  if (!isLocalProposalTask(task)) return null;
  const binding = task.inputBinding;
  if (binding?.schemaVersion !== "dosewiki_local_proposal_binding_v1" || binding?.kind !== "local_section_proposal") {
    throw new Error("Local proposal task inputBinding is invalid");
  }
  if (task.provenance?.source !== "local_section_proposal" ||
      task.provenance?.taskMode !== "local_experiment" ||
      task.provenance?.applyBound !== false) {
    throw new Error("Local proposal task must be a non-apply-bound local experiment");
  }
  if (task.promotion?.allowed !== false || task.promotion?.policy !== "never") {
    throw new Error("Local proposal task must have a permanent no-promotion policy");
  }
  if (binding.slug !== task.article?.slug) throw new Error("Local proposal binding slug does not match task article slug");
  if (!CITABLE_SECTIONS.includes(binding.section)) throw new Error("Local proposal binding section is not citable");

  const sections = task.article?.citableSections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
    throw new Error("Local proposal task is missing article.citableSections");
  }
  const keys = Object.keys(sections).sort();
  if (!equalJson(keys, [...CITABLE_SECTIONS].sort())) {
    throw new Error("Local proposal task must contain exactly the six citable section keys");
  }
  const nonEmpty = CITABLE_SECTIONS.filter((section) => textLength(sections[section]) > 0);
  if (!equalJson(nonEmpty, [binding.section])) {
    throw new Error("Local proposal task must have exactly its bound section as nonempty citable input");
  }
  for (const section of CITABLE_SECTIONS) {
    if (section !== binding.section && sections[section] !== null) {
      throw new Error(`Local proposal task section ${section} must be null`);
    }
  }

  const inputDirectory = resolve(runPath, "proposal-input");
  const bindingPath = resolve(inputDirectory, "binding.json");
  const proposalPath = resolve(inputDirectory, "proposal.json");
  const manifestInputPath = resolve(inputDirectory, "target-manifest.json");
  const rawResponsePath = resolve(inputDirectory, "openrouter-response.txt");
  for (const path of [bindingPath, proposalPath, manifestInputPath, rawResponsePath]) {
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Local proposal input is missing: ${path}`);
  }
  const persistedBinding = readJson(bindingPath);
  if (!equalJson(persistedBinding, binding)) throw new Error("Task and proposal-input bindings do not match");
  if (sha256(proposalPath) !== binding.proposalJsonSha256) throw new Error("Local proposal JSON hash does not match its binding");
  const proposal = readJson(proposalPath);
  const proposalManifest = readJson(manifestInputPath);
  if (proposal.artifactDigest !== binding.artifactDigest ||
      proposal.artifactDigestVersion !== binding.artifactDigestVersion ||
      proposal.manifestDigest !== binding.manifestDigest ||
      proposal.sectionHashAfter !== binding.sectionHashAfter ||
      proposal.slug !== binding.slug || proposal.section !== binding.section) {
    throw new Error("Copied proposal fields do not match the local binding");
  }
  if (proposalManifest.manifestDigest !== binding.manifestDigest) {
    throw new Error("Copied proposal manifest does not match the local binding");
  }
  if (createHash("sha256").update(readFileSync(rawResponsePath)).digest("hex") !== proposal.rawResponseHash) {
    throw new Error("Copied raw response does not match the proposal");
  }
  if (!equalJson(proposal.after?.value, sections[binding.section])) {
    throw new Error("Local proposal task section differs from proposal.after.value");
  }
  return binding;
}

export function correctiveRerunLink(task, runPath) {
  const link = task.correctiveRerun;
  if (link === undefined) return null;
  if (!isPlainRecord(link) || link.schemaVersion !== CORRECTIVE_RERUN_SCHEMA) {
    throw new Error("Corrective rerun linkage is invalid");
  }
  if (typeof link.parentRunId !== "string" || basename(link.parentRunId) !== link.parentRunId || link.parentRunId === basename(runPath)) {
    throw new Error("Corrective rerun parent run ID is invalid");
  }
  if (typeof link.reason !== "string" || !link.reason.trim()) throw new Error("Corrective rerun reason is required");
  if (typeof link.parentTaskSha256 !== "string" || typeof link.parentManifestSha256 !== "string") {
    throw new Error("Corrective rerun must bind the original task and manifest digests");
  }
  const parentRunPath = resolve(dirname(runPath), link.parentRunId);
  const { manifest: parentManifest } = readManifest(parentRunPath);
  if (parentManifest.outcome !== "needs_review" || !parentManifest.finalizedAt) {
    throw new Error("Corrective rerun parent must be finalized as needs_review");
  }
  if (link.parentFinalizedAt !== parentManifest.finalizedAt) {
    throw new Error("Corrective rerun finalization timestamp does not match the parent");
  }
  if (sha256(taskPath(parentRunPath)) !== link.parentTaskSha256 || sha256(manifestPath(parentRunPath)) !== link.parentManifestSha256) {
    throw new Error("Corrective rerun parent artifacts changed after finalization");
  }
  return {
    schemaVersion: link.schemaVersion,
    supersedesRunId: link.parentRunId,
    reason: link.reason.trim(),
    parentFinalizedAt: link.parentFinalizedAt,
    parentTaskSha256: link.parentTaskSha256,
    parentManifestSha256: link.parentManifestSha256,
  };
}

export function assertManifestTaskIdentity(manifest, runPath) {
  const task = readJson(taskPath(runPath));
  if (task.taskId !== manifest.runId || task.article?.slug !== manifest.slug) {
    throw new Error("Current citation task identity does not match the initialized manifest");
  }
  const binding = assertLocalProposalTask(task, runPath);
  if (!equalJson(binding, manifest.inputBinding ?? null)) {
    throw new Error("Current local proposal binding does not match the initialized manifest");
  }
  if (!equalJson(correctiveRerunLink(task, runPath), manifest.supersession ?? null)) {
    throw new Error("Current corrective rerun linkage does not match the initialized manifest");
  }
  if (task.promotion?.allowed === false && manifest.promotionAllowed !== false) {
    throw new Error("Current task no-promotion policy does not match the initialized manifest");
  }
  if (!equalJson(normalizeTaskSelectedSections(task), manifest.selectedSections ?? null)) {
    throw new Error("Current task selectedSections do not match the initialized manifest");
  }
  return task;
}

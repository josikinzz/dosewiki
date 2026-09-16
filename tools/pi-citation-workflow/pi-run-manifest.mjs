#!/usr/bin/env node
/**
 * Pi-native audit controller for one existing DoseWiki citation-workbench run.
 * It writes only run-local manifest/log/archive files. It never edits Postgres,
 * the app repository, citation task content, or queue state.
 */

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

const CITABLE_SECTIONS = [
  "summary",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
];
const SECTION_STATUSES = new Set([
  "checked",
  "missing_preserve_original",
  "failed_preserve_original",
  // Terminal skip statuses for subsection-scoped runs (task.selectedSections).
  "skipped_already_cited",
  "skipped_empty",
  "not_selected",
]);
const SKIP_STATUSES = new Set(["skipped_already_cited", "skipped_empty", "not_selected"]);

function normalizeTaskSelectedSections(task) {
  const selected = task?.selectedSections;
  if (selected === undefined || selected === null) return null;
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new Error("citation-task.json selectedSections must be a non-empty array when present");
  }
  const seen = new Set();
  for (const section of selected) {
    if (!CITABLE_SECTIONS.includes(section)) {
      throw new Error(`citation-task.json selectedSections entry ${section} is not a citable section`);
    }
    if (seen.has(section)) {
      throw new Error(`citation-task.json selectedSections contains duplicate entry ${section}`);
    }
    seen.add(section);
  }
  return [...selected];
}

function skipStatusForReason(reason) {
  if (reason === "empty") return "skipped_empty";
  if (reason === "already_cited") return "skipped_already_cited";
  return "not_selected";
}
const GATES = [
  "preflight",
  "remap",
  "section_rechecks",
  "proactive_scan",
  "article_wide_packet",
  "article_wide_sanitize",
  "article_wide_residue_scan",
  "article_wide_check",
  "assemble_draft",
  "validate",
  "validate_patches",
  "final_review_surface_scan",
];
const RECONCILIATION_GATES = [
  "remap",
  "section_rechecks",
  "proactive_scan",
  "article_wide_packet",
  "article_wide_sanitize",
  "article_wide_residue_scan",
];
const GATE_PREREQUISITES = {
  preflight: [],
  remap: ["preflight", "all_sections_terminal"],
  section_rechecks: ["remap"],
  proactive_scan: ["section_rechecks"],
  article_wide_packet: ["proactive_scan"],
  article_wide_sanitize: ["article_wide_packet"],
  article_wide_residue_scan: ["article_wide_sanitize"],
  article_wide_check: ["article_wide_residue_scan"],
  assemble_draft: ["article_wide_check"],
  validate: ["assemble_draft"],
  validate_patches: ["validate"],
  final_review_surface_scan: ["validate_patches"],
};
const GATE_SCOPES = {
  preflight: ["task"],
  remap: ["task", "sections"],
  section_rechecks: ["task", "sections"],
  proactive_scan: ["task", "sections"],
  article_wide_packet: ["task", "sections", "articleWideInput"],
  article_wide_sanitize: ["task", "sections", "articleWideInput"],
  article_wide_residue_scan: ["task", "sections", "articleWideInput"],
  article_wide_check: ["task", "sections", "articleWideInput", "articleWide"],
  assemble_draft: ["task", "sections", "articleWideInput", "articleWide", "draft"],
  validate: ["task", "sections", "articleWideInput", "articleWide", "draft"],
  validate_patches: ["task", "sections", "articleWideInput", "articleWide", "draft"],
  final_review_surface_scan: ["articleWide", "draft", "report"],
};
const FORBIDDEN_PACKET_RESIDUE = [
  /rawCitation/i,
  /sectionRaw/i,
  /\[\[/,
  /<ref/i,
  /\{\{/,
  /wikipedia\.org\/wiki/i,
  /psychonautwiki\.org\/wiki/i,
];
const FORBIDDEN_FINAL_DISCOVERY_TERMS = [
  /\bwikipedia\b/gi,
  /\bpsychonaut\s*wiki\b/gi,
  /\btripsit\b/gi,
  /\bwiki\b/gi,
];
const PUBLIC_REVIEW_SURFACE_KEYS = new Set(["markedSections", "references", "evidence", "patches", "articlePatches"]);
const CORRECTIVE_RERUN_SCHEMA = "dosewiki_pi_citation_corrective_rerun_v1";
const MANIFEST_FILE = "pi-run-manifest.json";
const DISCOVERY_ONLY_STATUSES = new Set(["discovery_only", "candidate_discovery_only"]);
const WIKI_METADATA_KEYS = new Set([
  "id",
  "sourceid",
  "referenceid",
  "url",
  "sourceurl",
  "canonicalurl",
  "href",
  "title",
  "name",
  "displayname",
  "sourcename",
  "sitename",
  "publisher",
  "containertitle",
  "discoverysource",
  "source",
  "origin",
  "provider",
  "host",
  "catalog",
  "repository",
  "type",
  "contenttype",
  "kind",
  "sourcetype",
  "category",
  "platform",
  "channel",
]);
const WIKI_METADATA_VALUE = /(?:wikipedia|psychonautwiki|tripsit|(?:^|[^a-z])wiki(?:[^a-z]|$))/i;

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedMetadataKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function discoveryOnlyReason(record) {
  if (!isPlainRecord(record)) return null;
  if (record.discoveryOnly === true || record.discovery_only === true) return "record is marked discovery-only";
  for (const key of ["supportStatus", "support_status", "role"]) {
    if (typeof record[key] === "string" && DISCOVERY_ONLY_STATUSES.has(record[key].toLowerCase())) {
      return `${key} is discovery-only`;
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (!WIKI_METADATA_KEYS.has(normalizedMetadataKey(key)) || typeof value !== "string") continue;
    if (WIKI_METADATA_VALUE.test(value)) return `${key} identifies a discovery-only wiki`;
  }
  return null;
}

function sanitizeDiscoveryOnlyMetadata(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const sanitized = sanitizeDiscoveryOnlyMetadata(entry);
      return sanitized === undefined ? [] : [sanitized];
    });
  }
  if (!isPlainRecord(value)) return value;
  if (discoveryOnlyReason(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const sanitized = sanitizeDiscoveryOnlyMetadata(entry);
      return sanitized === undefined ? [] : [[key, sanitized]];
    }),
  );
}

function isDesignatedJsonProvenance(path, key) {
  return path === "$.metadata" && key === "discoveryProvenance";
}

function discoveryMetadataDiagnostics(value, path = "$", options = {}) {
  if (Array.isArray(value)) return value.flatMap((entry, index) => discoveryMetadataDiagnostics(entry, `${path}[${index}]`, options));
  if (!isPlainRecord(value)) return [];
  const reason = options.inDesignatedProvenance ? null : discoveryOnlyReason(value);
  if (reason) return [`${path}: ${reason}`];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (options.allowDesignatedProvenance && isDesignatedJsonProvenance(path, key)) {
      return discoveryMetadataDiagnostics(entry, `${path}.${key}`, { ...options, inDesignatedProvenance: true });
    }
    const inDesignatedProvenance = options.inDesignatedProvenance && !PUBLIC_REVIEW_SURFACE_KEYS.has(key);
    return discoveryMetadataDiagnostics(entry, `${path}.${key}`, { ...options, inDesignatedProvenance });
  });
}

function sanitizeArticleWideInput(runPath) {
  const path = resolve(runPath, "article-wide-input.json");
  if (!existsSync(path)) throw new Error(`Missing article-wide input: ${path}`);
  const packet = readJson(path);
  if (!isPlainRecord(packet)) throw new Error("article-wide-input.json must contain an object");
  const sanitized = sanitizeDiscoveryOnlyMetadata(packet);
  if (!isPlainRecord(sanitized)) throw new Error("Article-wide input cannot be entirely discovery-only metadata");
  const diagnostics = discoveryMetadataDiagnostics(sanitized);
  if (diagnostics.length > 0) {
    throw new Error(`Article-wide input retains discovery-only/wiki metadata: ${diagnostics.join("; ")}`);
  }
  const changed = JSON.stringify(packet) !== JSON.stringify(sanitized);
  if (changed) writeJsonAtomically(path, sanitized);
  return { changed, removed: changed ? "discovery-only/wiki metadata" : "none" };
}

function snippetAt(value, index) {
  return value.slice(Math.max(0, index - 36), Math.min(value.length, index + 84)).replace(/\s+/g, " ");
}

function forbiddenTermDiagnostics(value, path = "$", options = {}) {
  if (typeof value === "string") {
    if (options.inDesignatedProvenance) return [];
    return FORBIDDEN_FINAL_DISCOVERY_TERMS.flatMap((pattern) => {
      const matches = [...value.matchAll(pattern)];
      return matches.map((match) => `${path}: forbidden discovery/wiki term ${JSON.stringify(match[0])} near ${JSON.stringify(snippetAt(value, match.index ?? 0))}`);
    });
  }
  if (Array.isArray(value)) return value.flatMap((entry, index) => forbiddenTermDiagnostics(entry, `${path}[${index}]`, options));
  if (!isPlainRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (options.allowDesignatedProvenance && isDesignatedJsonProvenance(path, key)) {
      return forbiddenTermDiagnostics(entry, `${path}.${key}`, { ...options, inDesignatedProvenance: true });
    }
    const inDesignatedProvenance = options.inDesignatedProvenance && !PUBLIC_REVIEW_SURFACE_KEYS.has(key);
    const childOptions = { ...options, inDesignatedProvenance };
    return [
      ...forbiddenTermDiagnostics(key, `${path}.{key}`, childOptions),
      ...forbiddenTermDiagnostics(entry, `${path}.${key}`, childOptions),
    ];
  });
}

function markdownForbiddenTermDiagnostics(text) {
  const diagnostics = [];
  let inDesignatedProvenance = false;
  let designatedProvenanceSeen = false;
  for (const [index, line] of text.split("\n").entries()) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (inDesignatedProvenance && heading && heading[1].length <= 2) inDesignatedProvenance = false;
    if (!designatedProvenanceSeen && heading?.[1].length === 2 && heading[2] === "Discovery provenance") {
      designatedProvenanceSeen = true;
      inDesignatedProvenance = true;
      continue;
    }
    if (inDesignatedProvenance) continue;
    diagnostics.push(...FORBIDDEN_FINAL_DISCOVERY_TERMS.flatMap((pattern) => [...line.matchAll(pattern)].map((match) => (
      `line ${index + 1}: forbidden discovery/wiki term ${JSON.stringify(match[0])} near ${JSON.stringify(snippetAt(line, match.index ?? 0))}`
    ))));
  }
  return diagnostics;
}

function finalSurfaceDiagnostics(path, label) {
  if (!existsSync(path)) return [`Missing required final review surface ${label}: ${path}`];
  try {
    if (path.endsWith(".json")) {
      const value = readJson(path);
      return [
        ...discoveryMetadataDiagnostics(value, "$", { allowDesignatedProvenance: true }),
        ...forbiddenTermDiagnostics(value, "$", { allowDesignatedProvenance: true }),
      ];
    }
    return markdownForbiddenTermDiagnostics(readFileSync(path, "utf8"));
  } catch (error) {
    return [`Unable to scan ${label}: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function assertFinalSurfaceClean(path, label) {
  const diagnostics = finalSurfaceDiagnostics(path, label);
  if (diagnostics.length > 0) {
    throw new Error(`${label} contains forbidden discovery/wiki residue outside its designated provenance surface: ${diagnostics.join("; ")}`);
  }
}

function assertAllFinalReviewSurfacesClean(runPath) {
  const diagnostics = [
    [resolve(runPath, "article-wide.json"), "article-wide output"],
    [resolve(runPath, "citation-draft.json"), "citation draft"],
    [resolve(runPath, "citation-report.md"), "citation review report"],
  ].flatMap(([path, label]) => finalSurfaceDiagnostics(path, label).map((detail) => `${label}: ${detail}`));
  if (diagnostics.length > 0) {
    throw new Error(`Final local review surfaces contain forbidden discovery/wiki residue outside designated provenance surfaces: ${diagnostics.join("; ")}`);
  }
}

function assertManifestMutable(manifest) {
  if (manifest.outcome === "needs_review" || manifest.finalizedAt) {
    throw new Error("Cannot mutate a finalized manifest");
  }
}

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error(`Usage:
  pi-run-manifest.mjs init --run <workbench/runs/slug> [--slug <slug>]
  pi-run-manifest.mjs check-section --run <run> [--workbench <path>] --section <key> [--worker-id <id>] [--model <model>] [--artifact <path>]
  pi-run-manifest.mjs section --run <run> --section <key> --status <missing_preserve_original|failed_preserve_original> [--artifact <path>]
  pi-run-manifest.mjs run-gate --run <run> [--workbench <path>] --gate <gate>
  pi-run-manifest.mjs run-sequence --run <run> [--workbench <path>] [--from <gate> | --only <gate>]
  pi-run-manifest.mjs finalize --run <run>
  pi-run-manifest.mjs rerun --run <finalized-run> [--workbench <path>] --reason <corrective-reason> [--reuse-sections]
  pi-run-manifest.mjs show --run <run>`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) usage(`unexpected argument: ${arg}`);
    const [key, inline] = arg.slice(2).split("=", 2);
    if (!key) usage("empty flag name");
    if (inline !== undefined) {
      values[key] = inline;
      continue;
    }
    if (key === "reuse-sections") {
      values[key] = "true";
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) usage(`missing value for --${key}`);
    values[key] = value;
    index += 1;
  }
  return { command, values };
}

function requireValue(values, key) {
  const value = values[key];
  if (!value || !String(value).trim()) usage(`--${key} is required`);
  return String(value).trim();
}

function now() {
  return new Date().toISOString();
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJsonAtomically(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function textLength(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().length;
  if (Array.isArray(value)) return value.reduce((total, item) => total + textLength(item), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((total, item) => total + textLength(item), 0);
  return 0;
}

function taskPath(runPath) {
  return resolve(runPath, "citation-task.json");
}

function manifestPath(runPath) {
  return resolve(runPath, MANIFEST_FILE);
}

function pathForManifest(runPath, requestedPath) {
  if (!requestedPath) return null;
  const absolute = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(runPath, requestedPath);
  const rel = relative(runPath, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("artifact paths must remain inside the citation run directory");
  return rel || basename(absolute);
}

function resolveWorkbench(runPath, requestedPath) {
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

function runPathRelativeToWorkbench(workbench, runPath) {
  const runRelative = relative(workbench, runPath);
  if (runRelative.startsWith("..") || isAbsolute(runRelative)) throw new Error("Run path is outside the selected workbench");
  return runRelative;
}

function readManifest(runPath) {
  const path = manifestPath(runPath);
  if (!existsSync(path)) throw new Error(`Pi run manifest does not exist: ${path}. Run init first.`);
  const manifest = readJson(path);
  if (manifest.schemaVersion !== "dosewiki_pi_citation_run_v1") throw new Error(`Unsupported Pi run manifest schema at ${path}`);
  return { path, manifest };
}

function appendEvent(manifest, event) {
  manifest.events ??= [];
  manifest.events.push({ at: now(), ...event });
  manifest.updatedAt = now();
}

function allSectionsTerminal(manifest) {
  return CITABLE_SECTIONS.every((section) => SECTION_STATUSES.has(manifest.sections?.[section]?.status));
}

function fileDigest(path) {
  return existsSync(path) ? sha256(path) : null;
}

function sectionDigests(runPath) {
  const directory = resolve(runPath, "sections");
  if (!existsSync(directory)) return {};
  return Object.fromEntries(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => [`sections/${file}`, sha256(resolve(directory, file))]),
  );
}

function proposalInputDigests(runPath) {
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

function isLocalProposalTask(task) {
  return task?.inputBinding?.kind === "local_section_proposal" ||
    task?.provenance?.source === "local_section_proposal";
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertLocalProposalTask(task, runPath) {
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

function correctiveRerunLink(task, runPath) {
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

function assertManifestTaskIdentity(manifest, runPath) {
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

function snapshot(runPath, gate) {
  const scope = GATE_SCOPES[gate];
  if (!scope) throw new Error(`No snapshot scope configured for gate ${gate}`);
  const value = { proposalInput: proposalInputDigests(runPath) };
  if (scope.includes("task")) value.task = fileDigest(taskPath(runPath));
  if (scope.includes("sections")) value.sections = sectionDigests(runPath);
  if (scope.includes("articleWideInput")) value.articleWideInput = fileDigest(resolve(runPath, "article-wide-input.json"));
  if (scope.includes("articleWide")) value.articleWide = fileDigest(resolve(runPath, "article-wide.json"));
  if (scope.includes("draft")) value.draft = fileDigest(resolve(runPath, "citation-draft.json"));
  if (scope.includes("report")) value.report = fileDigest(resolve(runPath, "citation-report.md"));
  return value;
}

function snapshotsMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function gateIsFresh(manifest, runPath, gate) {
  const record = manifest.gates?.[gate];
  if (record?.result !== "passed") return false;
  try {
    if (!snapshotsMatch(record.snapshot, snapshot(runPath, gate))) return false;
  } catch {
    return false;
  }
  if ((GATE_PREREQUISITES[gate] ?? []).includes("all_sections_terminal") && !allSectionsTerminal(manifest)) return false;
  return true;
}

function minimumStaleReconciliationGate(manifest, runPath, fallback) {
  return RECONCILIATION_GATES.find((gate) => !gateIsFresh(manifest, runPath, gate)) ?? fallback;
}

function requirePassedPrerequisites(manifest, runPath, gate) {
  for (const prerequisite of GATE_PREREQUISITES[gate] ?? []) {
    if (prerequisite === "all_sections_terminal") {
      if (!allSectionsTerminal(manifest)) throw new Error(`Cannot run ${gate} until all six citable sections have terminal statuses`);
      continue;
    }
    const record = manifest.gates?.[prerequisite];
    if (record?.result !== "passed") throw new Error(`Cannot run ${gate} until ${prerequisite} has passed`);
    if (!snapshotsMatch(record.snapshot, snapshot(runPath, prerequisite))) {
      throw new Error(`Cannot run ${gate}: run artifacts changed after ${prerequisite}; rerun the affected gate sequence`);
    }
  }
}

function assertOnlyCheckedSectionArtifacts(manifest, runPath) {
  const expected = new Set(
    CITABLE_SECTIONS
      .filter((section) => manifest.sections?.[section]?.status === "checked")
      .map((section) => manifest.sections[section].artifact),
  );
  const actual = new Set(Object.keys(sectionDigests(runPath)));
  const unexpected = [...actual].filter((path) => !expected.has(path));
  if (unexpected.length > 0) {
    throw new Error(`Unaccepted section artifacts remain in sections/: ${unexpected.join(", ")}. Archive failed candidates before reconciliation.`);
  }
}

function gateLogPath(runPath, name) {
  const directory = resolve(runPath, "pi-gates");
  mkdirSync(directory, { recursive: true });
  return resolve(directory, `${name}.log`);
}

function writeGateLog(runPath, name, record) {
  const path = gateLogPath(runPath, name);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return pathForManifest(runPath, path);
}

function invoke({ workbench, executable, args }) {
  const result = spawnSync(executable, args, { cwd: workbench, encoding: "utf8" });
  const exitCode = typeof result.status === "number" ? result.status : 1;
  return {
    command: [executable, ...args],
    cwd: workbench,
    exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

function commandForGate({ gate, workbench, runPath }) {
  const run = runPathRelativeToWorkbench(workbench, runPath);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  if (gate === "preflight") return { executable: npm, args: ["run", "preflight", "--", "--run", run] };
  if (gate === "remap") return { executable: process.execPath, args: ["scripts/remap-section-reference-ids.mjs", "--run", run, "--write"] };
  if (gate === "proactive_scan") return { executable: process.execPath, args: ["scripts/proactive-scan.mjs", "--run", run] };
  if (gate === "article_wide_packet") return { executable: npm, args: ["run", "article-wide:packet", "--", "--run", run] };
  if (gate === "article_wide_sanitize") return { executable: npm, args: ["run", "article-wide:sanitize", "--", "--run", run] };
  if (gate === "article_wide_check") return { executable: npm, args: ["run", "check:worker-output", "--", "--run", run, "--article-wide"] };
  if (gate === "assemble_draft") return { executable: process.execPath, args: ["scripts/assemble-draft.mjs", "--run", run] };
  if (gate === "validate") return { executable: npm, args: ["run", "validate", "--", "--run", run] };
  if (gate === "validate_patches") return { executable: npm, args: ["run", "validate:patches", "--", "--run", run] };
  return null;
}

function runSectionCheck({ workbench, runPath, section }) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return invoke({
    workbench,
    executable: npm,
    args: ["run", "check:worker-output", "--", "--run", runPathRelativeToWorkbench(workbench, runPath), "--section", section],
  });
}

function residueScan(runPath) {
  const packet = resolve(runPath, "article-wide-input.json");
  if (!existsSync(packet)) return { command: ["residue-scan", "article-wide-input.json"], exitCode: 1, stdout: "", stderr: `Missing ${packet}`, error: null };
  const text = readFileSync(packet, "utf8");
  const matches = FORBIDDEN_PACKET_RESIDUE.filter((pattern) => pattern.test(text)).map((pattern) => pattern.toString());
  const metadataDiagnostics = discoveryMetadataDiagnostics(readJson(packet));
  return {
    command: ["residue-scan", "article-wide-input.json"],
    exitCode: matches.length === 0 && metadataDiagnostics.length === 0 ? 0 : 1,
    stdout: matches.length === 0 && metadataDiagnostics.length === 0 ? "No forbidden article-wide packet residue found.\n" : "",
    stderr: [
      matches.length > 0 ? `Forbidden article-wide packet residue: ${matches.join(", ")}` : null,
      metadataDiagnostics.length > 0 ? `Discovery-only/wiki metadata: ${metadataDiagnostics.join("; ")}` : null,
    ].filter(Boolean).join("\n"),
    error: null,
  };
}

function hardenGateResult({ gate, runPath, result }) {
  if (result.exitCode !== 0) return result;
  try {
    if (gate === "article_wide_sanitize") {
      const sanitized = sanitizeArticleWideInput(runPath);
      result.stdout += `Pi metadata sanitation: removed ${sanitized.removed}.\n`;
    }
    if (gate === "article_wide_check") {
      assertFinalSurfaceClean(resolve(runPath, "article-wide.json"), "article-wide output");
    }
    if (gate === "assemble_draft") {
      assertFinalSurfaceClean(resolve(runPath, "citation-draft.json"), "citation draft");
    }
    if (gate === "final_review_surface_scan") {
      assertAllFinalReviewSurfacesClean(runPath);
    }
    return result;
  } catch (error) {
    return {
      ...result,
      exitCode: 1,
      stderr: [result.stderr, error instanceof Error ? error.message : String(error)].filter(Boolean).join("\n"),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function commandInit(values) {
  const runPath = resolve(requireValue(values, "run"));
  const packetPath = taskPath(runPath);
  if (!existsSync(packetPath)) throw new Error(`Citation task packet does not exist: ${packetPath}`);
  const task = readJson(packetPath);
  const runId = task.taskId;
  const actualSlug = task.article?.slug;
  const requestedSlug = values.slug?.trim();
  if (!runId || typeof runId !== "string") throw new Error("citation-task.json does not contain taskId");
  if (!actualSlug || typeof actualSlug !== "string") throw new Error("citation-task.json does not contain article.slug");
  if (requestedSlug && requestedSlug !== actualSlug) throw new Error(`Explicit slug ${requestedSlug} does not match task slug ${actualSlug}`);
  if (basename(runPath) !== runId) throw new Error(`Run directory name ${basename(runPath)} does not match taskId ${runId}`);
  if (existsSync(manifestPath(runPath))) throw new Error(`Pi run manifest already exists: ${manifestPath(runPath)}. Use show/check-section/section/run-gate/finalize instead.`);
  const localBinding = assertLocalProposalTask(task, runPath);
  const supersession = correctiveRerunLink(task, runPath);

  const citableSections = task.article?.citableSections;
  if (!citableSections || typeof citableSections !== "object" || Array.isArray(citableSections)) throw new Error("citation-task.json is missing article.citableSections");
  const sectionStats = Object.fromEntries(CITABLE_SECTIONS.map((section) => [section, { chars: textLength(citableSections[section]), status: null }]));
  const nonEmptySections = CITABLE_SECTIONS.filter((section) => sectionStats[section].chars > 0);
  if (nonEmptySections.length === 0) throw new Error("The citable surface is empty. Re-export/fresh-run the task before initializing Pi orchestration.");

  const selectedSections = normalizeTaskSelectedSections(task);
  if (selectedSections) {
    const scopeSections = task.sectionScope?.sections ?? {};
    for (const section of selectedSections) {
      if (sectionStats[section].chars === 0) {
        throw new Error(`Selected section ${section} is empty in the task citable surface; re-export the task or narrow selectedSections`);
      }
    }
    for (const section of CITABLE_SECTIONS) {
      if (selectedSections.includes(section)) continue;
      const skipReason = scopeSections[section]?.skipReason ?? (sectionStats[section].chars === 0 ? "empty" : "not_selected");
      sectionStats[section] = {
        ...sectionStats[section],
        status: skipStatusForReason(skipReason),
        skipReason,
        recordedAt: now(),
      };
    }
  }

  const manifest = {
    schemaVersion: "dosewiki_pi_citation_run_v1",
    runId,
    slug: actualSlug,
    taskPath: "citation-task.json",
    taskSha256: sha256(packetPath),
    taskProvenance: task.provenance ?? null,
    inputBinding: localBinding,
    supersession,
    promotionAllowed: task.promotion?.allowed !== false,
    allowLiveWebResearch: task.allowLiveWebResearch === true,
    createdAt: now(),
    updatedAt: now(),
    outcome: "prepared",
    nonEmptySections,
    selectedSections,
    sections: sectionStats,
    gates: {},
    events: [
      { at: now(), type: "initialized", runId, slug: actualSlug, nonEmptySections, selectedSections, allowLiveWebResearch: task.allowLiveWebResearch === true, promotionAllowed: task.promotion?.allowed !== false },
      ...(supersession ? [{ at: now(), type: "corrective_rerun_prepared", ...supersession }] : []),
    ],
  };
  writeJsonAtomically(manifestPath(runPath), manifest);
  if (!values.quiet) console.log(JSON.stringify(manifest, null, 2));
}

function commandCheckSection(values) {
  const runPath = resolve(requireValue(values, "run"));
  const section = requireValue(values, "section");
  if (!CITABLE_SECTIONS.includes(section)) throw new Error(`Unknown citable section: ${section}`);
  const { path, manifest } = readManifest(runPath);
  assertManifestMutable(manifest);
  const preflight = manifest.gates?.preflight;
  if (preflight?.result !== "passed" || !snapshotsMatch(preflight.snapshot, snapshot(runPath, "preflight"))) {
    throw new Error("Cannot check a section until the current task passes preflight");
  }
  if (manifest.sections[section].chars === 0) throw new Error(`${section} is empty; record missing_preserve_original instead of checking an output`);
  if (manifest.selectedSections && !manifest.selectedSections.includes(section)) {
    throw new Error(`${section} is not in this run's selectedSections; a worker must not return output for a non-selected section`);
  }
  const workbench = resolveWorkbench(runPath, values.workbench);
  const artifact = pathForManifest(runPath, values.artifact?.trim() || `sections/${section}.json`);
  if (!artifact || !existsSync(resolve(runPath, artifact))) throw new Error(`Section artifact does not exist: ${artifact ?? `sections/${section}.json`}`);
  const result = runSectionCheck({ workbench, runPath, section });
  const log = writeGateLog(runPath, `section-${section}-check`, result);
  if (result.exitCode !== 0) {
    appendEvent(manifest, { type: "section_check_failed", section, artifact, log });
    writeJsonAtomically(path, manifest);
    process.stderr.write(`${result.stderr || result.stdout}\n`);
    throw new Error(`Section checker failed for ${section}; archive it as failed_preserve_original before continuing`);
  }
  const workerId = values["worker-id"]?.trim() || null;
  const model = values.model?.trim() || null;
  manifest.sections[section] = { ...manifest.sections[section], status: "checked", workerId, model, artifact, artifactSha256: sha256(resolve(runPath, artifact)), checkLog: log, recordedAt: now() };
  appendEvent(manifest, { type: "section_checked", section, workerId, model, artifact, log });
  writeJsonAtomically(path, manifest);
  console.log(JSON.stringify(manifest.sections[section], null, 2));
}

function commandSection(values) {
  const runPath = resolve(requireValue(values, "run"));
  const section = requireValue(values, "section");
  const status = requireValue(values, "status");
  if (!CITABLE_SECTIONS.includes(section)) throw new Error(`Unknown citable section: ${section}`);
  if (!["missing_preserve_original", "failed_preserve_original"].includes(status)) throw new Error("Use check-section for checked output; section supports only missing_preserve_original or failed_preserve_original");
  const { path, manifest } = readManifest(runPath);
  assertManifestMutable(manifest);
  const requestedArtifact = pathForManifest(runPath, values.artifact?.trim());
  if (status === "missing_preserve_original" && requestedArtifact) throw new Error("A missing section must not have an artifact");
  let artifact = null;
  if (requestedArtifact) {
    const source = resolve(runPath, requestedArtifact);
    if (!existsSync(source)) throw new Error(`Recorded artifact does not exist inside this run: ${requestedArtifact}`);
    const archiveDir = resolve(runPath, "failed-sections");
    mkdirSync(archiveDir, { recursive: true });
    const archive = resolve(archiveDir, `${section}-${Date.now()}.json`);
    renameSync(source, archive);
    artifact = pathForManifest(runPath, archive);
  }
  manifest.sections[section] = { ...manifest.sections[section], status, artifact, artifactSha256: artifact ? sha256(resolve(runPath, artifact)) : null, recordedAt: now() };
  appendEvent(manifest, { type: "section_preserved", section, status, artifact });
  writeJsonAtomically(path, manifest);
  console.log(JSON.stringify(manifest.sections[section], null, 2));
}

function commandRunGate(values) {
  const runPath = resolve(requireValue(values, "run"));
  const gate = requireValue(values, "gate");
  if (!GATES.includes(gate)) throw new Error(`Unknown deterministic gate: ${gate}`);
  const { path, manifest } = readManifest(runPath);
  assertManifestMutable(manifest);
  if (gate === "preflight") assertManifestTaskIdentity(manifest, runPath);
  requirePassedPrerequisites(manifest, runPath, gate);
  if (gate !== "preflight") assertManifestTaskIdentity(manifest, runPath);
  if (gate === "remap" || gate === "article_wide_packet") {
    assertOnlyCheckedSectionArtifacts(manifest, runPath);
  }
  const workbench = resolveWorkbench(runPath, values.workbench);

  let result;
  if (gate === "section_rechecks") {
    const checked = CITABLE_SECTIONS.filter((section) => manifest.sections?.[section]?.status === "checked");
    const results = checked.map((section) => ({ section, ...runSectionCheck({ workbench, runPath, section }) }));
    for (const entry of results) {
      if (entry.exitCode === 0) manifest.sections[entry.section] = { ...manifest.sections[entry.section], artifactSha256: sha256(resolve(runPath, manifest.sections[entry.section].artifact)), recheckedAt: now() };
    }
    result = {
      command: ["section-rechecks", ...checked],
      cwd: workbench,
      exitCode: results.every((entry) => entry.exitCode === 0) ? 0 : 1,
      stdout: results.map((entry) => `# ${entry.section}\n${entry.stdout}`).join("\n"),
      stderr: results.map((entry) => `# ${entry.section}\n${entry.stderr}`).join("\n"),
      error: null,
    };
  } else if (gate === "article_wide_residue_scan") {
    result = residueScan(runPath);
  } else if (gate === "final_review_surface_scan") {
    result = {
      command: ["final-review-surface-scan", "article-wide.json", "citation-draft.json", "citation-report.md"],
      cwd: workbench,
      exitCode: 0,
      stdout: "Scanning final local review surfaces for forbidden discovery/wiki residue.\n",
      stderr: "",
      error: null,
    };
  } else if (gate === "article_wide_check") {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const run = runPathRelativeToWorkbench(workbench, runPath);
    const normalization = invoke({
      workbench,
      executable: npm,
      args: ["run", "normalize:discovery-provenance", "--", "--run", run],
    });
    const check = normalization.exitCode === 0
      ? invoke({
          workbench,
          executable: npm,
          args: ["run", "check:worker-output", "--", "--run", run, "--article-wide"],
        })
      : { command: [], cwd: workbench, exitCode: 1, stdout: "", stderr: "Article-wide check skipped because provenance normalization failed.", error: null };
    result = {
      command: ["article-wide-normalize-and-check", ...normalization.command, "&&", ...check.command],
      cwd: workbench,
      exitCode: normalization.exitCode === 0 && check.exitCode === 0 ? 0 : 1,
      stdout: `# provenance normalization\n${normalization.stdout}\n# worker output check\n${check.stdout}`,
      stderr: `# provenance normalization\n${normalization.stderr}\n# worker output check\n${check.stderr}`,
      error: normalization.error ?? check.error,
    };
  } else {
    const command = commandForGate({ gate, workbench, runPath });
    if (!command) throw new Error(`No command configured for gate ${gate}`);
    result = invoke({ workbench, ...command });
  }

  result = hardenGateResult({ gate, runPath, result });
  const log = writeGateLog(runPath, gate, result);
  const record = { result: result.exitCode === 0 ? "passed" : "failed", command: result.command, cwd: result.cwd, log, snapshot: snapshot(runPath, gate), recordedAt: now() };
  manifest.gates[gate] = record;
  appendEvent(manifest, { type: "gate", gate, result: record.result, log });
  writeJsonAtomically(path, manifest);
  if (record.result !== "passed") {
    process.stderr.write(`${result.stderr || result.stdout}\n`);
    throw new Error(`Deterministic gate failed: ${gate}`);
  }
  if (!values.quiet) console.log(JSON.stringify(record, null, 2));
  return record;
}

function commandRunSequence(values) {
  const runPath = resolve(requireValue(values, "run"));
  const from = values.from?.trim();
  const only = values.only?.trim();
  if (from && only) throw new Error("run-sequence accepts either --from or --only, not both");
  for (const [flag, gate] of [["from", from], ["only", only]]) {
    if (gate && !RECONCILIATION_GATES.includes(gate)) {
      throw new Error(`--${flag} must name a reconciliation gate: ${RECONCILIATION_GATES.join(", ")}`);
    }
  }
  const selected = only
    ? [only]
    : RECONCILIATION_GATES.slice(from ? RECONCILIATION_GATES.indexOf(from) : 0);
  const workbench = resolveWorkbench(runPath, values.workbench);
  const { manifest: startingManifest } = readManifest(runPath);
  assertManifestMutable(startingManifest);
  assertManifestTaskIdentity(startingManifest, runPath);
  if (!allSectionsTerminal(startingManifest)) {
    throw new Error("run-sequence requires terminal statuses for all six citable sections");
  }
  assertOnlyCheckedSectionArtifacts(startingManifest, runPath);
  const report = [];

  for (const gate of selected) {
    const { manifest } = readManifest(runPath);
    assertManifestMutable(manifest);
    if (gateIsFresh(manifest, runPath, gate)) {
      report.push({ gate, result: "fresh, skipped" });
      continue;
    }
    try {
      commandRunGate({ run: runPath, workbench, gate, quiet: "true" });
      report.push({ gate, result: "passed" });
    } catch (error) {
      const { manifest: failedManifest } = readManifest(runPath);
      const rerunFrom = minimumStaleReconciliationGate(failedManifest, runPath, gate);
      const sequenceCommand = `pi-run-manifest.mjs run-sequence --run ${JSON.stringify(runPath)} --workbench ${JSON.stringify(workbench)} --from ${rerunFrom}`;
      const minimumSequence = gateIsFresh(failedManifest, runPath, "preflight")
        ? sequenceCommand
        : `pi-run-manifest.mjs run-gate --run ${JSON.stringify(runPath)} --workbench ${JSON.stringify(workbench)} --gate preflight && ${sequenceCommand}`;
      throw new Error(`run-sequence stopped at ${gate}: ${error instanceof Error ? error.message : String(error)}. Minimum safe sequence after repair: ${minimumSequence}`);
    }
  }

  console.log(JSON.stringify({ outcome: "reconciliation_sequence_complete", runPath, gates: report }, null, 2));
}

function commandFinalize(values) {
  const runPath = resolve(requireValue(values, "run"));
  const { path, manifest } = readManifest(runPath);
  if (manifest.outcome === "needs_review" || manifest.finalizedAt) throw new Error("Manifest is already finalized as needs_review");
  const unfinished = CITABLE_SECTIONS.filter((section) => !SECTION_STATUSES.has(manifest.sections?.[section]?.status));
  if (unfinished.length > 0) throw new Error(`All six citable sections need a terminal status before finalization: ${unfinished.join(", ")}`);
  const incomplete = GATES.filter((gate) => manifest.gates?.[gate]?.result !== "passed");
  if (incomplete.length > 0) throw new Error(`Cannot finalize until deterministic gates pass: ${incomplete.join(", ")}`);
  const validationGate = manifest.gates.validate_patches;
  if (!snapshotsMatch(validationGate.snapshot, snapshot(runPath, "validate_patches"))) {
    throw new Error("Run artifacts changed after validate_patches; rerun the affected gate sequence before finalization");
  }
  const finalGate = manifest.gates.final_review_surface_scan;
  if (!snapshotsMatch(finalGate.snapshot, snapshot(runPath, "final_review_surface_scan"))) {
    throw new Error("Final review surfaces changed after their residue scan; rerun final_review_surface_scan before finalization");
  }
  assertAllFinalReviewSurfacesClean(runPath);
  const draft = resolve(runPath, "citation-draft.json");
  if (!existsSync(draft) || statSync(draft).size === 0) throw new Error(`A nonempty citation draft is required before finalization: ${draft}`);
  const task = readJson(taskPath(runPath));
  const localBinding = assertLocalProposalTask(task, runPath);
  if (localBinding || manifest.selectedSections) {
    const draftValue = readJson(draft);
    if (localBinding) {
      if (!equalJson(manifest.inputBinding, localBinding) || !equalJson(draftValue.inputBinding, localBinding)) {
        throw new Error("Local proposal task, manifest, and draft bindings must match at finalization");
      }
      if (!equalJson(draftValue.provenance, task.provenance) || !equalJson(draftValue.promotion, task.promotion)) {
        throw new Error("Local proposal draft provenance/promotion does not match the task");
      }
      manifest.promotionAllowed = false;
    }
    if (manifest.selectedSections && !equalJson(draftValue.selectedSections ?? null, manifest.selectedSections)) {
      throw new Error("Scoped citation draft selectedSections do not match the initialized manifest");
    }
  }
  manifest.outcome = "needs_review";
  manifest.finalizedAt = now();
  appendEvent(manifest, { type: "finalized", outcome: "needs_review", draft: "citation-draft.json", promotionAllowed: manifest.promotionAllowed });
  writeJsonAtomically(path, manifest);
  console.log(JSON.stringify({ outcome: manifest.outcome, manifest: path, draft }, null, 2));
}

function copyProposalInputsForRerun(parentRunPath, rerunPath) {
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

function reserveCorrectiveRerunDirectory(workbench, parentRunId) {
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

function reuseAcceptedSections(parentRunPath, rerunPath, parentManifest) {
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

function commandRerun(values) {
  const parentRunPath = resolve(requireValue(values, "run"));
  const reason = requireValue(values, "reason");
  const workbench = resolveWorkbench(parentRunPath, values.workbench);
  const { manifest: parentManifest } = readManifest(parentRunPath);
  if (parentManifest.outcome !== "needs_review" || !parentManifest.finalizedAt) {
    throw new Error("Only a finalized needs_review run may be corrected; do not mutate an existing run");
  }
  assertManifestTaskIdentity(parentManifest, parentRunPath);
  const parentTask = readJson(taskPath(parentRunPath));
  const { runId, runPath } = reserveCorrectiveRerunDirectory(workbench, basename(parentRunPath));
  const correctiveRerun = {
    schemaVersion: CORRECTIVE_RERUN_SCHEMA,
    parentRunId: basename(parentRunPath),
    parentFinalizedAt: parentManifest.finalizedAt,
    parentTaskSha256: sha256(taskPath(parentRunPath)),
    parentManifestSha256: sha256(manifestPath(parentRunPath)),
    reason,
    createdAt: now(),
  };
  const task = structuredClone(parentTask);
  task.taskId = runId;
  task.correctiveRerun = correctiveRerun;
  let sectionReuse = { reused: [], notReused: [] };
  try {
    copyProposalInputsForRerun(parentRunPath, runPath);
    writeFileSync(taskPath(runPath), `${JSON.stringify(task, null, 2)}\n`, { encoding: "utf8", mode: 0o444 });
    chmodSync(taskPath(runPath), 0o444);
    commandInit({ run: runPath, slug: parentManifest.slug, quiet: "true" });
    if (values["reuse-sections"] === "true") {
      sectionReuse = reuseAcceptedSections(parentRunPath, runPath, parentManifest);
    }
  } catch (error) {
    rmSync(runPath, { recursive: true, force: true });
    throw error;
  }
  console.log(JSON.stringify({
    outcome: "prepared_corrective_rerun",
    runId,
    runPath,
    supersedesRunId: correctiveRerun.parentRunId,
    reason,
    reusedSections: sectionReuse.reused,
    sectionsNotReused: sectionReuse.notReused,
  }, null, 2));
}

function commandShow(values) {
  const runPath = resolve(requireValue(values, "run"));
  const { manifest } = readManifest(runPath);
  console.log(JSON.stringify(manifest, null, 2));
}

try {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (!command) usage();
  if (command === "init") commandInit(values);
  else if (command === "check-section") commandCheckSection(values);
  else if (command === "section") commandSection(values);
  else if (command === "run-gate") commandRunGate(values);
  else if (command === "run-sequence") commandRunSequence(values);
  else if (command === "finalize") commandFinalize(values);
  else if (command === "rerun") commandRerun(values);
  else if (command === "show") commandShow(values);
  else usage(`unknown command: ${command}`);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

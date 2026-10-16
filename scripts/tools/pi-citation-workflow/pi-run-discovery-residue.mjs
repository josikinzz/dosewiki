import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isPlainRecord, readJson, writeJsonAtomically } from "./pi-run-files.mjs";

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

export function assertAllFinalReviewSurfacesClean(runPath) {
  const diagnostics = [
    [resolve(runPath, "article-wide.json"), "article-wide output"],
    [resolve(runPath, "citation-draft.json"), "citation draft"],
    [resolve(runPath, "citation-report.md"), "citation review report"],
  ].flatMap(([path, label]) => finalSurfaceDiagnostics(path, label).map((detail) => `${label}: ${detail}`));
  if (diagnostics.length > 0) {
    throw new Error(`Final local review surfaces contain forbidden discovery/wiki residue outside designated provenance surfaces: ${diagnostics.join("; ")}`);
  }
}

export function residueScan(runPath) {
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

export function hardenGateResult({ gate, runPath, result }) {
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

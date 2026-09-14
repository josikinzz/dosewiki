import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { findRepoRoot } from "./data-ops-run-context.mjs";

function isoTimestamp() {
  return new Date().toISOString();
}

function buildAuditFilename(operation, slug) {
  const ts = isoTimestamp().replace(/[:.]/g, "-");
  const safeName = [operation, slug].filter(Boolean).join("-").replace(/[^a-z0-9_-]/gi, "_");
  return `${ts}-${safeName}.json`;
}

/**
 * Write a new audit log entry for a data operation.
 *
 * @param {object} options
 * @param {string} options.operation - Name of the data operation.
 * @param {string} options.intent - Admin intent used for the operation.
 * @param {string} [options.slug] - Optional article/entity slug.
 * @param {Array} [options.mutations] - List of mutation details (fields, changes, etc.).
 * @param {string} [options.logDir] - Directory to write the log file. Defaults to `scripts/data/audit-logs`.
 * @param {string} [options.repoRoot] - Repository root for resolving default logDir.
 * @returns {{ path: string, entry: object }} The path to the audit log and the entry written.
 */
export function writeAuditLog({
  operation,
  intent,
  slug = null,
  mutations = [],
  logDir = null,
  repoRoot = findRepoRoot(),
} = {}) {
  if (!operation) {
    throw new Error("writeAuditLog: operation is required");
  }

  const resolvedLogDir = logDir ?? resolve(repoRoot, "scripts", "data", "audit-logs");
  if (!existsSync(resolvedLogDir)) {
    mkdirSync(resolvedLogDir, { recursive: true });
  }

  const entry = {
    timestamp: isoTimestamp(),
    operation,
    intent: intent ?? null,
    slug: slug ?? null,
    mutations,
  };

  const filename = buildAuditFilename(operation, slug);
  const outputPath = resolve(resolvedLogDir, filename);
  writeFileSync(outputPath, JSON.stringify(entry, null, 2) + "\n");

  return { path: outputPath, entry };
}

/**
 * Update an existing audit log file with additional fields.
 *
 * @param {string} path - Absolute path to the existing audit log.
 * @param {object} updates - Key-value pairs to merge into the existing entry.
 * @returns {object} The updated audit entry.
 */
export function updateAuditLog(path, updates = {}) {
  if (!path || !existsSync(path)) {
    throw new Error(`updateAuditLog: audit log not found at ${path}`);
  }

  const existing = JSON.parse(readFileSync(path, "utf-8"));
  const updated = {
    ...existing,
    ...updates,
    updatedAt: isoTimestamp(),
  };

  writeFileSync(path, JSON.stringify(updated, null, 2) + "\n");
  return updated;
}

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

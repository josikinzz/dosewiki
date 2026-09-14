#!/usr/bin/env node

import { readdirSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";
import {
  collectArtifactLineageWarnings,
  validateArtifactLineageManifest,
} from "../lib/data-artifact-lineage.mjs";
import {
  directCleanupPolicies,
  dsStorePolicy,
  isProtectedLocalArtifactPath,
  retiredEmptyDirectoryPolicies,
} from "../lib/local-artifact-hygiene-policy.mjs";

function exists(pathname) {
  try {
    statSync(pathname);
    return true;
  } catch {
    return false;
  }
}

export function formatPath(pathname, { rootDir = process.cwd() } = {}) {
  return relative(rootDir, pathname) || ".";
}

export function walkForDsStore(dir, { rootDir = process.cwd(), matches = [] } = {}) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return matches;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = formatPath(fullPath, { rootDir });

    if (entry.isDirectory()) {
      if (isProtectedLocalArtifactPath(relativePath)) {
        continue;
      }
      walkForDsStore(fullPath, { rootDir, matches });
      continue;
    }

    if (entry.isFile() && entry.name === ".DS_Store") {
      matches.push(fullPath);
    }
  }

  return matches;
}

export function collectTargets({ rootDir = process.cwd() } = {}) {
  const targets = [];

  for (const policy of directCleanupPolicies()) {
    const absolutePath = resolve(rootDir, policy.path);
    if (exists(absolutePath)) {
      targets.push({ path: absolutePath, reason: policy.reason, policy });
    }
  }

  const metadataPolicy = dsStorePolicy();
  for (const pathname of walkForDsStore(rootDir, { rootDir })) {
    targets.push({ path: pathname, reason: metadataPolicy.reason, policy: metadataPolicy });
  }

  for (const policy of retiredEmptyDirectoryPolicies()) {
    const absolutePath = resolve(rootDir, policy.path);
    if (isEmptyDirectory(absolutePath)) {
      targets.push({ path: absolutePath, reason: policy.reason, policy });
    }
  }

  return targets.sort((left, right) => (
    formatPath(left.path, { rootDir }).localeCompare(formatPath(right.path, { rootDir }))
  ));
}

function isEmptyDirectory(pathname) {
  try {
    const stats = statSync(pathname);
    return stats.isDirectory() && readdirSync(pathname).length === 0;
  } catch {
    return false;
  }
}

export function removeEmptyDirectory(pathname) {
  try {
    const entries = readdirSync(pathname);
    if (entries.length === 0) {
      rmSync(pathname, { recursive: false });
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function printTargets(targets, { rootDir = process.cwd(), logger = console } = {}) {
  if (targets.length === 0) {
    logger.log("No approved local artifacts found.");
    return;
  }

  logger.log(`${targets.length} approved local artifact path(s) found:`);
  for (const target of targets) {
    logger.log(`- ${formatPath(target.path, { rootDir })} (${target.reason})`);
  }
}

export function cleanTargets(targets, { rootDir = process.cwd() } = {}) {
  for (const target of targets) {
    if (isProtectedLocalArtifactPath(formatPath(target.path, { rootDir }))) {
      continue;
    }
    rmSync(target.path, { force: true, recursive: true });
  }
}

export function cleanRetiredEmptyDirectories({ rootDir = process.cwd() } = {}) {
  for (const policy of retiredEmptyDirectoryPolicies()) {
    removeEmptyDirectory(resolve(rootDir, policy.path));
  }
}

export function runHygiene({
  rootDir = process.cwd(),
  shouldClean = false,
  logger = console,
  validateLineage = true,
} = {}) {
  const targets = collectTargets({ rootDir });
  const lineageErrors = validateLineage ? validateArtifactLineageManifest({ rootDir }) : [];
  const lineageWarnings = validateLineage ? collectArtifactLineageWarnings({ rootDir }) : [];

  if (lineageErrors.length > 0) {
    logger.log(`${lineageErrors.length} data artifact lineage manifest issue(s) found:`);
    for (const error of lineageErrors) {
      logger.log(`- ${error}`);
    }
    logger.log("");
  }

  if (lineageWarnings.length > 0) {
    logger.log(`${lineageWarnings.length} data artifact lineage warning(s) found:`);
    for (const warning of lineageWarnings) {
      logger.log(`- ${warning}`);
    }
    logger.log("");
  }

  printTargets(targets, { rootDir, logger });

  if (!shouldClean) {
    logger.log("\nRun `npm run hygiene:clean` to remove these approved artifacts.");
    return;
  }

  cleanTargets(targets, { rootDir });
  cleanRetiredEmptyDirectories({ rootDir });

  logger.log("\nLocal artifact cleanup complete.");
}

function main() {
  const args = new Set(process.argv.slice(2));
  runHygiene({ shouldClean: args.has("--clean") });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { evaluateGeneratedExportRetention } from "./local-artifact-hygiene-policy.mjs";

export const ARTIFACT_LINEAGE_MANIFEST_PATH = "data/lineage.json";
export const ARTIFACT_LINEAGE_RUN_DIR = "data/.lineage";
const ARTIFACT_LINEAGE_DOC_PATHS = ["README.md", "AGENTS.md", "scripts/README.md"]
const REFERENCES_ERA_SUBSTANCE_SCHEMA_PATH = "src/schema/substance.schema.ts";
const REFERENCES_ERA_BACKUP_ARTIFACT_IDS = new Set(["substance-index-export", "substance-index-backups"]);

function toRelativePath(pathname, rootDir) {
  const absolutePath = isAbsolute(pathname) ? pathname : resolve(rootDir, pathname);
  return relative(rootDir, absolutePath).replaceAll("\\", "/");
}

function matchesArtifactPath(entry, artifactPath) {
  if (entry.path === artifactPath) {
    return true;
  }

  if (!entry.path.includes("*")) {
    return false;
  }

  const escaped = entry.path
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${escaped}$`).test(artifactPath);
}

function pathPatternToRegex(pathPattern) {
  const escaped = pathPattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${escaped}$`);
}

function walkFiles(dir, matches = []) {
  if (!existsSync(dir)) {
    return matches;
  }

  const stats = statSync(dir);
  if (stats.isFile()) {
    matches.push(dir);
    return matches;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matches);
    } else if (entry.isFile()) {
      matches.push(fullPath);
    }
  }

  return matches;
}

export function listArtifactLineagePathMatches(pathPattern, { rootDir = process.cwd() } = {}) {
  const relativePattern = toRelativePath(pathPattern, rootDir);

  if (!relativePattern.includes("*")) {
    const absolutePath = resolve(rootDir, relativePattern);
    return existsSync(absolutePath) ? [relativePattern] : [];
  }

  const firstWildcardIndex = relativePattern.indexOf("*");
  const searchRoot = relativePattern.slice(0, firstWildcardIndex).split("/").slice(0, -1).join("/");
  const absoluteSearchRoot = resolve(rootDir, searchRoot || ".");
  const patternRegex = pathPatternToRegex(relativePattern);

  return walkFiles(absoluteSearchRoot)
    .map((filePath) => toRelativePath(filePath, rootDir))
    .filter((filePath) => patternRegex.test(filePath))
    .sort((left, right) => left.localeCompare(right));
}

function readArtifactLineageManifest({ rootDir = process.cwd() } = {}) { const manifestPath = resolve(rootDir, ARTIFACT_LINEAGE_MANIFEST_PATH);
return JSON.parse(readFileSync(manifestPath, "utf-8")); }

export function findArtifactLineageEntry(artifactPath, { rootDir = process.cwd(), manifest } = {}) {
  const relativePath = toRelativePath(artifactPath, rootDir);
  const sourceManifest = manifest ?? readArtifactLineageManifest({ rootDir });
  return sourceManifest.artifacts.find((entry) => matchesArtifactPath(entry, relativePath)) ?? null;
}

function hashFile(pathname) { return createHash("sha256").update(readFileSync(pathname)).digest("hex"); }

function summarizeArtifactFile(pathname) { if (!existsSync(pathname)) {
  return { exists: false };
}

const stats = statSync(pathname);
return {
  exists: true,
  byteSize: stats.size,
  contentSha256: hashFile(pathname),
}; }

function commandName(argv = process.argv) { return argv.map((part) => (part.includes(" ") ? JSON.stringify(part) : part)).join(" "); }

function sidecarPathForArtifact(artifactPath, { rootDir = process.cwd() } = {}) { const relativePath = toRelativePath(artifactPath, rootDir);
return resolve(
  rootDir,
  ARTIFACT_LINEAGE_RUN_DIR,
  `${relativePath.replaceAll("/", "__")}.lineage.json`,
); }

export function buildArtifactLineageRecord({
  artifactPath,
  rootDir = process.cwd(),
  manifest,
  producer,
  consumers,
  command = commandName(),
  sourceDeployment = null,
  targetDeployment = null,
  schemaVersion = null,
  generatedAt = new Date().toISOString(),
  extra = {},
} = {}) {
  if (!artifactPath) {
    throw new Error("artifactPath is required to build artifact lineage");
  }

  const absoluteArtifactPath = isAbsolute(artifactPath) ? artifactPath : resolve(rootDir, artifactPath);
  const relativeArtifactPath = toRelativePath(absoluteArtifactPath, rootDir);
  const entry = findArtifactLineageEntry(relativeArtifactPath, { rootDir, manifest });

  if (!entry) {
    throw new Error(`No artifact lineage manifest entry matches ${relativeArtifactPath}`);
  }

  const fileSummary = summarizeArtifactFile(absoluteArtifactPath);

  return {
    artifact: relativeArtifactPath,
    manifestEntryId: entry.id,
    role: entry.role,
    editPolicy: entry.editPolicy,
    producer: producer ?? entry.producer,
    consumers: consumers ?? entry.consumers,
    command,
    generatedAt,
    sourceDeployment,
    targetDeployment,
    schemaVersion,
    file: fileSummary,
    extra,
  };
}

export function writeArtifactLineageSidecar(options = {}) {
  const record = buildArtifactLineageRecord(options);
  const outputPath = sidecarPathForArtifact(record.artifact, { rootDir: options.rootDir });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`);
  return { outputPath, record };
}

export function tryWriteArtifactLineageSidecar(options = {}, { logger = console } = {}) {
  try {
    return writeArtifactLineageSidecar(options);
  } catch (error) {
    logger.warn(`Data artifact lineage sidecar skipped: ${error.message}`);
    return null;
  }
}

function commandTargetExists(command, rootDir) {
  const parts = command.split(/\s+/).filter(Boolean);
  const scriptArgIndex = parts.findIndex((part) => part.endsWith(".mjs") || part.endsWith(".ts"));

  if (scriptArgIndex >= 0) {
    return existsSync(resolve(rootDir, parts[scriptArgIndex]));
  }

  if (parts[0] === "npm" && parts[1] === "run" && parts[2]) {
    const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
    return Boolean(packageJson.scripts?.[parts[2]]);
  }

  return true;
}

export function validateArtifactLineageManifest({ rootDir = process.cwd(), manifest } = {}) {
  const sourceManifest = manifest ?? readArtifactLineageManifest({ rootDir });
  const errors = [];
  const ids = new Set();
  const requiredFields = [
    "id",
    "path",
    "role",
    "producer",
    "consumers",
    "inputs",
    "freshnessRule",
    "editPolicy",
    "refreshCommand",
  ];

  for (const entry of sourceManifest.artifacts ?? []) {
    for (const field of requiredFields) {
      if (!entry[field] || (Array.isArray(entry[field]) && entry[field].length === 0)) {
        errors.push(`${entry.id ?? entry.path ?? "unknown artifact"} is missing ${field}`);
      }
    }

    if (ids.has(entry.id)) {
      errors.push(`duplicate artifact lineage id: ${entry.id}`);
    }
    ids.add(entry.id);

    if (entry.refreshCommand && !commandTargetExists(entry.refreshCommand, rootDir)) {
      errors.push(`${entry.id} refreshCommand target does not exist: ${entry.refreshCommand}`);
    }

    if (
      typeof entry.producer === "string" &&
      entry.producer.startsWith("scripts/") &&
      listArtifactLineagePathMatches(entry.producer, { rootDir }).length === 0
    ) {
      errors.push(`${entry.id} producer target does not exist: ${entry.producer}`);
    }

    if (
      REFERENCES_ERA_BACKUP_ARTIFACT_IDS.has(entry.id) &&
      entry.schemaVersion !== REFERENCES_ERA_SUBSTANCE_SCHEMA_PATH
    ) {
      errors.push(
        `${entry.id} must declare schemaVersion ${REFERENCES_ERA_SUBSTANCE_SCHEMA_PATH} so local exports and backups stay pinned to the references-era article contract`,
      );
    }
  }

  return errors;
}

function collectDocumentedDataArtifactPaths({
  rootDir = process.cwd(),
  docsPaths = ARTIFACT_LINEAGE_DOC_PATHS,
} = {}) { const dataArtifactPattern = /(?<![\w/])(?:src\/)?data\/[A-Za-z0-9_.*/-]+\.(?:json|md|ts)/g;
const paths = new Set();

for (const docsPath of docsPaths) {
  const absoluteDocsPath = resolve(rootDir, docsPath);
  if (!existsSync(absoluteDocsPath)) {
    continue;
  }

  const contents = readFileSync(absoluteDocsPath, "utf-8");
  for (const match of contents.matchAll(dataArtifactPattern)) {
    paths.add(match[0].replaceAll("\\", "/"));
  }
}

return Array.from(paths).sort((left, right) => left.localeCompare(right)); }

function collectTrackedGeneratedExportPaths({ rootDir = process.cwd() } = {}) { try {
  return execFileSync("git", ["ls-files", "notes-and-plans/exports"], {
    cwd: rootDir,
    encoding: "utf-8",
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
} catch {
  return [];
} }

export function collectArtifactLineageVerification({
  rootDir = process.cwd(),
  manifest,
  docsPaths = ARTIFACT_LINEAGE_DOC_PATHS,
  trackedGeneratedExports = collectTrackedGeneratedExportPaths({ rootDir }),
} = {}) {
  const sourceManifest = manifest ?? readArtifactLineageManifest({ rootDir });
  const errors = validateArtifactLineageManifest({ rootDir, manifest: sourceManifest });
  const warnings = [];
  const generatedExportRetention = evaluateGeneratedExportRetention(trackedGeneratedExports);

  for (const entry of sourceManifest.artifacts ?? []) {
    // Published assets may intentionally live outside the repository. Their
    // delivery URLs are lineage identifiers, not local filesystem patterns.
    if (/^https?:\/\//i.test(entry.path)) {
      continue;
    }
    const matches = listArtifactLineagePathMatches(entry.path, { rootDir });
    if (matches.length === 0) {
      warnings.push(`${entry.id} output path has no current match: ${entry.path}`);
    }
  }

  for (const documentedPath of collectDocumentedDataArtifactPaths({ rootDir, docsPaths })) {
    const entry = findArtifactLineageEntry(documentedPath, { rootDir, manifest: sourceManifest });
    if (!entry) {
      warnings.push(`documented data artifact is not represented in lineage manifest: ${documentedPath}`);
    }
  }

  for (const exportPath of generatedExportRetention.unclassified) {
    errors.push(`tracked generated export lacks retention policy: ${exportPath}`);
  }

  return {
    errors,
    warnings,
    generatedExports: {
      tracked: generatedExportRetention.tracked,
      retained: generatedExportRetention.retained.length,
      unclassified: generatedExportRetention.unclassified,
    },
  };
}

export function collectArtifactLineageWarnings({ rootDir = process.cwd() } = {}) {
  const runDir = resolve(rootDir, ARTIFACT_LINEAGE_RUN_DIR);
  const warnings = [];

  if (!existsSync(runDir)) {
    return warnings;
  }

  for (const fileName of readdirSync(runDir)) {
    if (!fileName.endsWith(".lineage.json")) {
      continue;
    }

    const sidecarPath = join(runDir, fileName);
    const record = JSON.parse(readFileSync(sidecarPath, "utf-8"));
    const artifactPath = resolve(rootDir, record.artifact);
    const currentSummary = summarizeArtifactFile(artifactPath);

    if (!currentSummary.exists) {
      warnings.push(`${record.artifact} has lineage metadata but the artifact is missing`);
      continue;
    }

    if (record.file?.contentSha256 && record.file.contentSha256 !== currentSummary.contentSha256) {
      warnings.push(`${record.artifact} changed after its latest lineage sidecar was emitted`);
    }
  }

  return warnings;
}

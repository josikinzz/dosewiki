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
const GENERATED_OUTPUT_NAME = /\.generated[./]/;
const GENERATED_OUTPUT_GLOBS = [
  "content/i18n/messages/*.json",
  "content/sources/psychonautwiki-2015/articles/*.md",
  "content/sources/psychonautwiki-2015/json/*.json",
  "content/sources/psychonautwiki-2015/not-found-2015.md",
  "data/changelog/devChangeLog*.json",
  "data/chemistry/*.json",
  "data/contributors/contributorAvatarSources.json",
  "data/contributors/userProfiles.json",
  "data/effects/replicationSlugAliases.json",
  "data/effects/subjectiveEffectsProvenance.json",
  "data/i18n/glossary/*.json",
  "data/third-party/tripsit/*.json",
  "lib/postgres/migrations/**",
  "lib/postgres/runtime/dataModel.ts",
  "public/SubstanceIndex.json",
  "public/appearance-chroma.css",
  "public/dosewiki-molecules.*",
  "public/favicons/*",
  "public/mantras/*",
  "public/pro-theme.css",
  "public/theme-light-mode.css",
  "src/data/config/sourceFavicons.ts",
  "src/i18n/catalogPublication.json",
  "vendor/openchemlib/artifact-manifest.json",
  "vendor/openchemlib/dist/*",
];
const FILES_NEEDING_THEIR_OWN_ENTRY = {
  authored: [
    "data/i18n/glossary/zh-Hans.drafts-2026-09-12.json",
    "public/favicons/{bluelight,dancesafe,disregardeverythingisay,drugbank,drugs-forum,drugusersbible,erowid,isomerdesign,mindstate-design,protestkit,psychonautwiki,pubchem,pubmed,reddit,thedrugclassroom,tripsit,wikipedia}.png",
  ],
  "separately produced": [
    "lib/postgres/migrations/0013_localized_publication_index_triggers.sql",
    "lib/postgres/migrations/0014_restore_localized_publication_index_triggers.sql",
  ],
};
const REPOSITORY_PATH = /^(?:[\w.@[\]()-]+(?:\/[\w.@[\]()*-]+)+|[\w.@-]+\.[A-Za-z]\w*)$/;
const PATH_WILDCARD = /[*{]/;

function toRelativePath(pathname, rootDir) {
  const absolutePath = isAbsolute(pathname) ? pathname : resolve(rootDir, pathname);
  return relative(rootDir, absolutePath).replaceAll("\\", "/");
}

function pathPatternToRegex(pathPattern) {
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = pathPattern.replace(/\*\*|\*|\{([^{}]*)\}|[.+?^${}()|[\]\\]/g, (token, alternatives) => {
    if (token === "**") return ".*";
    if (token === "*") return "[^/]*";
    if (alternatives !== undefined) return `(?:${alternatives.split(",").map(escape).join("|")})`;
    return `\\${token}`;
  });
  return new RegExp(`^${source}$`);
}

function matchesArtifactPath(entry, artifactPath) {
  return entry.path === artifactPath || (PATH_WILDCARD.test(entry.path) && pathPatternToRegex(entry.path).test(artifactPath));
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

  if (!PATH_WILDCARD.test(relativePattern)) {
    const absolutePath = resolve(rootDir, relativePattern);
    return existsSync(absolutePath) ? [relativePattern] : [];
  }

  const firstWildcardIndex = relativePattern.search(PATH_WILDCARD);
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
  const matches = sourceManifest.artifacts.filter((entry) => matchesArtifactPath(entry, relativePath));
  return matches.find((entry) => !entry.path.includes("*")) ?? matches[0] ?? null;
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

const REFRESH_FIELDS = {
  command: { required: ["command"], optional: ["instructions"] },
  manual: { required: ["instructions"], optional: ["commands", "runbook"] },
};
const COMMAND_FIELDS = {
  script: ["script", "args", "env"],
  file: ["runtime", "file", "args", "env"],
};
const COMMAND_RUNTIMES = new Set(["bun", "node"]);
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function commandProblems(command, { rootDir, packageScripts }) {
  if (!isPlainObject(command)) return ["is not an object"];
  const form = "script" in command ? "script" : "file";
  const problems = Object.keys(command)
    .filter((key) => !COMMAND_FIELDS[form].includes(key))
    .map((key) => `has unknown field ${key}`);
  if (form === "script" && !Object.hasOwn(packageScripts, command.script)) {
    problems.push(`names an unknown package script: ${command.script}`);
  }
  if (form === "file" && !COMMAND_RUNTIMES.has(command.runtime)) {
    problems.push(`needs runtime bun or node, not ${command.runtime}`);
  }
  if (form === "file" && !(isNonEmptyString(command.file) && existsSync(resolve(rootDir, command.file)))) {
    problems.push(`names a file that does not exist: ${command.file}`);
  }
  if ("args" in command && !(Array.isArray(command.args) && command.args.every(isNonEmptyString))) {
    problems.push("args must be an array of strings");
  }
  const envIsValid = isPlainObject(command.env)
    && Object.entries(command.env).every(([name, value]) => ENV_NAME.test(name) && isNonEmptyString(value));
  if ("env" in command && !envIsValid) {
    problems.push("env must map variable names to strings");
  }
  return problems;
}

function markdownHeadingAnchors(markdown) {
  return new Set([...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) =>
    heading.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s/g, "-")));
}

function runbookProblems(runbook, rootDir) {
  if (!isNonEmptyString(runbook)) return ["refresh.runbook must be a path string"];
  const [file, anchor] = runbook.split("#");
  const runbookPath = resolve(rootDir, file);
  if (!existsSync(runbookPath)) return [`refresh.runbook does not exist: ${runbook}`];
  if (anchor && !markdownHeadingAnchors(readFileSync(runbookPath, "utf-8")).has(anchor)) {
    return [`refresh.runbook anchor does not exist: ${runbook}`];
  }
  return [];
}

function refreshProblems(refresh, context) {
  const fields = isPlainObject(refresh) && Object.hasOwn(REFRESH_FIELDS, refresh.kind) ? REFRESH_FIELDS[refresh.kind] : null;
  if (!fields) return [`refresh.kind must be ${Object.keys(REFRESH_FIELDS).join(" or ")}`];
  const allowed = ["kind", ...fields.required, ...fields.optional];
  const problems = [
    ...Object.keys(refresh).filter((key) => !allowed.includes(key)).map((key) => `refresh of kind ${refresh.kind} has unknown field ${key}`),
    ...fields.required.filter((key) => !(key in refresh)).map((key) => `refresh of kind ${refresh.kind} needs ${key}`),
  ];
  if ("instructions" in refresh && !isNonEmptyString(refresh.instructions)) {
    problems.push("refresh.instructions must be a non-empty string");
  }
  if ("command" in refresh) {
    problems.push(...commandProblems(refresh.command, context).map((problem) => `refresh.command ${problem}`));
  }
  if ("commands" in refresh) {
    if (!Array.isArray(refresh.commands) || refresh.commands.length === 0) {
      problems.push("refresh.commands must be a non-empty array");
    } else {
      refresh.commands.forEach((command, index) => {
        problems.push(...commandProblems(command, context).map((problem) => `refresh.commands[${index}] ${problem}`));
      });
    }
  }
  if ("runbook" in refresh) {
    problems.push(...runbookProblems(refresh.runbook, context.rootDir));
  }
  return problems;
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
    "refresh",
  ];
  const packageScripts = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8")).scripts ?? {};

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

    if ("refreshCommand" in entry) {
      errors.push(`${entry.id} uses the retired refreshCommand string; describe it with a typed refresh object`);
    }

    if (entry.refresh) {
      errors.push(...refreshProblems(entry.refresh, { rootDir, packageScripts }).map((problem) => `${entry.id} ${problem}`));
    }

    if (
      typeof entry.producer === "string" &&
      entry.producer.startsWith("scripts/") &&
      listArtifactLineagePathMatches(entry.producer, { rootDir }).length === 0
    ) {
      errors.push(`${entry.id} producer target does not exist: ${entry.producer}`);
    }

    for (const consumer of entry.consumers ?? []) {
      if (REPOSITORY_PATH.test(consumer) && listArtifactLineagePathMatches(consumer, { rootDir }).length === 0) {
        errors.push(`${entry.id} consumer does not exist: ${consumer}`);
      }
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
    const documentedPath = match[0].replaceAll("\\", "/");
    if (documentedPath.endsWith("/README.md")) continue;
    paths.add(documentedPath);
  }
}

return Array.from(paths).sort((left, right) => left.localeCompare(right)); }

function isGitIgnored(artifactPath, rootDir) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", artifactPath], { cwd: rootDir, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

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

function listTrackedFiles(rootDir) {
  return execFileSync("git", ["ls-files"], { cwd: rootDir, encoding: "utf-8" }).split(/\r?\n/).filter(Boolean);
}

export function collectArtifactLineageVerification({
  rootDir = process.cwd(),
  manifest,
  docsPaths = ARTIFACT_LINEAGE_DOC_PATHS,
  trackedGeneratedExports = collectTrackedGeneratedExportPaths({ rootDir }),
  trackedFiles = listTrackedFiles(rootDir),
} = {}) {
  const sourceManifest = manifest ?? readArtifactLineageManifest({ rootDir });
  const errors = validateArtifactLineageManifest({ rootDir, manifest: sourceManifest });
  const warnings = [];
  const generatedExportRetention = evaluateGeneratedExportRetention(trackedGeneratedExports);

  for (const entry of sourceManifest.artifacts ?? []) {
    if (/^https?:\/\//i.test(entry.path)) {
      continue;
    }
    const matches = listArtifactLineagePathMatches(entry.path, { rootDir });
    if (matches.length === 0 && !isGitIgnored(entry.path, rootDir)) {
      warnings.push(`${entry.id} output path has no current match: ${entry.path}`);
    }
  }

  for (const documentedPath of collectDocumentedDataArtifactPaths({ rootDir, docsPaths })) {
    const entry = findArtifactLineageEntry(documentedPath, { rootDir, manifest: sourceManifest });
    if (!entry) {
      warnings.push(`documented data artifact is not represented in lineage manifest: ${documentedPath}`);
    }
  }

  const generatedOutputPatterns = [GENERATED_OUTPUT_NAME, ...GENERATED_OUTPUT_GLOBS.map(pathPatternToRegex)];
  const ownEntryPatterns = Object.entries(FILES_NEEDING_THEIR_OWN_ENTRY).flatMap(([kind, patterns]) =>
    patterns.map((pattern) => ({ kind, regex: pathPatternToRegex(pattern) })));
  for (const filePath of trackedFiles) {
    const ownEntryKind = ownEntryPatterns.find(({ regex }) => regex.test(filePath))?.kind;
    if (!ownEntryKind && !generatedOutputPatterns.some((pattern) => pattern.test(filePath))) {
      continue;
    }
    const entry = findArtifactLineageEntry(filePath, { rootDir, manifest: sourceManifest });
    if (ownEntryKind && (!entry || entry.path.includes("*"))) {
      errors.push(`${ownEntryKind} file inside a generated output glob needs its own lineage entry: ${filePath}`);
    } else if (!entry) {
      errors.push(`tracked generated output has no lineage entry: ${filePath}`);
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

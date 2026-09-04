import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const forkRoot = path.join(repositoryRoot, "vendor/openchemlib");
const manifestPath = path.join(forkRoot, "artifact-manifest.json");
const writeMode = process.argv.includes("--write");

const SOURCE_ROOTS = ["src", "lib", "scripts"];
const SOURCE_FILES = [
  "package.json",
  "tsconfig.json",
  "LICENSE",
  "PROVENANCE.md",
  "LOCAL_MODIFICATIONS.md",
  "README.dosewiki.md",
];
const ARTIFACT_FILES = [
  "dist/openchemlib.js",
  "dist/openchemlib.debug.js",
  "dist/openchemlib.d.ts",
  "dist/resources.json",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function collectFiles(relativeRoot) {
  const absoluteRoot = path.join(forkRoot, relativeRoot);
  const collected = [];

  async function visit(absoluteDirectory) {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const relativePath = path.relative(forkRoot, absolutePath).split(path.sep).join("/");
      if (relativePath === "lib/java" || relativePath.startsWith("lib/java/")) continue;
      if (entry.name === "node_modules" || entry.name === ".tools") continue;
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) collected.push(relativePath);
    }
  }

  await visit(absoluteRoot);
  return collected;
}

async function fileRecord(relativePath) {
  const absolutePath = path.join(forkRoot, relativePath);
  const [contents, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  return {
    path: relativePath,
    bytes: metadata.size,
    sha256: sha256(contents),
  };
}

function aggregate(records) {
  return sha256(
    records
      .map((record) => `${record.path}\0${record.bytes}\0${record.sha256}`)
      .join("\n"),
  );
}

async function assertLocalOwnership() {
  const installedPackagePath = path.join(repositoryRoot, "node_modules/openchemlib/package.json");
  const [rootPackageText, bunLockText, installedPackageText] = await Promise.all([
    readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    readFile(path.join(repositoryRoot, "bun.lock"), "utf8"),
    readFile(installedPackagePath, "utf8"),
  ]);
  const rootPackage = JSON.parse(rootPackageText);
  if (rootPackage.dependencies?.openchemlib !== "file:vendor/openchemlib") {
    throw new Error("DoseWiki must resolve openchemlib from file:vendor/openchemlib.");
  }
  if (!bunLockText.includes('"openchemlib": "file:vendor/openchemlib"')) {
    throw new Error("bun.lock does not record the local OpenChemLib dependency.");
  }

  const installedPackage = JSON.parse(installedPackageText);
  if (installedPackage.version !== "9.23.0-dosewiki.1") {
    throw new Error(
      `Installed OpenChemLib is not the DoseWiki fork (found ${installedPackage.version ?? "unknown"}). Run bun install.`,
    );
  }
  for (const artifact of ARTIFACT_FILES) {
    const [installed, source] = await Promise.all([
      readFile(path.join(repositoryRoot, "node_modules/openchemlib", artifact)),
      readFile(path.join(forkRoot, artifact)),
    ]);
    if (!installed.equals(source)) {
      throw new Error(`Installed OpenChemLib artifact is stale: ${artifact}. Run bun install.`);
    }
  }

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".tools") continue;
      if (entry.name === ".git" || entry.name === ".gitmodules") {
        throw new Error(`Nested Git metadata is not allowed in the fork: ${path.join(directory, entry.name)}`);
      }
      if (entry.isDirectory()) await visit(path.join(directory, entry.name));
    }
  }
  await visit(forkRoot);
}

await assertLocalOwnership();

const sourcePaths = [
  ...(await Promise.all(SOURCE_ROOTS.map(collectFiles))).flat(),
  ...SOURCE_FILES,
].sort();
const sourceRecords = await Promise.all(sourcePaths.map(fileRecord));
const artifactRecords = await Promise.all(ARTIFACT_FILES.map(fileRecord));

const currentManifest = {
  schemaVersion: 2,
  upstream: {
    openchemlibJsVersion: "9.23.0",
    openchemlibJsCommit: "d0157013aef3bb3e0057804491d4acc2192fe283",
    openchemlibJavaCommit: "94f77815728907829087ef350bf069ce241b54c1",
  },
  verification: {
    artifactCheck: "npm run openchemlib:verify",
    // Runs the package's Vitest suite against the committed distributables
    // (the local fork tests live under tests/dosewiki). Needs only the
    // package-local dev dependencies, never a JDK or GWT.
    testLane: "npm run openchemlib:test",
    forkTests: "tests/dosewiki",
  },
  inputs: {
    fileCount: sourceRecords.length,
    sha256: aggregate(sourceRecords),
  },
  artifacts: {
    sha256: aggregate(artifactRecords),
    files: artifactRecords,
  },
};

if (writeMode) {
  await writeFile(manifestPath, `${JSON.stringify(currentManifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(repositoryRoot, manifestPath)}.`);
  process.exit(0);
}

const recordedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (JSON.stringify(recordedManifest) !== JSON.stringify(currentManifest)) {
  console.error("OpenChemLib fork source or committed artifacts are out of sync.");
  console.error(`Recorded inputs:   ${recordedManifest.inputs?.sha256 ?? "missing"}`);
  console.error(`Current inputs:    ${currentManifest.inputs.sha256}`);
  console.error(`Recorded artifacts:${recordedManifest.artifacts?.sha256 ?? "missing"}`);
  console.error(`Current artifacts: ${currentManifest.artifacts.sha256}`);
  console.error("Run npm run openchemlib:build after changing fork source, then review the generated diff.");
  process.exit(1);
}

console.log(
  `OpenChemLib fork verified (${currentManifest.inputs.fileCount} inputs, ${currentManifest.artifacts.files.length} artifacts).`,
);

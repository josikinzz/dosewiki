import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import {
  RELEASE_ARTIFACTS,
  artifactOutputs,
  keepPublicBuildInputs,
  normalizeSiteFlavor,
  prebuiltDeploymentIdForRun,
  resolveArtifact,
  resolveBuildDirectory,
  resolveBuildSurface,
  resolvePrebuiltDeploymentId,
  unignoreBuildDirectories,
} from "./build-surface.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = path.join(repoRoot, "scripts/build/build-surface-cli.mjs");

// Known-good literals copied from the tables this module replaces: the case
// block in remote-build.yml and the release-build matrix in
// vercel-policy-checks.yml.
test("each release artifact names its build surface, flavor and directory", () => {
  assert.deepEqual(RELEASE_ARTIFACTS, ["public", "editor", "effectindex"]);
  assert.deepEqual(
    RELEASE_ARTIFACTS.map((name) => {
      const { artifact, surface, flavor, buildDirectory } = resolveArtifact(name);
      return { artifact, surface, flavor, buildDirectory };
    }),
    [
      { artifact: "public", surface: "public", flavor: "dosewiki", buildDirectory: ".next" },
      { artifact: "editor", surface: "editor", flavor: "dosewiki", buildDirectory: ".next-editor" },
      { artifact: "effectindex", surface: "public", flavor: "effectindex", buildDirectory: ".next" },
    ],
  );
});

test("an artifact's build environment is the two values next.config.ts reads", () => {
  assert.deepEqual(resolveArtifact("effectindex").buildEnv, {
    DOSEWIKI_BUILD_SURFACE: "public",
    NEXT_PUBLIC_SITE_FLAVOR: "effectindex",
  });
  for (const name of RELEASE_ARTIFACTS) {
    const { buildEnv, surface, flavor, buildDirectory } = resolveArtifact(name);
    assert.equal(resolveBuildSurface(buildEnv), surface);
    assert.equal(normalizeSiteFlavor(buildEnv.NEXT_PUBLIC_SITE_FLAVOR), flavor);
    assert.equal(resolveBuildDirectory(buildEnv), buildDirectory);
  }
});

test("only the editor artifact owns the writer cron jobs", () => {
  assert.deepEqual(
    RELEASE_ARTIFACTS.map((name) => resolveArtifact(name).ownsWriterCrons),
    [false, true, false],
  );
});

test("an unknown artifact name throws instead of defaulting", () => {
  for (const name of ["staging", "", "Public", undefined]) {
    assert.throws(() => resolveArtifact(name), /Unknown artifact/);
  }
});

test("the flavor selector falls back to dose.wiki unless it names Effect Index", () => {
  for (const raw of [undefined, "", "   ", "psychonautwiki", "effect-index", "dosewiki"]) {
    assert.equal(normalizeSiteFlavor(raw), "dosewiki");
  }
  assert.equal(normalizeSiteFlavor("effectindex"), "effectindex");
  assert.equal(normalizeSiteFlavor("  EffectIndex "), "effectindex");
});

test("only NEXT_PUBLIC_* and NODE_OPTIONS lines survive as build inputs", () => {
  const pulled = [
    'NEXT_PUBLIC_SITE_FLAVOR="effectindex"',
    'POSTGRES_POOLED_URL="postgres://secret"',
    'NODE_OPTIONS="--max-old-space-size=8192"',
    'DATA_ADMIN_KEY="secret"',
    'NEXT_PUBLIC_lower="kept only when upper case"',
    'NEXT_PUBLIC_SITE_URL="https://dose.wiki"',
    '# NEXT_PUBLIC_COMMENTED="no"',
    ' NEXT_PUBLIC_INDENTED="no"',
    'NODE_OPTIONS_EXTRA="no"',
  ].join("\n");
  assert.equal(
    keepPublicBuildInputs(pulled),
    [
      'NEXT_PUBLIC_SITE_FLAVOR="effectindex"',
      'NODE_OPTIONS="--max-old-space-size=8192"',
      'NEXT_PUBLIC_SITE_URL="https://dose.wiki"',
    ].join("\n"),
  );
  assert.equal(keepPublicBuildInputs(""), "");
});

test("a prebuilt upload names its skew ID from the run, and the build adopts it trimmed", () => {
  assert.equal(
    prebuiltDeploymentIdForRun({ GITHUB_RUN_ID: "18012345678", GITHUB_RUN_ATTEMPT: "2" }),
    "gh-18012345678-2",
  );
  assert.equal(prebuiltDeploymentIdForRun({}), undefined);
  assert.equal(prebuiltDeploymentIdForRun({ GITHUB_RUN_ID: "1" }), undefined);

  assert.equal(resolvePrebuiltDeploymentId({ DOSEWIKI_PREBUILT_DEPLOYMENT_ID: " gh-1-1 " }), "gh-1-1");
  assert.equal(resolvePrebuiltDeploymentId({ DOSEWIKI_PREBUILT_DEPLOYMENT_ID: "   " }), undefined);
  assert.equal(resolvePrebuiltDeploymentId({}), undefined);
});

test("the upload keeps build-directory function files by dropping the .next-*/ rule", () => {
  const ignore = "node_modules/\n.next/\n.next-*/\ndist/\n# .next-*/ in a comment stays\n";
  assert.equal(
    unignoreBuildDirectories(ignore),
    "node_modules/\n.next/\ndist/\n# .next-*/ in a comment stays\n",
  );
  assert.throws(() => unignoreBuildDirectories("node_modules/\n.next/\n"), /no longer carries the \.next-\*\/ rule/);
});

test("the repository .vercelignore still carries the rule the upload drops", async () => {
  const ignore = await readFile(path.join(repoRoot, ".vercelignore"), "utf8");
  assert.doesNotThrow(() => unignoreBuildDirectories(ignore));
});

test("step outputs carry surface, flavor, directory and the run's skew ID", () => {
  assert.equal(
    artifactOutputs("editor", { GITHUB_RUN_ID: "42", GITHUB_RUN_ATTEMPT: "1" }),
    "surface=editor\nflavor=dosewiki\ndir=.next-editor\ndeployment_id=gh-42-1\n",
  );
  assert.equal(artifactOutputs("effectindex", {}), "surface=public\nflavor=effectindex\ndir=.next\n");
});

function cli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
}

test("the CLI prints step outputs and rejects an unknown artifact", () => {
  const ok = cli(["outputs", "public"], { GITHUB_RUN_ID: "7", GITHUB_RUN_ATTEMPT: "3" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, "surface=public\nflavor=dosewiki\ndir=.next\ndeployment_id=gh-7-3\n");

  const bad = cli(["outputs", "staging"]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Unknown artifact staging/);
});

test("the CLI filters a pulled env file and rewrites .vercelignore in place", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dosewiki build surface "));
  try {
    const envFile = path.join(dir, ".env.production.local");
    await writeFile(envFile, 'SECRET="x"\nNEXT_PUBLIC_A="1"\n');
    const kept = cli(["public-build-inputs", envFile]);
    assert.equal(kept.status, 0, kept.stderr);
    assert.equal(kept.stdout, 'NEXT_PUBLIC_A="1"\n');

    const missing = cli(["public-build-inputs", path.join(dir, "absent")]);
    assert.equal(missing.status, 0, missing.stderr);
    assert.equal(missing.stdout, "");

    const ignoreFile = path.join(dir, ".vercelignore");
    await writeFile(ignoreFile, ".next/\n.next-*/\n");
    const staged = cli(["unignore-build-directories", ignoreFile]);
    assert.equal(staged.status, 0, staged.stderr);
    assert.equal(await readFile(ignoreFile, "utf8"), ".next/\n");

    const again = cli(["unignore-build-directories", ignoreFile]);
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /no longer carries the \.next-\*\/ rule/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the CLI rejects an unknown command", () => {
  const result = cli(["promote", "public"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage/);
});

async function readWorkflow(name) {
  return parse(await readFile(path.join(repoRoot, ".github/workflows", name), "utf8"));
}

test("the workflows name artifacts from this module instead of re-encoding the table", async () => {
  const remote = await readWorkflow("remote-build.yml");
  assert.deepEqual(remote.on.workflow_dispatch.inputs.surface.options, [...RELEASE_ARTIFACTS]);
  const remoteSteps = remote.jobs.build.steps;
  const resolve = remoteSteps.find((step) => step.id === "artifact");
  assert.match(resolve.run, /build-surface-cli\.mjs outputs "\$ARTIFACT"/);
  const build = remoteSteps.find((step) => step.env?.DOSEWIKI_PREBUILT_DEPLOYMENT_ID);
  assert.equal(build.env.DOSEWIKI_PREBUILT_DEPLOYMENT_ID, "${{ steps.artifact.outputs.deployment_id }}");
  assert.equal(build.env.DOSEWIKI_BUILD_SURFACE, "${{ steps.artifact.outputs.surface }}");
  assert.equal(build.env.NEXT_PUBLIC_SITE_FLAVOR, "${{ steps.artifact.outputs.flavor }}");
  const remoteRuns = remoteSteps.map((step) => step.run ?? "").join("\n");
  assert.match(remoteRuns, /build-surface-cli\.mjs public-build-inputs/);
  assert.match(remoteRuns, /build-surface-cli\.mjs unignore-build-directories/);
  assert.doesNotMatch(remoteRuns, /case "\$\{\{ inputs\.surface \}\}"|NEXT_PUBLIC_\[A-Z0-9_\]|sed -i/);

  const policy = await readWorkflow("vercel-policy-checks.yml");
  const release = policy.jobs["release-build"];
  assert.deepEqual(release.strategy.matrix, { artifact: [...RELEASE_ARTIFACTS] });
  assert.equal(release.strategy["max-parallel"], 1);
  const policyBuild = release.steps.find((step) => step.env?.DOSEWIKI_BUILD_SURFACE);
  assert.equal(policyBuild.env.DOSEWIKI_BUILD_SURFACE, "${{ steps.artifact.outputs.surface }}");
  assert.equal(policyBuild.env.NEXT_PUBLIC_SITE_FLAVOR, "${{ steps.artifact.outputs.flavor }}");
  assert.equal(policyBuild.env.DOSEWIKI_BUILD_DIR, ".next-release-${{ matrix.artifact }}");
});

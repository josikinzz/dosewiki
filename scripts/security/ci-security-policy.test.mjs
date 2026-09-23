import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(
  path.join(repoRoot, ".github/workflows/vercel-policy-checks.yml"),
  "utf8",
);

test("security CI pins actions and Bun while granting read-only repository access", () => {
  assert.match(workflow, /^permissions:\n[ ]{2}contents: read$/m);
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/);
  assert.doesNotMatch(workflow, /bun-version:\s*latest/);
  assert.match(workflow, /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/);
  assert.match(workflow, /oven-sh\/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76/);
  assert.match(workflow, /bun-version:\s*["']?1\.3\.5["']?/);
});

test("CI invokes the redacted tracked-file scanner", () => {
  assert.match(workflow, /node scripts\/security\/scan-secrets\.mjs --tracked/);
  assert.doesNotMatch(workflow, /grep\s+-rE\s+["']?\$pattern/);
  assert.ok(
    workflow.indexOf("node scripts/security/scan-secrets.mjs --tracked") <
      workflow.indexOf("bun install --frozen-lockfile"),
    "secret scanning must run before dependency installation or repository code",
  );
});

test("production and full dependency audits publish artifacts without blocking rollout", () => {
  assert.match(workflow, /bun audit --production --json/);
  assert.match(workflow, /bun audit --json/);
  assert.match(workflow, /security-audit-production\.json/);
  assert.match(workflow, /security-audit-full\.json/);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(workflow, /continue-on-error:\s*true/);
  assert.match(workflow, /if:\s*always\(\)/);
});

const nightlyWorkflow = readFileSync(
  path.join(repoRoot, ".github/workflows/molecule-pack-nightly.yml"),
  "utf8",
);

test("the nightly molecule pack rebases once onto main before it pushes", () => {
  const pushStep = nightlyWorkflow.slice(nightlyWorkflow.indexOf("- name: Commit and push the refreshed pack"));
  const rebase = pushStep.indexOf("git pull --rebase origin main");
  const push = pushStep.indexOf("git push origin HEAD:main");
  assert.ok(rebase > 0, "the push step must rebase onto the current main");
  assert.ok(push > rebase, "the rebase must run before the push");
  assert.equal(pushStep.match(/git pull --rebase/g)?.length, 1, "the push step rebases exactly once");
});

test("pack-only commits to main do not start the policy workflow", () => {
  const pushTrigger = workflow.slice(workflow.indexOf("  push:"), workflow.indexOf("  pull_request:"));
  assert.match(pushTrigger, /paths-ignore:\n\s+- public\/dosewiki-molecules\.zip\n\s+- public\/dosewiki-molecules\.json/);
});

test("CI fails on lineage, migration, and generated schema drift", () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.match(packageJson.scripts["provenance:check"], /--strict\b/);
  assert.match(packageJson.scripts["postgres:check-schema"], /generateDrizzleSchema\.ts --check$/);
  for (const command of ["provenance:check", "postgres:verify-migrations", "postgres:check-schema"]) {
    assert.match(workflow, new RegExp(`bun run ${command}\\b`), `CI runs ${command}`);
    assert.match(packageJson.scripts["verify:workflow"], new RegExp(`npm run ${command}\\b`), `verify:workflow runs ${command}`);
  }
});

test("CI runs knip so dead files and dependencies fail the build", () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts.knip, "knip");
  assert.match(workflow, /bun run knip\b/);
});

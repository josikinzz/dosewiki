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

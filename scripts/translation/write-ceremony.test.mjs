import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = "postgres://127.0.0.1:1/translation-ceremony";
const deployment = "--expected-deployment=127.0.0.1/translation-ceremony";

function run(script, args, env = {}) {
  return spawnSync("bun", ["--no-env-file", "--preload", "./scripts/postgres/preload-server-only.ts", script, ...args, "--target", target], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
}

function assertRefused(result, pattern) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /ECONNREFUSED|connect/i);
}

test("load-glosses refuses a write without the full ceremony before connecting", () => {
  const backend = { DATA_BACKEND: "postgres" };
  assertRefused(run("scripts/translation/load-glosses.ts", ["--write"]), /DATA_BACKEND=postgres/);
  assertRefused(run("scripts/translation/load-glosses.ts", ["--write"], backend), /requires --confirm-write=load-glosses/);
  assertRefused(run("scripts/translation/load-glosses.ts", ["--write", "--confirm-write=load-glosses", "--expected-deployment=other/db"], backend), /does not match target deployment/);
  assertRefused(run("scripts/translation/load-glosses.ts", ["--write", "--confirm-write=load-glosses", deployment], { ...backend, DATA_WRITES_FROZEN: "1" }), /DATA_WRITES_FROZEN/);
});

test("live-mirror refuses each mutating subcommand without its own confirmation", () => {
  const backend = { DATA_BACKEND: "postgres" };
  assertRefused(run("scripts/translation/live-mirror.ts", ["enqueue", "--slug=example", "--write", "--confirm-write=live-mirror-run", deployment], backend), /requires --confirm-write=live-mirror-enqueue/);
  assertRefused(run("scripts/translation/live-mirror.ts", ["import", "--run=missing", "--write", "--confirm-write=live-mirror-import", deployment], { ...backend, DATA_WRITES_FROZEN: "1" }), /DATA_WRITES_FROZEN/);
  assertRefused(run("scripts/translation/live-mirror.ts", ["status", "--write"], backend), /status is read-only/);
});

test("import-glossary-drafts refuses a write without the full ceremony before connecting", () => {
  const backend = { DATA_BACKEND: "postgres" };
  const write = ["--locales", "de", "--write", "--confirm-write=import-glossary-drafts"];
  assertRefused(run("scripts/translation/import-glossary-drafts.ts", [...write, "--expected-deployment=other/db"], backend), /does not match target deployment/);
  assertRefused(run("scripts/translation/import-glossary-drafts.ts", [...write, deployment], { ...backend, DATA_WRITES_FROZEN: "1" }), /DATA_WRITES_FROZEN/);
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const deployment = "127.0.0.1/dosewiki";

// A loopback listener that drops every connection: each bulk mutation the
// callers send rejects, which is the path under test. Nothing can be written.
let server;
let target;
let workspace;

before(async () => {
  server = net.createServer((socket) => socket.destroy());
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  target = `postgres://127.0.0.1:${server.address().port}/dosewiki`;
  // The callers resolve their repo root and relative inputs from the working
  // directory, so a scratch root keeps audit logs and inputs out of the tree.
  workspace = mkdtempSync(join(os.tmpdir(), "bulk-import-callers-"));
  writeFileSync(join(workspace, "package.json"), "{}\n");
});

after(async () => {
  await new Promise((done) => server.close(done));
  rmSync(workspace, { recursive: true, force: true });
});

function run(script, args) {
  return new Promise((done) => {
    const child = spawn("bun", ["--no-env-file", join(repoRoot, script), ...args], {
      cwd: workspace,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DATA_BACKEND: "postgres",
        TARGET_POSTGRES_URL: target,
        REPLICATION_MEDIA_BASE_URL: "https://media.example.invalid",
        DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE: "placeholder-editor-token",
      },
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (status) => done({ status, output }));
  });
}

test("the trip report migration exits nonzero when its bulk mutation rejects", async () => {
  const reports = join(workspace, "reports.json");
  writeFileSync(reports, JSON.stringify([{ slug: "placeholder-report", title: "Placeholder", subject: { name: "Placeholder" }, substances: [], tags: [] }]));
  const result = await run("scripts/migrate/migrate-trip-reports.mjs", [
    reports, "--write", "--confirm-write=migrate-trip-reports", `--expected-deployment=${deployment}`,
  ]);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /Batch 1\/1: ✗/);
});

test("the substance import exits nonzero when its bulk mutation rejects", async () => {
  mkdirSync(join(workspace, "src", "data"), { recursive: true });
  writeFileSync(join(workspace, "src", "data", "SubstanceIndex.json"), JSON.stringify([{ id: 1, title: "Placeholder", slug: "placeholder" }]));
  const result = await run("scripts/migrate/migrate-substance-index-to-data.mjs", [
    "--write", "--confirm-write=migrate-substanceindex-json-to-postgres", `--expected-deployment=${deployment}`,
  ]);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /Batch 1\/1 \(1 articles\)\.\.\. error:/);
});

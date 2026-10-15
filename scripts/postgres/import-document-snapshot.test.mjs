import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = "scripts/postgres/import-document-snapshot.ts";

let server;
let connections = 0;
let target;
let deployment;
let exportDirectory;

before(async () => {
  server = net.createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  target = `postgres://127.0.0.1:${server.address().port}/dosewiki`;
  deployment = "127.0.0.1/dosewiki";
  exportDirectory = mkdtempSync(join(os.tmpdir(), "import-snapshot-test-"));
});

after(async () => {
  await new Promise((done) => server.close(done));
  rmSync(exportDirectory, { recursive: true, force: true });
});

function run(args, env = {}) {
  return new Promise((done) => {
    const child = spawn("bun", ["--no-env-file", script, "--export", exportDirectory, "--tables", "siteConfig", ...args], {
      cwd: repoRoot,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: target, ...env },
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (status) => done({ status, output }));
  });
}

test("the freeze refuses a fully confirmed write before any connection", async () => {
  const before = connections;
  const result = await run(
    ["--write", "--confirm-write=postgres-import", `--expected-deployment=${deployment}`],
    { DATA_WRITES_FROZEN: "1" },
  );
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /DATA_WRITES_FROZEN/);
  assert.equal(connections, before);
});

test("a truncate write needs the truncate-named confirmation", async () => {
  const before = connections;
  const result = await run(["--write", "--truncate", "--confirm-write=postgres-import", `--expected-deployment=${deployment}`]);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /--confirm-write=postgres-import-truncate/);
  assert.equal(connections, before);

  const unconfirmed = await run(["--write", "--truncate"]);
  assert.notEqual(unconfirmed.status, 0, unconfirmed.output);
  assert.match(unconfirmed.output, /--confirm-write=postgres-import-truncate/);
  assert.equal(connections, before);
});

test("a run without write flags prints a plan and writes nothing", async () => {
  const before = connections;
  const result = await run(["--truncate"]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Plan only/);
  assert.match(result.output, /--write --confirm-write=postgres-import-truncate --expected-deployment=127\.0\.0\.1\/dosewiki/);
  assert.equal(connections, before);
});

test("a write without an explicit target names the missing input", async () => {
  const result = await run(
    ["--write", "--confirm-write=postgres-import", `--expected-deployment=${deployment}`],
    { TARGET_POSTGRES_URL: undefined, POSTGRES_DIRECT_URL: target },
  );
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /(?=[^]*--target)(?=[^]*TARGET_POSTGRES_URL)/);
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = "scripts/postgres/rebuild-derived-tables.ts";
const OPERATION = "postgres-rebuild-derived";

let server;
let connections = 0;
let target;
const deployment = "127.0.0.1/dosewiki";

before(async () => {
  server = net.createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  target = `postgres://127.0.0.1:${server.address().port}/dosewiki`;
});

after(async () => {
  await new Promise((done) => server.close(done));
});

function run(args, env = {}) {
  return new Promise((done) => {
    const child = spawn("bun", ["--no-env-file", script, ...args], {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DATA_BACKEND: "postgres",
        REPLICATION_MEDIA_BASE_URL: "https://media.example.invalid",
        TARGET_POSTGRES_URL: target,
        ...env,
      },
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (status) => done({ status, output }));
  });
}

test("a run without write flags prints the plan and performs no mutation", async () => {
  const before = connections;
  const result = await run([]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Plan only/);
  assert.match(result.output, /publicReadIndexes:backfill gallery/);
  assert.match(result.output, new RegExp(`--write --confirm-write=${OPERATION} --expected-deployment=127\\.0\\.0\\.1/dosewiki`));
  assert.equal(connections, before);
});

test("a write without the operation-named confirmation exits nonzero", async () => {
  const before = connections;
  for (const args of [
    ["--write"],
    ["--write", "--confirm-write=rebuild-derived-tables", `--expected-deployment=${deployment}`],
    ["--write", `--confirm-write=${OPERATION}`],
  ]) {
    const result = await run(args);
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, new RegExp(`--confirm-write=${OPERATION}|--expected-deployment=`));
  }
  assert.equal(connections, before);
});

test("the freeze refuses a fully confirmed write before any connection", async () => {
  const before = connections;
  const result = await run(["--write", `--confirm-write=${OPERATION}`, `--expected-deployment=${deployment}`], { DATA_WRITES_FROZEN: "1" });
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /DATA_WRITES_FROZEN/);
  assert.equal(connections, before);
});

test("a write without an explicit target names the missing input", async () => {
  const result = await run(
    ["--write", `--confirm-write=${OPERATION}`, `--expected-deployment=${deployment}`],
    { TARGET_POSTGRES_URL: undefined, POSTGRES_DIRECT_URL: target },
  );
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /(?=[^]*--target)(?=[^]*TARGET_POSTGRES_URL)/);
});

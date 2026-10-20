import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = "scripts/postgres/migrate.ts";
const fakeBin = mkdtempSync(join(tmpdir(), "migrate-launcher-"));
const launchLog = join(fakeBin, "bunx.log");
writeFileSync(
  join(fakeBin, "bunx"),
  `#!/bin/sh\nprintf '%s\\n' "$@" > "${launchLog}"\nprintf 'POSTGRES_DIRECT_URL=%s\\n' "$POSTGRES_DIRECT_URL" >> "${launchLog}"\n`,
);
chmodSync(join(fakeBin, "bunx"), 0o755);
after(() => rmSync(fakeBin, { recursive: true, force: true }));

function run(args, env = {}) {
  rmSync(launchLog, { force: true });
  return spawnSync("bun", ["--no-env-file", script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      PATH: `${fakeBin}:${process.env.PATH}`,
      ...env,
      POSTGRES_DIRECT_URL: "",
      POSTGRES_POOLED_URL: "",
      TARGET_POSTGRES_URL: env.TARGET_POSTGRES_URL ?? "",
      POSTGRES_IMPORT_CONFIRM: env.POSTGRES_IMPORT_CONFIRM ?? "",
    },
  });
}

function assertNotLaunched(result, pattern) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, pattern);
  assert.equal(existsSync(launchLog), false, "drizzle-kit must not start");
}

test("migration help is read-only and needs no target", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Target must be supplied by --target or TARGET_POSTGRES_URL/);
  assert.match(result.stdout, /--confirm-write=postgres-migrate --expected-deployment=<host\/database>/);
});

test("migration refuses an implicit target and arbitrary drizzle flags", () => {
  const missing = run(["--dry-run"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Migration target is required/);

  const forwarded = run(["--target", "postgres://localhost:5432/dosewiki", "--schema", "other.ts"]);
  assert.notEqual(forwarded.status, 0);
  assert.match(forwarded.stderr, /Unknown argument/);
});

test("migration diagnostics redact unknown and invalid target values", () => {
  const password = "synthetic-secret-password";
  const unknown = run([`--target=${syntheticTarget("postgres://localhost/dosewiki", password)}`, "--dry-run"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown argument/);
  assert.doesNotMatch(`${unknown.stdout}${unknown.stderr}`, new RegExp(password));

  const invalid = run(["--target", `not-a-postgres-url-${password}`, "--dry-run"]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /valid postgres/);
  assert.doesNotMatch(`${invalid.stdout}${invalid.stderr}`, new RegExp(password));
});

function syntheticTarget(base, password = "synthetic-secret-password") {
  const target = new URL(base);
  target.username = "synthetic-user";
  target.password = password;
  return target.href;
}

test("migration refuses remote targets before starting drizzle", () => {
  const target = syntheticTarget("postgres://db.example.test/dosewiki");
  const noFlag = run(["--target", target, "--dry-run"]);
  assert.notEqual(noFlag.status, 0);
  assert.match(noFlag.stderr, /Refusing non-local target db\.example\.test/);
  assert.doesNotMatch(`${noFlag.stdout}${noFlag.stderr}`, /synthetic-secret-password/);

  const wrongConfirmation = run(["--target", target, "--allow-remote", "--dry-run"], {
    POSTGRES_IMPORT_CONFIRM: "other.example.test",
  });
  assert.notEqual(wrongConfirmation.status, 0);
  assert.match(wrongConfirmation.stderr, /POSTGRES_IMPORT_CONFIRM must equal db\.example\.test/);
});

test("migration dry-run reports a redacted fixed plan without starting drizzle", () => {
  const target = syntheticTarget("postgres://localhost:5432/dosewiki");
  const result = run(["--target", target, "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Migration target: localhost\/dosewiki/);
  assert.match(result.stdout, /bunx drizzle-kit migrate --config drizzle\.config\.ts/);
  assert.match(result.stdout, /drizzle-kit was not started/);
  assert.doesNotMatch(result.stdout, /synthetic-user|synthetic-secret-password/);
  assert.equal(existsSync(launchLog), false);
});

test("a target alone only plans and never launches drizzle", () => {
  const result = run(["--target", "postgres://localhost:5432/dosewiki"], { DATA_BACKEND: "postgres" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Plan only/);
  assert.match(result.stdout, /--confirm-write=postgres-migrate --expected-deployment=localhost\/dosewiki/);
  assert.equal(existsSync(launchLog), false);
});

test("migration write refuses every missing or wrong confirmation before launching drizzle", () => {
  const target = ["--target", "postgres://127.0.0.1:1/migration-ceremony"];
  const confirm = "--confirm-write=postgres-migrate";
  const deployment = "--expected-deployment=127.0.0.1/migration-ceremony";
  const backend = { DATA_BACKEND: "postgres" };
  assertNotLaunched(run([...target, "--write", confirm, deployment]), /DATA_BACKEND=postgres/);
  assertNotLaunched(run([...target, "--write"], backend), /requires --confirm-write=postgres-migrate/);
  assertNotLaunched(run([...target, "--write", "--confirm-write=migrate", deployment], backend), /requires --confirm-write=postgres-migrate/);
  assertNotLaunched(run([...target, "--write", confirm], backend), /requires --expected-deployment=127\.0\.0\.1\/migration-ceremony/);
  assertNotLaunched(run([...target, "--write", confirm, "--expected-deployment=other/db"], backend), /does not match target deployment/);
  assertNotLaunched(run([...target, "--write", "--dry-run", confirm, deployment], backend), /cannot be combined/);
  assertNotLaunched(run([...target, "--write", "--confirm-write", "postgres-migrate", deployment], backend), /Unknown argument/);
  assertNotLaunched(run([...target, "--write", confirm, deployment], { ...backend, DATA_WRITES_FROZEN: "1" }), /DATA_WRITES_FROZEN/);
});

test("migration freeze still permits reviewing the plan", () => {
  const plan = run(["--target", "postgres://127.0.0.1:1/frozen-migration", "--dry-run"], { DATA_WRITES_FROZEN: "1" });
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /127\.0\.0\.1\/frozen-migration/);
});

test("an authorized migration launches only the fixed drizzle command against the target", () => {
  const target = "postgres://127.0.0.1:1/migration-authorized";
  const result = run(
    ["--target", target, "--write", "--confirm-write=postgres-migrate", "--expected-deployment=127.0.0.1/migration-authorized"],
    { DATA_BACKEND: "postgres", DATA_WRITES_FROZEN: "0" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(launchLog, "utf8"), `drizzle-kit\nmigrate\n--config\ndrizzle.config.ts\nPOSTGRES_DIRECT_URL=${target}\n`);
});

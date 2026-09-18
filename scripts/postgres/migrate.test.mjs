import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = "scripts/postgres/migrate.ts";

function run(args, env = {}) {
  return spawnSync("bun", [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      ...env,
      POSTGRES_DIRECT_URL: "",
      POSTGRES_POOLED_URL: "",
      TARGET_POSTGRES_URL: env.TARGET_POSTGRES_URL ?? "",
      POSTGRES_IMPORT_CONFIRM: env.POSTGRES_IMPORT_CONFIRM ?? "",
    },
  });
}

test("migration help is read-only and needs no target", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Target must be supplied by --target or TARGET_POSTGRES_URL/);
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
});

test("migration freeze refuses execution but permits reviewing the dry-run plan", () => {
  const args = ["--target", "postgres://127.0.0.1:1/frozen-migration"];
  const env = { DATA_WRITES_FROZEN: "1" };
  const refused = run(args, env);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /DATA_WRITES_FROZEN/);
  const plan = run([...args, "--dry-run"], env);
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /127\.0\.0\.1\/frozen-migration/);
});

/**
 * A preview-shaped environment (VERCEL_ENV=preview) must never
 * resolve a production writer through an implicit target or a retired backend.
 *
 *   bun scripts/postgres/check-env-isolation.ts
 *
 * Runs the three script-side boundaries (`createProductionWriteCommand`,
 * `createDataOpsRunContext`, `createDataClient`) against synthetic
 * environments in which only the browser / app fallback variables point at a
 * production-shaped host, with the full write ceremony on argv, and requires
 * every one of them to refuse. It then proves the explicit path still works so
 * the refusals are not a broken ceremony. Exits non-zero on any leak.
 *
 * Privileged writes require --target or TARGET_POSTGRES_URL. App read URLs never
 * select a write target. Remote access additionally requires --allow-remote and
 * POSTGRES_IMPORT_CONFIRM for the exact hostname. Retired backend selectors
 * never select a normal backend, even when paired with a valid write ceremony.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
} from "../lib/production-write-command.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import { createDataClient } from "../lib/data-client.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RETIRED_SOURCE = "https://retired.example.invalid";
/** Synthetic fixture only: a fake host with placeholder userinfo, assembled so no credential-shaped literal appears in source. */
const POSTGRES_PROD = ["postgres:", "", "writer:placeholder@db.example.planetscale.internal:6432", "dosewiki"].join("/");
const POSTGRES_PROD_FINGERPRINT = "db.example.planetscale.internal/dosewiki";
const OPERATION = "check-env-isolation";

type Check = { backend: "postgres"; check: string; pass: boolean; detail?: string };
const checks: Check[] = [];

function refuses(backend: Check["backend"], check: string, run: () => unknown, expected: RegExp): void {
  try {
    run();
    checks.push({ backend, check, pass: false, detail: "no error thrown" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const pass = expected.test(message);
    checks.push({ backend, check, pass, ...(pass ? {} : { detail: message }) });
  }
}

function allows(backend: Check["backend"], check: string, run: () => unknown): void {
  try {
    run();
    checks.push({ backend, check, pass: true });
  } catch (error) {
    checks.push({ backend, check, pass: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

const legacyOnlyEnv: NodeJS.ProcessEnv = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  RETIRED_BACKEND_URL: RETIRED_SOURCE,
  VITE_RETIRED_BACKEND_URL: RETIRED_SOURCE,
  NEXT_PUBLIC_RETIRED_BACKEND_URL: RETIRED_SOURCE,
  DATA_ADMIN_KEY: "fixture-admin-key",
};

const previewPostgresEnv: NodeJS.ProcessEnv = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  DATA_BACKEND: "postgres",
  POSTGRES_POOLED_URL: POSTGRES_PROD,
  POSTGRES_DIRECT_URL: POSTGRES_PROD,
  DATA_ADMIN_KEY: "leaked-admin-key",
};

const postgresCeremony = ["--write", "--execute", `--confirm-write=${OPERATION}`, `--expected-deployment=${POSTGRES_PROD_FINGERPRINT}`];

refuses("postgres", "production writer refuses missing backend even with legacy selectors", () => {
  assertProductionWriteAllowed(createProductionWriteCommand({ operation: OPERATION, argv: postgresCeremony, env: legacyOnlyEnv, loadsEnvLocal: false }));
}, /DATA_BACKEND/);

refuses("postgres", "data operations refuse missing backend even with legacy selectors", () => {
  assertDataOpsWriteAllowed(createDataOpsRunContext({ operation: OPERATION, intent: "isolation", argv: postgresCeremony, env: legacyOnlyEnv, loadsEnvLocal: false, requiresExecute: true }));
}, /DATA_BACKEND/);

for (const backend of [undefined, "retired-backend", "postgress"]) {
  refuses("postgres", `client refuses backend ${String(backend)} without opening a connection`, () => {
    createDataClient({ argv: [], env: { ...legacyOnlyEnv, DATA_BACKEND: backend, TARGET_RETIRED_BACKEND_URL: RETIRED_SOURCE } });
  }, /DATA_BACKEND/);
}

// Postgres: the app's pooled/direct URLs are read fallbacks, never a writer.
refuses("postgres", "production-write-command ignores POSTGRES_POOLED_URL/POSTGRES_DIRECT_URL", () => {
  assertProductionWriteAllowed(createProductionWriteCommand({ operation: OPERATION, argv: postgresCeremony, env: previewPostgresEnv, loadsEnvLocal: false }));
}, /require TARGET_POSTGRES_URL or --target.*ignored: POSTGRES_POOLED_URL, POSTGRES_DIRECT_URL/);

refuses("postgres", "data-ops run context refuses a fallback key for privileged writes", () => {
  assertDataOpsWriteAllowed(createDataOpsRunContext({ operation: OPERATION, intent: "isolation", argv: postgresCeremony, env: previewPostgresEnv, loadsEnvLocal: false, requiresExecute: true }));
}, /requires --target or TARGET_POSTGRES_URL for privileged writes; POSTGRES_POOLED_URL is not allowed/);

refuses("postgres", "createDataClient refuses a non-loopback fallback host without --allow-remote", () => {
  createDataClient({ argv: [], env: previewPostgresEnv });
}, /Refusing non-local target db\.example\.planetscale\.internal/);

refuses("postgres", "createDataClient refuses --allow-remote without POSTGRES_IMPORT_CONFIRM", () => {
  createDataClient({ argv: ["--allow-remote"], env: previewPostgresEnv });
}, /POSTGRES_IMPORT_CONFIRM must equal db\.example\.planetscale\.internal/);

refuses("postgres", "createDataClient refuses a POSTGRES_IMPORT_CONFIRM for a different host", () => {
  createDataClient({ argv: ["--allow-remote"], env: { ...previewPostgresEnv, POSTGRES_IMPORT_CONFIRM: "other.host" } });
}, /POSTGRES_IMPORT_CONFIRM must equal/);

refuses("postgres", "a wrong --expected-deployment is refused even with an explicit target", () => {
  assertDataOpsWriteAllowed(createDataOpsRunContext({
    operation: OPERATION, intent: "isolation", argv: [...postgresCeremony.slice(0, 3), "--expected-deployment=localhost/dosewiki"],
    env: { ...previewPostgresEnv, TARGET_POSTGRES_URL: POSTGRES_PROD }, loadsEnvLocal: false, requiresExecute: true,
  }));
}, /Expected deployment localhost\/dosewiki does not match target deployment db\.example\.planetscale\.internal\/dosewiki/);

allows("postgres", "explicit TARGET_POSTGRES_URL, confirm var, and fingerprint still pass the guards", () => {
  const env = { ...previewPostgresEnv, TARGET_POSTGRES_URL: POSTGRES_PROD, POSTGRES_IMPORT_CONFIRM: "db.example.planetscale.internal" };
  assertProductionWriteAllowed(createProductionWriteCommand({ operation: OPERATION, argv: postgresCeremony, env, loadsEnvLocal: false }));
  assertDataOpsWriteAllowed(createDataOpsRunContext({ operation: OPERATION, intent: "isolation", argv: postgresCeremony, env, loadsEnvLocal: false, requiresExecute: true }));
  // Construction only; the lazy client opens no connection until first use.
  const created = createDataClient({ argv: ["--allow-remote"], env });
  if (created.fingerprint !== POSTGRES_PROD_FINGERPRINT) throw new Error(`fingerprint ${created.fingerprint}`);
});

allows("postgres", "a loopback target needs neither --allow-remote nor POSTGRES_IMPORT_CONFIRM", () => {
  createDataClient({ argv: ["--target", "postgres://localhost:5432/dosewiki"], env: { NODE_ENV: "test", DATA_BACKEND: "postgres" } });
});

for (const check of checks) {
  console.log(`${check.pass ? "ok  " : "FAIL"} ${check.backend}: ${check.check}${check.detail ? ` (${check.detail})` : ""}`);
}
const passed = checks.filter((check) => check.pass).length;
const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-env-isolation`);
fs.mkdirSync(runDirectory, { recursive: true });
fs.writeFileSync(path.join(runDirectory, "report.json"), JSON.stringify({ passed, failed: checks.length - passed, checks }, null, 2));
console.log(`Report: ${path.relative(ROOT, runDirectory)}/report.json`);
console.log(JSON.stringify({ passed, failed: checks.length - passed }));
process.exit(checks.length === passed ? 0 : 1);

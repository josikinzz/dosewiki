import { spawnSync } from "node:child_process";
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
import { guardTarget, resolveTarget } from "./targetGuard.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RETIRED_SOURCE = "https://retired.example.invalid";
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

const deliveryEnv = { REPLICATION_MEDIA_BASE_URL: "https://media.example.invalid" };

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

refuses("postgres", "data-ops run context refuses a confirmed write while writes are frozen", () => {
  const env = { ...previewPostgresEnv, TARGET_POSTGRES_URL: POSTGRES_PROD, POSTGRES_IMPORT_CONFIRM: "db.example.planetscale.internal", DATA_WRITES_FROZEN: "1" };
  assertDataOpsWriteAllowed(createDataOpsRunContext({ operation: OPERATION, intent: "isolation", argv: [...postgresCeremony, "--allow-remote"], env, loadsEnvLocal: false, requiresExecute: true }));
}, /Data writes are frozen/);

refuses("postgres", "data-ops run context refuses a confirmed remote write without --allow-remote", () => {
  const env = { ...previewPostgresEnv, TARGET_POSTGRES_URL: POSTGRES_PROD, POSTGRES_IMPORT_CONFIRM: "db.example.planetscale.internal" };
  assertDataOpsWriteAllowed(createDataOpsRunContext({ operation: OPERATION, intent: "isolation", argv: postgresCeremony, env, loadsEnvLocal: false, requiresExecute: true }));
}, /Refusing non-local target db\.example\.planetscale\.internal/);

allows("postgres", "explicit TARGET_POSTGRES_URL, confirm var, and fingerprint still pass the guards", () => {
  const env = { ...previewPostgresEnv, ...deliveryEnv, TARGET_POSTGRES_URL: POSTGRES_PROD, POSTGRES_IMPORT_CONFIRM: "db.example.planetscale.internal" };
  assertProductionWriteAllowed(createProductionWriteCommand({ operation: OPERATION, argv: postgresCeremony, env, loadsEnvLocal: false }));
  assertDataOpsWriteAllowed(createDataOpsRunContext({ operation: OPERATION, intent: "isolation", argv: [...postgresCeremony, "--allow-remote"], env, loadsEnvLocal: false, requiresExecute: true }));
  const created = createDataClient({ argv: ["--allow-remote"], env });
  if (created.fingerprint !== POSTGRES_PROD_FINGERPRINT) throw new Error(`fingerprint ${created.fingerprint}`);
});

allows("postgres", "a loopback target needs neither --allow-remote nor POSTGRES_IMPORT_CONFIRM", () => {
  createDataClient({ argv: ["--target", "postgres://localhost:5432/dosewiki"], env: { NODE_ENV: "test", DATA_BACKEND: "postgres", ...deliveryEnv } });
});

refuses("postgres", "resolveTarget ignores POSTGRES_POOLED_URL/POSTGRES_DIRECT_URL", () => {
  resolveTarget(postgresCeremony, previewPostgresEnv);
}, /Postgres target is required: pass --target <url> or set TARGET_POSTGRES_URL/);

allows("postgres", "guardTarget treats bracketed IPv6 loopback as local", () => {
  guardTarget("postgres://[::1]:5432/dosewiki", false, {});
});

const RESOLVER_SCRIPT_ARGS: Record<string, string[]> = {
  "scripts/postgres/import-document-snapshot.ts": ["--export", path.join(ROOT, "runs", "env-isolation-missing-export")],
};

function resolverScripts(): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "deprecated") walk(full);
        continue;
      }
      if (!/\.(?:ts|mjs)$/.test(entry.name) || /\.(?:test|spec)\./.test(entry.name)) continue;
      if (entry.name.startsWith("targetGuard.") || full === fileURLToPath(import.meta.url)) continue;
      const source = fs.readFileSync(full, "utf8");
      if (/from "[./]+(?:postgres\/)?targetGuard(?:\.ts)?"/.test(source) && /\bresolveTarget\(/.test(source)) {
        found.push(path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, "scripts"));
  return found.sort();
}

const scriptEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, ...previewPostgresEnv };
for (const script of resolverScripts()) {
  const result = spawnSync(process.execPath, ["--no-env-file", script, ...(RESOLVER_SCRIPT_ARGS[script] ?? []), ...postgresCeremony], {
    cwd: ROOT, env: scriptEnv, encoding: "utf8", timeout: 60_000,
  });
  const output = `${result.stdout}${result.stderr}`;
  const pass = result.status !== null && result.status !== 0 && /Postgres target is required/.test(output);
  checks.push({
    backend: "postgres",
    check: `${script} refuses the app URLs without an explicit target`,
    pass,
    ...(pass ? {} : { detail: `exit ${result.status}: ${output.trim().split("\n").slice(-3).join(" | ")}` }),
  });
}

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

/**
 * Ticket 19: `npm run postgres:migrate` (drizzle-kit migrate over
 * lib/postgres/migrations) is the only schema path. This check fails when the
 * Drizzle schema (`lib/postgres/schema.generated.ts` + `schema.runtime.ts`)
 * has drifted from the latest migration snapshot, which would mean a change
 * reached the schema-as-code without a versioned migration behind it.
 *
 *   bun scripts/postgres/verify-migrations.ts
 *
 * drizzle-kit has no dry-run flag, so the check copies the migrations
 * directory into a gitignored scratch folder, runs `drizzle-kit generate`
 * against the copy through a temporary config, and treats any newly written
 * migration as drift (its SQL is printed). The repository's migrations are
 * never touched. Two static invariants are checked alongside:
 *
 *   - every `_journal.json` entry has its SQL file and snapshot, and no SQL
 *     file exists outside the journal;
 *   - no package script runs `drizzle-kit push`, and no DDL (CREATE / ALTER /
 *     DROP TABLE, CREATE INDEX) lives outside lib/postgres/migrations.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = path.join(ROOT, "lib", "postgres", "migrations");
const DDL_PATTERN = /\b(?:CREATE|ALTER|DROP)\s+TABLE\b|\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/;
const DDL_SCAN_ROOTS = ["lib", "scripts", "src/app/api", "convex"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs", ".sql"]);

type Check = { check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
function expect(check: string, pass: boolean, detail?: unknown): void {
  checks.push({ check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "deprecated") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function journalIntegrity(): void {
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const sqlFiles = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  const journalTags = journal.entries.map((entry) => `${entry.tag}.sql`).sort();
  expect("every journal entry has its SQL file and snapshot", journal.entries.every((entry) =>
    fs.existsSync(path.join(MIGRATIONS, `${entry.tag}.sql`))
    && fs.existsSync(path.join(MIGRATIONS, "meta", `${String(entry.idx).padStart(4, "0")}_snapshot.json`))), journalTags);
  expect("no SQL file exists outside the journal", JSON.stringify(sqlFiles) === JSON.stringify(journalTags), { sqlFiles, journalTags });
}

function singleSchemaPath(): void {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const drizzleScripts = Object.entries(pkg.scripts).filter(([, command]) => command.includes("drizzle-kit"));
  const pushers = drizzleScripts.filter(([, command]) => /drizzle-kit\s+push/.test(command)).map(([name]) => name);
  const migrators = drizzleScripts.filter(([, command]) => /drizzle-kit\s+migrate/.test(command)).map(([name]) => name);
  expect("no package script runs drizzle-kit push", pushers.length === 0, pushers);
  expect("postgres:migrate is the only drizzle-kit migrate script", JSON.stringify(migrators) === JSON.stringify(["postgres:migrate"]), migrators);

  const offenders = DDL_SCAN_ROOTS.flatMap((relative) => walk(path.join(ROOT, relative)))
    .filter((file) => !file.startsWith(MIGRATIONS + path.sep) && file !== fileURLToPath(import.meta.url))
    .filter((file) => DDL_PATTERN.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(ROOT, file));
  expect("no DDL outside lib/postgres/migrations", offenders.length === 0, offenders);
}

function schemaDrift(): void {
  const scratch = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-verify-migrations`);
  const scratchMigrations = path.join(scratch, "migrations");
  fs.mkdirSync(scratch, { recursive: true });
  fs.cpSync(MIGRATIONS, scratchMigrations, { recursive: true });
  // drizzle-kit prefixes `out` with "./", so the temporary config must use a repo-relative path.
  const relativeOut = path.relative(ROOT, scratchMigrations).split(path.sep).join("/");
  const relativeBase = path.relative(scratch, path.join(ROOT, "drizzle.config.ts")).split(path.sep).join("/").replace(/\.ts$/, "");
  const configPath = path.join(scratch, "drizzle.config.ts");
  fs.writeFileSync(configPath, `import base from "${relativeBase}";\nexport default { ...base, out: "${relativeOut}", verbose: false };\n`);
  const before = new Set(fs.readdirSync(scratchMigrations));
  const result = spawnSync("bunx", ["drizzle-kit", "generate", "--config", path.relative(ROOT, configPath)], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, POSTGRES_DIRECT_URL: process.env.POSTGRES_DIRECT_URL ?? "postgres://localhost:5432/dosewiki" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  expect("drizzle-kit generate ran against the scratch copy", result.status === 0, result.status === 0 ? undefined : output.trim().split("\n").slice(-10));
  const added = fs.readdirSync(scratchMigrations).filter((name) => !before.has(name) && name.endsWith(".sql"));
  const drift = added.map((name) => ({ migration: name, sql: fs.readFileSync(path.join(scratchMigrations, name), "utf8") }));
  expect("schema.generated.ts and schema.runtime.ts match the latest snapshot", drift.length === 0 && /No schema changes/.test(output), drift.length ? drift : output.trim().split("\n").slice(-3));
  fs.writeFileSync(path.join(scratch, "report.json"), JSON.stringify({ output, added: drift, checks }, null, 2));
  console.log(`Report: ${path.relative(ROOT, scratch)}/report.json`);
}

journalIntegrity();
singleSchemaPath();
schemaDrift();

const passed = checks.filter((check) => check.pass).length;
console.log(JSON.stringify({ passed, failed: checks.length - passed }));
process.exit(passed === checks.length ? 0 : 1);

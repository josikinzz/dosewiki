import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = path.join(ROOT, "lib", "postgres", "migrations");

type Check = { check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
function expect(check: string, pass: boolean, detail?: unknown): void {
  checks.push({ check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
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


function schemaDrift(): void {
  const scratch = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-verify-migrations`);
  const scratchMigrations = path.join(scratch, "migrations");
  fs.mkdirSync(scratch, { recursive: true });
  fs.cpSync(MIGRATIONS, scratchMigrations, { recursive: true });
  const relativeOut = path.relative(ROOT, scratchMigrations).split(path.sep).join("/");
  const relativeBase = path.relative(scratch, path.join(ROOT, "drizzle.config.ts")).split(path.sep).join("/").replace(/\.ts$/, "");
  const configPath = path.join(scratch, "drizzle.config.ts");
  fs.writeFileSync(configPath, `import base from "${relativeBase}";\nexport default { ...base, out: "${relativeOut}", verbose: false };\n`);
  const before = new Set(fs.readdirSync(scratchMigrations));
  const result = spawnSync("bunx", ["drizzle-kit", "generate", "--config", path.relative(ROOT, configPath)], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: os.devNull,
      POSTGRES_DIRECT_URL: "postgres://localhost:5432/dosewiki",
    },
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
schemaDrift();

const passed = checks.filter((check) => check.pass).length;
console.log(JSON.stringify({ passed, failed: checks.length - passed }));
process.exit(passed === checks.length ? 0 : 1);

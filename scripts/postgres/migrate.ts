#!/usr/bin/env bun
/**
 * Apply the repository's versioned Drizzle migrations to one explicit target.
 *
 *   bun scripts/postgres/migrate.ts --target <postgres-url> [--allow-remote]
 *   TARGET_POSTGRES_URL=<postgres-url> bun scripts/postgres/migrate.ts [--allow-remote]
 *   bun scripts/postgres/migrate.ts --target <postgres-url> --dry-run
 */

import { spawnSync } from "node:child_process";
import { guardTarget } from "./targetGuard.ts";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze";

const CONFIG_PATH = "drizzle.config.ts";
const HELP = `Usage: bun scripts/postgres/migrate.ts --target <postgres-url> [--allow-remote] [--dry-run]

Target must be supplied by --target or TARGET_POSTGRES_URL.
Remote targets additionally require --allow-remote and
POSTGRES_IMPORT_CONFIRM=<hostname>.

--dry-run validates the target and prints the fixed migration plan without
starting drizzle-kit or opening a database connection.`;

function argumentValue(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function validateArguments(argv: string[]): void {
  const accepted = ["--target", "--allow-remote", "--dry-run", "--help", "-h"];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!accepted.includes(argument)) throw new Error("Unknown argument. Run with --help for supported options.");
    if (argument === "--target") index += 1;
  }
}

function targetFrom(argv: string[], env: NodeJS.ProcessEnv): string {
  const target = argumentValue(argv, "--target") ?? env.TARGET_POSTGRES_URL?.trim();
  if (!target) throw new Error("Migration target is required: pass --target or set TARGET_POSTGRES_URL");
  return target;
}
function parsePostgresTarget(target: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error("Migration target must be a valid postgres:// URL.");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !parsed.hostname ||
    !parsed.pathname.replace(/^\/+/, "")
  ) {
    throw new Error("Migration target must be a valid postgres:// URL naming one host and database.");
  }
  return parsed;
}


export function migrationPlan(argv: string[], env: NodeJS.ProcessEnv = process.env) {
  validateArguments(argv);
  const target = targetFrom(argv, env);
  const parsed = parsePostgresTarget(target);
  guardTarget(target, argv.includes("--allow-remote"), env);
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  return {
    target: `${parsed.hostname}/${database}`,
    command: ["bunx", "drizzle-kit", "migrate", "--config", CONFIG_PATH],
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }

  const plan = migrationPlan(argv);
  console.log(`Migration target: ${plan.target}`);
  console.log(`Migration command: ${plan.command.join(" ")}`);
  if (argv.includes("--dry-run")) {
    console.log("Dry run: drizzle-kit was not started and no database connection was opened.");
    return;
  }

  assertDataWritesNotFrozen("postgres:migrate");

  const target = targetFrom(argv, process.env);
  const result = spawnSync(plan.command[0], plan.command.slice(1), {
    stdio: "inherit",
    env: { ...process.env, POSTGRES_DIRECT_URL: target },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (import.meta.main) main();

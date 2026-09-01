#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildProjection, DEFAULT_CAMPAIGN_DIR, validateProjection } from "./projection.mjs";

function parseArgs(argv) {
  const options = { campaignDir: DEFAULT_CAMPAIGN_DIR, mode: null, out: null, projection: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.mode = "check";
    else if (arg === "--dry-run") options.mode = "dry-run";
    else if (arg === "--campaign-dir") options.campaignDir = argv[++index];
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--projection") options.projection = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.mode) throw new Error("Choose exactly one of --check or --dry-run.");
  if (argv.includes("--check") && argv.includes("--dry-run")) throw new Error("--check and --dry-run are mutually exclusive.");
  if (options.mode === "dry-run" && !options.out) throw new Error("--dry-run requires --out for its local projection artifact.");
  return options;
}

export function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const projection = options.projection
    ? validateProjection(JSON.parse(readFileSync(options.projection, "utf8")))
    : validateProjection(buildProjection({ campaignDir: options.campaignDir }));
  if (options.mode === "dry-run") {
    mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(projection, null, 2)}\n`);
  }
  const result = {
    mode: options.mode === "check" ? "check-no-write" : "local-dry-run",
    networkCalls: 0,
    productionWrites: 0,
    output: options.out,
    projectionSha256: projection.projectionSha256,
    counts: projection.counts,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

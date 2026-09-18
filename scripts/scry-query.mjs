#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { getFlagValue, hasFlag, loadEnvFiles } from "./lib/data-ops-run-context.mjs";
import { queryScry } from "./lib/scry-client.mjs";

function usage() {
  return `Usage:
  npm run scry:query -- --sql "SELECT title, source FROM scry.entities LIMIT 5"
  npm run scry:query -- --file query.sql --budget 0.05

Options:
  --sql=<query>       SQL query to send to Scry.
  --file=<path>       Read SQL from a local file.
  --budget=<amount>   Optional X-Scry-Budget cap for the request.
  --raw               Print the response body without JSON formatting.
`;
}

function getOptionValue(argv, name) {
  const equalsValue = getFlagValue(argv, name);
  if (equalsValue !== null) {
    return equalsValue;
  }

  const index = argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function readSql(argv) {
  const sql = getOptionValue(argv, "--sql");
  if (sql !== null) {
    return sql;
  }

  const filePath = getOptionValue(argv, "--file");
  if (filePath !== null) {
    return readFileSync(filePath, "utf8");
  }

  return null;
}

async function main() {
  const argv = process.argv.slice(2);

  if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    console.log(usage());
    return;
  }

  loadEnvFiles();

  const sql = readSql(argv);
  if (!sql || !sql.trim()) {
    throw new Error(`Missing Scry SQL query.\n\n${usage()}`);
  }

  const result = await queryScry(sql, {
    budget: getOptionValue(argv, "--budget"),
  });

  if (hasFlag(argv, "--raw") || typeof result.body === "string") {
    console.log(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
    return;
  }

  console.log(JSON.stringify(result.body, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

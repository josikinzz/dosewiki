#!/usr/bin/env node

import { createDataClient } from "../lib/data-client.ts";

import {
  createProductionWriteCommand,
  executeProductionWrite,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

function getFlagValue(argv, name) {
  const prefix = `${name}=`;
  return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function operationForFunction(functionName) {
  return `data-admin-${functionName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function intentForFunction(functionName) {
  const namespace = functionName.split(":", 1)[0];
  return {
    substanceIndex: "editorArticleWrite",
    prompts: "promptMigrationWrite",
    quotes: "quoteMigrationWrite",
    contributorProfiles: "profileMediaWrite",
    replications: "replicationMaintenance",
    articleSources: "articleSourceMigration",
    citationEvidence: "citationEvidenceWrite",
  }[namespace] ?? operationForFunction(functionName);
}

function printUsage() {
  console.log(`
Postgres Admin CLI

Queries:
  node scripts/admin/data-admin.mjs <function> [args-json] --query \\
    --source-url=postgresql://localhost/dosewiki

Mutations (dry-run by default):
  node scripts/admin/data-admin.mjs <function> [args-json] \\
    --target=postgresql://localhost/dosewiki

Production write ceremony:
  --write
  --confirm-write=data-admin-<normalized-function-name>
  --expected-deployment=<deployment-name>

Options:
  --query                         Run a read-only query
  --source-url=<url>              Explicit query deployment
  --target=<url>              Explicit mutation deployment
  --intent=<admin-intent>         Select the narrowest available admin token
  --write                         Enable mutation mode
  --confirm-write=<operation>     Confirm this exact operation
  --expected-deployment=<name>    Confirm the target deployment fingerprint
  --help                          Show this help

Credentials are read from the intent-specific DATA_ADMIN_TOKEN_* variable
when available, with DATA_ADMIN_KEY retained as a compatibility fallback.
Never include apiKey in args-json.
`);
}

function parseFunctionArgs(argv) {
  const positional = argv.filter((entry) => !entry.startsWith("--"));
  const functionName = positional[0];
  const argsJson = positional[1];
  if (!functionName) {
    throw new Error("Function name required.");
  }

  let parsedArgs = {};
  if (argsJson) {
    try {
      parsedArgs = JSON.parse(argsJson);
    } catch (error) {
      throw new Error(`Invalid JSON args: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!parsedArgs || Array.isArray(parsedArgs) || typeof parsedArgs !== "object") {
    throw new Error("args-json must be a JSON object.");
  }
  if (Object.hasOwn(parsedArgs, "apiKey")) {
    throw new Error("Do not pass apiKey in args-json; use a credential environment variable.");
  }
  return { functionName, parsedArgs };
}

function redactSensitiveArgs(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveArgs);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      /(?:api[-_]?key|token|secret|password|authorization)/i.test(key)
        ? "[REDACTED]"
        : redactSensitiveArgs(nested),
    ]),
  );
}

async function runQuery({ argv, functionName, parsedArgs }) {
  const sourceUrl =
    getFlagValue(argv, "--source-url") ??
    process.env.SOURCE_POSTGRES_URL ??
    process.env.SOURCE_POSTGRES_URL;
  if (!sourceUrl) {
    throw new Error("Queries require --source-url or SOURCE_POSTGRES_URL.");
  }

  console.log(`Running query: ${functionName}`);
  console.log(`Source: ${new URL(sourceUrl).hostname}`);
  console.log("Args:", redactSensitiveArgs(parsedArgs));
  const result = await createDataClient({ target: sourceUrl }).client.query(functionName, parsedArgs);
  console.log("Result:", JSON.stringify(result, null, 2));
}

async function runMutation({ argv, functionName, parsedArgs }) {
  const operation = operationForFunction(functionName);
  const command = createProductionWriteCommand({ operation, argv });
  printProductionWriteCommand(command);
  console.log(`Function: ${functionName}`);
  console.log("Args:", redactSensitiveArgs(parsedArgs));

  const result = await executeProductionWrite(command, async () => {
    const intent = getFlagValue(argv, "--intent") ?? intentForFunction(functionName);
    const credential = requireProductionWriteCredential(intent);
    const client = createDataClient({ target: command.targetUrl }).client;
    return await client.mutation(functionName, {
      ...parsedArgs,
      apiKey: credential.token,
    });
  });

  if (result?.status === "dry-run") {
    console.log(
      `Dry run only. To write, add --write --confirm-write=${operation} ` +
        "--expected-deployment=<deployment-name>.",
    );
    return;
  }
  console.log("Result:", JSON.stringify(result, null, 2));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.length === 0) {
    printUsage();
    return;
  }

  const { functionName, parsedArgs } = parseFunctionArgs(argv);
  if (argv.includes("--query")) {
    await runQuery({ argv, functionName, parsedArgs });
    return;
  }
  await runMutation({ argv, functionName, parsedArgs });
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

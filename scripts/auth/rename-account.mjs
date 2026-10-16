#!/usr/bin/env node

import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { makeFunctionReference } from "../../lib/postgres/runtime/api.ts";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "rename-account";
const renameAccount = makeFunctionReference("memberships:renameAccount");

function requiredFlag(argv, name) {
  const value = getFlagValue(argv, `--${name}`)?.trim();
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const plan = {
    fromUsername: requiredFlag(argv, "from"),
    toUsername: requiredFlag(argv, "to"),
    toEmail: requiredFlag(argv, "email"),
    toName: requiredFlag(argv, "name"),
  };

  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  printProductionWriteCommand(command);
  console.log(`Plan: rename ${plan.fromUsername} to ${plan.toUsername} (${plan.toEmail}), shown as ${plan.toName}.`);
  if (command.dryRun) {
    console.log("Dry run: pass --write to rename.");
    return;
  }
  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("legacyAdmin");

  const client = createDataClient({ target: command.targetUrl }).client;
  console.log(`Renaming on ${postgresFingerprintFromUrl(command.targetUrl)}`);
  const result = await client.mutation(renameAccount, { apiKey, ...plan });
  console.log(`  renamed ${result.fromEmail} to ${plan.toEmail.toLowerCase()}`);
  console.log(`  removed unused placeholder(s): ${result.removedPlaceholders.join(", ") || "none"}`);
  console.log(`  moved ${result.movedDrafts} article draft(s)`);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

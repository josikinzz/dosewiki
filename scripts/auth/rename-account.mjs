#!/usr/bin/env node
/**
 * Rename an account in the Postgres `memberships` table, keeping its password.
 *
 * Calls `memberships:renameAccount` with `DATA_ADMIN_KEY`: the username, email
 * and display name change, the password hash stays, and the person signs in
 * under the new username with the password they already use. A row already
 * holding the new username or email is removed only if it never signed in.
 * Their article drafts follow them; history stamped with the old email stays
 * as it is and is attributed through `LEGACY_CONTRIBUTOR_HANDLE_GROUPS`, so set
 * `NEW,OLD` there before running this.
 *
 * Usage (the shared production-write boundary: every flag is required):
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   node scripts/auth/rename-account.mjs --from=witchy --to=lyrea \
 *     --email=lyrea@local.dose.wiki --name=Lyrea --write \
 *     --confirm-write=rename-account --expected-deployment=<fingerprint>
 *
 * Without `--write` the script prints the target and the plan and exits.
 */

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

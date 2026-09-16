#!/usr/bin/env node
/**
 * Seed (or reset) admin accounts in the Postgres `memberships` table.
 *
 * Prompts on the terminal for each admin's username, email, display name,
 * and password (hidden input, typed twice), hashes the password locally with
 * the same scrypt scheme the app verifies against, and calls
 * `memberships:setAdminAccount` with `DATA_ADMIN_KEY`. Re-running for an
 * existing username rotates that account's password and forces role admin.
 *
 * Passwords are never read from env, files, or argv. Nothing is printed
 * except the outcome per account.
 *
 * Usage (the shared production-write boundary: every flag is required):
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   node scripts/auth/seed-admin-accounts.mjs --write \
 *     --confirm-write=seed-admin-accounts --expected-deployment=<fingerprint>
 *
 * Without `--write` the script only prints the target and exits. The
 * fingerprint is printed by the dry run. `DATA_ADMIN_KEY` comes from the
 * environment or `.env.local`; the ambiguous `POSTGRES_DIRECT_URL` fallbacks are refused
 * on purpose: this writes admin credentials and must name its deployment.
 */

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { makeFunctionReference } from "../../lib/postgres/runtime/api.ts";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { hashPassword, validateNewPassword } from "./password-hash.mjs";

const OPERATION = "seed-admin-accounts";
const setAdminAccount = makeFunctionReference("memberships:setAdminAccount");

async function ask(rl, question) {
  return (await rl.question(question)).trim();
}

/**
 * Reads a line with echo suppressed. readline's `question` still writes the
 * prompt; the output hook swallows everything after it until Enter.
 */
async function askHidden(rl, question) {
  const write = stdout.write.bind(stdout);
  stdout.write(question);
  let muted = true;
  stdout.write = (chunk, ...rest) => (muted ? true : write(chunk, ...rest));
  try {
    return await rl.question("");
  } finally {
    muted = false;
    stdout.write = write;
    write("\n");
  }
}

async function askPassword(rl) {
  while (true) {
    const password = await askHidden(rl, "  password (hidden, 12+ chars): ");
    const problem = validateNewPassword(password);
    if (problem) {
      console.log(`  ${problem}`);
      continue;
    }
    const confirm = await askHidden(rl, "  confirm password: ");
    if (confirm !== password) {
      console.log("  Passwords did not match; try again.");
      continue;
    }
    return password;
  }
}

/** Prompts for the rest of an account once the username is known. */
async function promptAccountDetails(rl) {
  const email = await ask(rl, "  email: ");
  if (!email.includes("@")) {
    throw new Error("email must be an address");
  }
  const name = await ask(rl, "  display name: ");
  if (!name) {
    throw new Error("display name is required");
  }
  const password = await askPassword(rl);
  return { email, name, password };
}

async function main() {
  if (!stdin.isTTY) {
    throw new Error("Run this from an interactive terminal; it prompts for passwords.");
  }

  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  if (command.dryRun) {
    console.log("Dry run: pass --write to seed accounts.");
    return;
  }
  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("legacyAdmin");

  const client = createDataClient({ target: command.targetUrl }).client;
  const rl = createInterface({ input: stdin, output: stdout });

  console.log(`Seeding admin accounts on ${postgresFingerprintFromUrl(command.targetUrl)}`);
  console.log("Leave the username blank to finish.\n");

  try {
    for (let index = 1; ; index += 1) {
      console.log(`Admin #${index}`);
      const username = await ask(rl, "  username: ");
      if (!username) {
        break;
      }
      const { email, name, password } = await promptAccountDetails(rl);
      const passwordHash = await hashPassword(password);

      const result = await client.mutation(setAdminAccount, {
        apiKey,
        username,
        email,
        name,
        passwordHash,
      });
      console.log(
        `  ${result.created ? "created" : "updated"} admin ${username.toLowerCase()} (${email.toLowerCase()})\n`,
      );
    }
  } finally {
    rl.close();
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

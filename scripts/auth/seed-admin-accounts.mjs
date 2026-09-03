#!/usr/bin/env node
/**
 * Seed (or reset) admin accounts in the Convex `memberships` table.
 *
 * Prompts on the terminal for each admin's username, email, display name,
 * and password (hidden input, typed twice), hashes the password locally with
 * the same scrypt scheme the app verifies against, and calls
 * `memberships:setAdminAccount` with `CONVEX_ADMIN_KEY`. Re-running for an
 * existing username rotates that account's password and forces role admin.
 *
 * Passwords are never read from env, files, or argv. Nothing is printed
 * except the outcome per account.
 *
 * Usage:
 *   TARGET_CONVEX_URL=https://<deployment>.convex.cloud \
 *   node scripts/auth/seed-admin-accounts.mjs [--target-url=<url>]
 *
 * `TARGET_CONVEX_URL` (or `--target-url`) and `CONVEX_ADMIN_KEY` come from the
 * environment or `.env.local`. The ambiguous `CONVEX_URL` fallbacks are refused
 * on purpose: this writes admin credentials and must name its deployment.
 */

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { getFlagValue, loadEnvFiles } from "../lib/data-ops-run-context.mjs";
import { hashPassword, validateNewPassword } from "./password-hash.mjs";

const setAdminAccount = makeFunctionReference("memberships:setAdminAccount");

function resolveTargetUrl(argv, env) {
  const fromFlag = getFlagValue(argv, "--target-url");
  if (fromFlag?.trim()) {
    return fromFlag.trim();
  }
  const fromEnv = env.TARGET_CONVEX_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  throw new Error("Set TARGET_CONVEX_URL or pass --target-url=<deployment url>.");
}

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

  loadEnvFiles({ env: process.env });
  const targetUrl = resolveTargetUrl(process.argv.slice(2), process.env);
  const apiKey = process.env.CONVEX_ADMIN_KEY?.trim();
  if (!apiKey) {
    throw new Error("CONVEX_ADMIN_KEY is not set.");
  }

  const client = new ConvexHttpClient(targetUrl);
  const rl = createInterface({ input: stdin, output: stdout });

  console.log(`Seeding admin accounts on ${targetUrl}`);
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

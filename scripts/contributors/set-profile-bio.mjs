#!/usr/bin/env node
import fs from "node:fs";
import { createDataClient, resolvePostgresSource, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import {
  authorizeProductionWrite,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "set-contributor-profile-bio";

export function readBioFile(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

export function planBioChange(profile, bio) {
  if (!profile) {
    return { action: "missing" };
  }
  const before = profile.bio ?? "";
  if (before === bio) {
    return { action: "unchanged", before };
  }
  return { action: "update", before, after: bio };
}

function printBlock(label, value) {
  console.log(`\n${label}:\n`);
  for (const line of value.split("\n")) {
    console.log(`  | ${line}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  printProductionWriteCommand(command);
  if (command.writeRequested) authorizeProductionWrite(command);

  const key = getFlagValue(argv, "--key")?.trim().toUpperCase();
  const bioFile = getFlagValue(argv, "--bio-file");
  if (!key || !bioFile) {
    throw new Error("Usage: --key=<PROFILE_KEY> --bio-file=<path> [--write ...]");
  }

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;
  if (!readUrl) {
    throw new Error(
      "Set TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL) so the script knows which deployment to read.",
    );
  }

  const bio = readBioFile(bioFile);
  const client = createDataClient({ target: readUrl }).client;
  const profile = await client.query(api.contributorProfiles.getByKey, { key });
  const plan = planBioChange(profile, bio);

  if (plan.action === "missing") {
    throw new Error(`Profile ${key} does not exist on ${postgresFingerprintFromUrl(readUrl)}.`);
  }
  console.log(`\nProfile ${key} (${profile.displayName})`);
  if (plan.action === "unchanged") {
    console.log("  bio already matches the file; nothing to write.");
    return;
  }
  printBlock("Current bio", plan.before);
  printBlock("Proposed bio", plan.after);

  if (command.dryRun) {
    console.log("\nDry run: no Postgres writes performed.");
    return;
  }

  const { token: apiKey } = requireProductionWriteCredential("profileMediaWrite");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  const live = await writeClient.query(api.contributorProfiles.getEditorProfile, { apiKey, key });
  if ((live?.bio ?? "") !== plan.before) {
    throw new Error(`Profile ${key} changed between planning and writing; re-run to re-plan.`);
  }

  const result = await writeClient.mutation(api.contributorProfiles.saveProfileAsEditor, {
    apiKey,
    key,
    expectedUpdatedAt: live?.updatedAt ?? null,
    operationId: crypto.randomUUID(),
    patch: { bio: plan.after },
  });
  if (!result?.updated || (result.profile?.bio ?? "") !== plan.after) {
    throw new Error(`Profile ${key} write did not read back the proposed bio.`);
  }
  console.log(`\nUpdated bio on ${key}. Revalidate: ${JSON.stringify(result.revalidate)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

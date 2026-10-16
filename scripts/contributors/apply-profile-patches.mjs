#!/usr/bin/env node
import fs from "node:fs";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { verifyProfileAvatarForImport } from "../../lib/runtime/r2MediaStorage.ts";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "apply-contributor-profile-patches";

const EXPECTABLE_FIELDS = new Set([
  "displayName",
  "aliases",
  "links",
  "approved_replicator",
  "exclude_from_gallery",
  "archival",
]);

function liveField(profile, field) {
  switch (field) {
    case "aliases":
      return [...(profile.aliases ?? [])].sort();
    case "links":
      return (profile.links ?? []).map((link) => ({ label: link.label, url: link.url }));
    case "approved_replicator":
    case "exclude_from_gallery":
    case "archival":
      return profile[field] === true;
    default:
      return profile[field];
  }
}

function plannedField(value, field) {
  return field === "aliases" ? [...value].sort() : value;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function satisfied(profile, field, value) {
  if (!EXPECTABLE_FIELDS.has(field)) return false;
  if (field === "aliases") {
    const live = new Set(profile.aliases ?? []);
    return value.every((alias) => live.has(alias.trim().toLowerCase()));
  }
  return same(liveField(profile, field), plannedField(value, field));
}

export function loadPlan(filePath) {
  const plan = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(plan.patches) || plan.patches.length === 0) {
    throw new Error(`Plan ${filePath} lists no patches.`);
  }
  const seen = new Set();
  for (const entry of plan.patches) {
    const key = typeof entry.key === "string" ? entry.key.trim().toUpperCase() : "";
    if (!key) throw new Error("Every plan entry needs a profile key.");
    if (seen.has(key)) throw new Error(`Plan lists ${key} twice.`);
    seen.add(key);
    if (!entry.patch || typeof entry.patch !== "object" || Object.keys(entry.patch).length === 0) {
      throw new Error(`Plan entry ${key} has no patch.`);
    }
    for (const field of Object.keys(entry.expected ?? {})) {
      if (!EXPECTABLE_FIELDS.has(field)) {
        throw new Error(`Plan entry ${key} expects unsupported field "${field}".`);
      }
    }
  }
  return plan.patches.map((entry) => ({ ...entry, key: entry.key.trim().toUpperCase() }));
}

export function planProfilePatches(entries, profilesByKey) {
  return entries.map((entry) => {
    const profile = profilesByKey.get(entry.key) ?? null;
    if (!profile) {
      return { key: entry.key, action: "missing" };
    }
    for (const [field, expected] of Object.entries(entry.expected ?? {})) {
      const live = liveField(profile, field);
      if (!same(live, plannedField(expected, field))) {
        return { key: entry.key, action: "drifted", field, expected, live };
      }
    }
    const settled = Object.entries(entry.patch).every(([field, value]) =>
      satisfied(profile, field, value),
    );
    return {
      key: entry.key,
      action: settled ? "settled" : "update",
      displayName: profile.displayName,
      why: entry.why,
      patch: entry.patch,
      before: Object.fromEntries(
        Object.keys(entry.patch).map((field) => [field, liveField(profile, field)]),
      ),
    };
  });
}

function printRow(row) {
  console.log(`\n${row.key}${row.displayName ? ` (${row.displayName})` : ""}: ${row.action}`);
  if (row.action === "drifted") {
    console.log(`  ${row.field} expected ${JSON.stringify(row.expected)}`);
    console.log(`  ${row.field} live     ${JSON.stringify(row.live)}`);
    return;
  }
  if (row.action === "missing") return;
  if (row.why) console.log(`  why: ${row.why}`);
  for (const [field, value] of Object.entries(row.patch)) {
    console.log(`  ${field}: ${JSON.stringify(row.before[field])}  ->  ${JSON.stringify(value)}`);
  }
}

async function readProfiles(client, keys) {
  const profiles = await Promise.all(
    keys.map(async (key) => [key, await client.query(api.contributorProfiles.getByKey, { key })]),
  );
  return new Map(profiles.filter(([, profile]) => profile !== null));
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  printProductionWriteCommand(command);

  const planFile = getFlagValue(argv, "--plan");
  if (!planFile) {
    throw new Error("Usage: --plan=<path> [--write ...]");
  }

  const readUrl = resolvePostgresSource({ argv }).url;

  const entries = loadPlan(planFile);
  const client = createDataClient({ target: readUrl }).client;
  const rows = planProfilePatches(entries, await readProfiles(client, entries.map((entry) => entry.key)));
  for (const row of rows) printRow(row);

  const blocked = rows.filter((row) => row.action === "missing" || row.action === "drifted");
  const updates = rows.filter((row) => row.action === "update");
  console.log(
    `\n${entries.length} planned: ${updates.length} to write, ${rows.length - updates.length - blocked.length} settled, ${blocked.length} blocked.`,
  );
  if (blocked.length > 0) {
    throw new Error("Re-review the plan: a profile is missing or moved since it was reviewed.");
  }
  if (updates.length === 0) {
    console.log("Nothing to write.");
    return;
  }
  if (command.dryRun) {
    console.log("\nDry run: no Postgres writes performed.");
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("profileMediaWrite");
  const { client: writeClient, fingerprint } = createDataClient({ target: command.targetUrl });

  const liveProfiles = new Map(await Promise.all(entries.map(async (entry) => [
    entry.key,
    await writeClient.query(api.contributorProfiles.getEditorProfile, { apiKey, key: entry.key }),
  ])));
  const live = planProfilePatches(entries, liveProfiles);
  if (live.some((row) => row.action === "missing" || row.action === "drifted")) {
    throw new Error("A profile changed between planning and writing; re-run to re-plan.");
  }

  for (const row of updates) {
    const avatarR2Receipt = row.patch.avatarR2Key && row.patch.avatarR2Key !== liveProfiles.get(row.key)?.avatarR2Key
      ? await verifyProfileAvatarForImport(row.patch.avatarR2Key, row.key, "system@dosewiki.internal", fingerprint)
      : undefined;
    const result = await writeClient.mutation(api.contributorProfiles.saveProfileAsEditor, {
      apiKey,
      key: row.key,
      expectedUpdatedAt: liveProfiles.get(row.key)?.updatedAt ?? null,
      operationId: crypto.randomUUID(),
      patch: row.patch,
      avatarR2Receipt,
    });
    const readBack = result?.profile;
    const landed =
      result?.updated === true &&
      readBack &&
      Object.entries(row.patch).every(
        ([field, value]) => !EXPECTABLE_FIELDS.has(field) || satisfied(readBack, field, value),
      );
    if (!landed) {
      throw new Error(`Profile ${row.key} write did not read back the planned patch.`);
    }
    console.log(`  wrote ${row.key}`);
  }

  console.log(`\nUpdated ${updates.length} profile(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

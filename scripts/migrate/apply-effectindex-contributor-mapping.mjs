#!/usr/bin/env node
/**
 * Apply the Effect Index contributor-name mapping decisions.
 *
 * Effect Index credited three high-volume contributors whose names did not
 * resolve to a dose.wiki profile. "Kaylee" is Kaytwo, so it becomes an alias on
 * the existing profile rather than a second row; Gabriel and Graham get bare
 * profiles to hang their credits on.
 *
 * `contributorProfiles.bulkImport` patches every field it is given, so rows are
 * merged against the live record first and existing non-empty values are always
 * carried through. Default mode is a dry run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";

const SCRIPT_UPDATED_BY = "apply-effectindex-contributor-mapping";
const SEED_PATH = "src/data/config/userProfiles.json";

const mappingDefinitions = [
  {
    key: "KAYTWO",
    addAliases: ["kaylee", "kaytwo"],
    note: "Kaylee is Kaytwo (confirmed 2026-07-27); 185 effect credits and 3 replication artist strings resolve through this alias.",
  },
  {
    key: "GABRIEL",
    addAliases: ["gabriel"],
    note: "124 effect credits; bare profile pending real bio, links, and avatar.",
  },
  {
    key: "GRAHAM",
    addAliases: ["graham"],
    note: "104 effect credits; bare profile pending real bio, links, and avatar.",
  },
];

const argv = process.argv.slice(2);
const writeRequested = argv.includes("--write");
const confirmed = argv.includes("--confirm-contributor-mapping");

const runContext = createDataOpsRunContext({
  operation: "apply Effect Index contributor mapping",
  intent: "dev-convex-import",
  argv: writeRequested ? argv : [...argv, "--dry-run"],
  sourceUrlKeys: [],
  localArtifacts: ["src/data/config/userProfiles.json"],
  confirmationFlag: "--confirm-contributor-mapping",
  destructive: true,
});

if (writeRequested && !confirmed) {
  throw new Error("Live contributor-mapping writes require both --write and --confirm-contributor-mapping.");
}
if (confirmed && !writeRequested) {
  throw new Error("--confirm-contributor-mapping only has effect together with --write.");
}

function normalizeAlias(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function mergeAliases(existing, additions) {
  return Array.from(
    new Set([...(existing ?? []), ...additions].map(normalizeAlias).filter(Boolean)),
  );
}

function readSeedProfiles() {
  const seed = JSON.parse(readFileSync(resolve(process.cwd(), SEED_PATH), "utf8"));
  return new Map(
    seed
      .filter((profile) => typeof profile?.key === "string")
      .map((profile) => [profile.key.trim().toUpperCase(), profile]),
  );
}

function buildRow(definition, existing, seed) {
  if (!existing && !seed) {
    throw new Error(`${definition.key} is neither live in Convex nor present in ${SEED_PATH}.`);
  }

  return {
    key: definition.key,
    // Every field below is written verbatim by bulkImport's patch, so a live
    // value must win over the static seed; the seed only fills a fresh row.
    displayName: existing?.displayName || seed?.displayName || definition.key,
    aliases: mergeAliases([...(existing?.aliases ?? []), ...(seed?.aliases ?? [])], definition.addAliases),
    avatarStorageId: existing?.avatarStorageId,
    avatarUrl: existing?.avatarUrl ?? seed?.avatarUrl,
    bio: existing?.bio || seed?.bio || "",
    links: existing?.links?.length ? existing.links : (seed?.links ?? []),
    membershipEmail: existing?.membershipEmail,
    createdAt: existing?.createdAt,
    updatedBy: SCRIPT_UPDATED_BY,
  };
}

const target = { key: runContext.targetUrlKey, url: requireTargetUrl(runContext) };
const adminKey = requireAdminIntentToken("profileMediaWrite").token;
const client = new ConvexHttpClient(target.url);

const stored = await client.query(api.contributorProfiles.getForBulkImport, {
  apiKey: adminKey,
  keys: mappingDefinitions.map((definition) => definition.key),
});
const existingProfiles = new Map(stored.map((profile) => [profile.key, profile]));

console.log(`Mode: ${writeRequested ? "write requested" : "dry run"}`);
printDataOpsRunContext(runContext);
console.log(`Existing profile lookup: live query (${target.key})`);

const seedProfiles = readSeedProfiles();

const rows = mappingDefinitions.map((definition) => {
  const existing = existingProfiles.get(definition.key) ?? null;
  const row = buildRow(definition, existing, seedProfiles.get(definition.key) ?? null);
  const addedAliases = row.aliases.filter((alias) => !(existing?.aliases ?? []).map(normalizeAlias).includes(alias));

  console.log(
    `${existing ? "UPDATE" : "CREATE"} ${definition.key} | displayName=${row.displayName} | aliases+=${addedAliases.join(",") || "none"} | preserved: bio=${row.bio ? "yes" : "empty"}, links=${row.links.length}, avatar=${row.avatarUrl || row.avatarStorageId ? "yes" : "none"}`,
  );
  console.log(`  ${definition.note}`);

  return row;
});

console.log("\nExact contributorProfiles.bulkImport rows:");
console.log(JSON.stringify(rows, null, 2));

if (!writeRequested) {
  console.log("\nDry run only. No Convex writes performed.");
  process.exit(0);
}

assertDataOpsWriteAllowed(runContext);
const result = await client.mutation(api.contributorProfiles.bulkImport, { apiKey: adminKey, profiles: rows });
console.log(`\nContributor mapping applied. Created: ${result.created}, Updated: ${result.updated}`);

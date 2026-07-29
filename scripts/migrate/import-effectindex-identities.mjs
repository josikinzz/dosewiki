#!/usr/bin/env node
/**
 * Give everyone who had a public profile on the old effectindex.com a
 * contributor profile on the Convex-backed site.
 *
 * A `contributorProfiles` row needs no auth account: `membershipEmail` stays
 * optional and neither the public read nor the materialiser consults it, so
 * `/contributors/<KEY>` works for these rows without anyone logging in.
 *
 * The mapping itself lives in ./effectindex-identity-mapping.mjs and is tested
 * separately. This file is the runner: sources, avatar staging, the existing-row
 * baseline, the printed plan, and the guarded write.
 *
 * Default mode is a dry run. Writes require --write --confirm-ei-import.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import {
  EFFECT_INDEX_IDENTITIES,
  assertNoEmail,
  buildArchiveEntries,
  buildIdentityRows,
} from "./effectindex-identity-mapping.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_SOURCE_DIR = "/Users/josie/Documents/Utilities/EffectIndex-master/effectindex_dump";
const AVATAR_ROOT = path.join(REPO_ROOT, "public/profile-avatars");
const SEED_PATH = "src/data/config/userProfiles.json";
const SCRIPT_UPDATED_BY = "import-effectindex-identities";
const AVATAR_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

/**
 * Index the avatars already staged under public/profile-avatars/<slug>/.
 *
 * These files are committed assets, so the migration only has to point rows at
 * them — there is nothing to download. An identity with no staged file gets no
 * `avatarUrl` and falls through to the existing initial-based fallback.
 */
function indexStagedAvatars() {
  const byKey = new Map();
  const missing = [];

  for (const identity of EFFECT_INDEX_IDENTITIES) {
    const slug = identity.key.toLowerCase();
    const dir = path.join(AVATAR_ROOT, slug);

    if (!existsSync(dir)) {
      missing.push(identity.key);
      continue;
    }

    const file = readdirSync(dir).find(
      (entry) =>
        entry.startsWith("avatar.") && AVATAR_EXTENSIONS.has(path.extname(entry).slice(1).toLowerCase()),
    );

    if (!file) {
      missing.push(identity.key);
      continue;
    }

    byKey.set(identity.key, `/profile-avatars/${slug}/${file}`);
  }

  return { byKey, missing };
}

/**
 * Offline baseline. The committed seed is the artifact the deployed rows were
 * created from, so it is a real baseline rather than an invented one — but it is
 * still a snapshot, and it carries no avatarStorageId or role. Live mode reads
 * the target instead.
 */
function readSeedProfiles() {
  const seed = readJson(path.join(REPO_ROOT, SEED_PATH));
  return new Map(
    seed
      .filter((profile) => typeof profile?.key === "string")
      .map((profile) => [profile.key.trim().toUpperCase(), profile]),
  );
}

const argv = process.argv.slice(2);
const writeRequested = argv.includes("--write");
const confirmed = argv.includes("--confirm-ei-import");
// --online is the default and stays accepted so existing invocations keep
// working; --offline is the only switch that changes anything.
const forceOffline = argv.includes("--offline");
const sourceArg = argv.find((arg) => arg.startsWith("--source-dir="));
const sourceDir = path.resolve(sourceArg ? sourceArg.slice("--source-dir=".length) : DEFAULT_SOURCE_DIR);

const runContext = createDataOpsRunContext({
  operation: "import Effect Index identities",
  intent: "dev-convex-import",
  argv: writeRequested ? argv : [...argv, "--dry-run"],
  sourceUrlKeys: [],
  localArtifacts: [
    "EffectIndex-master/effectindex_dump/{people,profiles,posts}.json",
    "public/profile-avatars/<key>/avatar.*",
    SEED_PATH,
  ],
  confirmationFlag: "--confirm-ei-import",
  destructive: true,
});

if (writeRequested && !confirmed) {
  throw new Error("Live Effect Index imports require both --write and --confirm-ei-import.");
}
if (confirmed && !writeRequested) {
  throw new Error("--confirm-ei-import only has effect together with --write.");
}

const people = readJson(path.resolve(sourceDir, "people.json"));
const profiles = readJson(path.resolve(sourceDir, "profiles.json"));
const posts = readJson(path.resolve(sourceDir, "posts.json"));

const shouldQueryExisting = writeRequested || !forceOffline;

let existingProfiles;
let existingMode;

if (shouldQueryExisting) {
  const target = { key: runContext.targetUrlKey, url: requireTargetUrl(runContext) };
  const adminKey = requireAdminIntentToken("profileMediaWrite").token;
  const client = new ConvexHttpClient(target.url);
  let stored;
  try {
    stored = await client.query(api.contributorProfiles.getForBulkImport, {
      apiKey: adminKey,
      keys: EFFECT_INDEX_IDENTITIES.map((identity) => identity.key),
    });
  } catch (error) {
    // Every preserved field — displayName, bio, role, links, avatar — is
    // preserved by reading the live row first. Without those rows the merge
    // cannot tell a fresh profile from one holding real content, so it would
    // silently become an overwrite against exactly the profiles worth
    // protecting.
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error(
      [
        `Could not read existing contributor profiles from ${target.url} (${target.key}).`,
        `  ${detail}`,
        "",
        "This import merges into the live rows, so it will not continue without them.",
        "Two causes produce this, and they look identical from here:",
        "  1. That deployment's functions predate the admin-intent registry, so the",
        "     authorization check errors before it runs. Deploy Convex functions there first.",
        "  2. The admin token is not one that deployment accepts.",
        "",
        "Tell the two apart with:",
        `  npm run convex:doctor -- --url=${target.url}`,
        "See docs/agents/convex-credentials.md.",
        "",
        "--offline plans against the committed seed instead. It is for working without",
        "network access, not for validating a rollout: its baseline is a snapshot.",
      ].join("\n"),
    );
    process.exit(1);
  }
  existingProfiles = new Map(stored.map((profile) => [profile.key.toUpperCase(), profile]));
  existingMode = `live query (${target.key})`;
} else {
  const seed = readSeedProfiles();
  existingProfiles = new Map(
    EFFECT_INDEX_IDENTITIES.map((identity) => [identity.key, seed.get(identity.key)]).filter(
      ([, profile]) => Boolean(profile),
    ),
  );
  existingMode = `OFFLINE — baseline is the committed ${SEED_PATH} snapshot, not the target. It carries no role or avatarStorageId. Do not use this plan to validate a rollout.`;
}

const avatars = indexStagedAvatars();
const importedAt = Date.now();
const archiveEntries = buildArchiveEntries(people, profiles, posts, importedAt);
const { rows, reports } = buildIdentityRows({
  people,
  profiles,
  existingProfiles,
  avatarUrlsByKey: avatars.byKey,
  updatedBy: SCRIPT_UPDATED_BY,
});
assertNoEmail(rows);

console.log(`Effect Index source: ${sourceDir}`);
printDataOpsRunContext(runContext);
console.log(`Mode: ${writeRequested ? "LIVE WRITE REQUESTED" : "DRY RUN ONLY — no Convex writes performed"}`);
console.log(`Existing profile state: ${existingMode}`);
console.log(`Archive writes: ${archiveEntries.length} (posts: ${posts.length}, people: ${people.length}, profiles: ${profiles.length})`);
console.log(`Contributor profile writes: ${rows.length}`);
console.log(
  `Staged avatars: ${avatars.byKey.size} matched${avatars.missing.length ? `; no staged asset for ${avatars.missing.join(", ")} (initial-based fallback renders instead)` : ""}`,
);

console.log("\nLegacy privacy flags (people.json):");
for (const person of people) {
  console.log(`- ${person.alias || person.profile_url}: not_public=${String(person.not_public)}, isPrivate=${String(person.isPrivate)}`);
}

console.log("\nPlanned diff:");
for (const report of reports) {
  console.log(
    `${report.action} ${report.key} | displayName=${report.displayName} | role=${report.role}${report.roleValue ? ` ("${report.roleValue}")` : ""} | bio=${report.bio} (${report.bioLength} chars) | links=${report.links} | avatarUrl=${report.avatarUrl} | aliases+=${report.aliasesAdded.join(",") || "none"}`,
  );
}

console.log("\nExact contributorProfiles.bulkImport rows:");
console.log(JSON.stringify(rows, null, 2));

if (!writeRequested) {
  console.log("\nDry run only. No Convex writes performed.");
  console.log(`Archive entries withheld from this log (${archiveEntries.length} verbatim legacy payloads).`);
  process.exit(0);
}

assertDataOpsWriteAllowed(runContext);
const target = { key: runContext.targetUrlKey, url: requireTargetUrl(runContext) };
const adminKey = requireAdminIntentToken("profileMediaWrite").token;
const client = new ConvexHttpClient(target.url);
const archiveResult = await client.mutation(api.effectIndexArchive.bulkImport, {
  apiKey: adminKey,
  entries: archiveEntries,
});
const profileResult = await client.mutation(api.contributorProfiles.bulkImport, {
  apiKey: adminKey,
  profiles: rows,
});
console.log(`\nArchive import complete. Created: ${archiveResult.created}, Updated: ${archiveResult.updated}`);
console.log(`Contributor profile import complete. Created: ${profileResult.created}, Updated: ${profileResult.updated}`);

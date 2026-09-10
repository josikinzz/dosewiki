#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../convex/_generated/api.js";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

const emailMapArg = process.argv.find((arg) => arg.startsWith("--email-map="));
const emailMapPath = emailMapArg ? resolve(process.cwd(), emailMapArg.replace("--email-map=", "")) : null;
const dryRun = process.argv.includes("--dry-run");
const runContext = createDataOpsRunContext({
  operation: "migrate contributor profiles to Convex",
  intent: "dev-convex-import",
  sourceUrlKeys: [],
  localArtifacts: ["src/data/config/userProfiles.json"],
});

let convexUrl;
try {
  convexUrl = requireTargetUrl(runContext);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const sourcePath = resolve(process.cwd(), "src/data/config/userProfiles.json");
const sourceProfiles = readJsonFile(sourcePath);
const emailMap = emailMapPath ? readJsonFile(emailMapPath) : {};

const profiles = sourceProfiles.map((profile) => ({
  key: typeof profile.key === "string" ? profile.key.trim().toUpperCase() : "",
  displayName: typeof profile.displayName === "string" ? profile.displayName : "",
  aliases: Array.isArray(profile.aliases)
    ? profile.aliases.filter((entry) => typeof entry === "string")
    : [],
  avatarUrl: typeof profile.avatarUrl === "string" ? profile.avatarUrl : undefined,
  bio: typeof profile.bio === "string" ? profile.bio : "",
  // bulkImport patches every field it is given, so the seed has to carry the
  // contributor role title or re-seeding would clear it.
  role: typeof profile.role === "string" && profile.role.trim() ? profile.role.trim() : undefined,
  links: Array.isArray(profile.links)
    ? profile.links
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          label: typeof entry.label === "string" ? entry.label : "",
          url: typeof entry.url === "string" ? entry.url : "",
        }))
    : [],
  membershipEmail: normalizeEmail(emailMap[profile.key]),
  updatedBy: "migrate-user-profiles-to-convex",
}));

const unresolvedKeys = profiles
  .filter((profile) => !profile.membershipEmail)
  .map((profile) => profile.key)
  .sort((left, right) => left.localeCompare(right));

console.log(`Source profiles: ${profiles.length}`);
printDataOpsRunContext(runContext);
if (emailMapPath) {
  console.log(`Email map: ${emailMapPath}`);
}
if (unresolvedKeys.length > 0) {
  console.log(`Profiles without membershipEmail mapping: ${unresolvedKeys.join(", ")}`);
}

if (dryRun) {
  console.log("\nDry run only. No Convex writes performed.");
  process.exit(0);
}

try {
  assertDataOpsWriteAllowed(runContext);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const client = createDataClient({ target: convexUrl }).client;
const adminKey = requireAdminIntentToken("profileMediaWrite").token;
const result = await client.mutation(api.contributorProfiles.bulkImport, {
  apiKey: adminKey,
  profiles,
});

console.log(`\nImport complete. Created: ${result.created}, Updated: ${result.updated}`);

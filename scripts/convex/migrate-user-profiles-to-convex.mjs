#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (!match) {
        continue;
      }

      const [, key, value] = match;
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing local env
  }
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

loadEnvLocal();

const convexUrl =
  process.env.TARGET_CONVEX_URL ??
  process.env.CONVEX_URL ??
  process.env.VITE_CONVEX_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL;
const adminKey = process.env.CONVEX_ADMIN_KEY;

const emailMapArg = process.argv.find((arg) => arg.startsWith("--email-map="));
const emailMapPath = emailMapArg ? resolve(process.cwd(), emailMapArg.replace("--email-map=", "")) : null;
const dryRun = process.argv.includes("--dry-run");

if (!convexUrl) {
  console.error("Missing Convex URL. Set TARGET_CONVEX_URL, CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL.");
  process.exit(1);
}

if (!adminKey && !dryRun) {
  console.error("Missing CONVEX_ADMIN_KEY.");
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
console.log(`Convex URL: ${convexUrl}`);
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

const client = new ConvexHttpClient(convexUrl);
const result = await client.mutation(api.contributorProfiles.bulkImport, {
  apiKey: adminKey,
  profiles,
});

console.log(`\nImport complete. Created: ${result.created}, Updated: ${result.updated}`);

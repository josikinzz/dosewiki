#!/usr/bin/env node

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

const DEFAULT_SOURCE_DIR = "/Users/josie/Documents/Utilities/EffectIndex-master/effectindex_dump";
const SCRIPT_UPDATED_BY = "import-effectindex-identities";

const identityDefinitions = [
  { key: "JOSIE", displayName: "Josie Kins", aliases: ["josie", "josikinz", "josie kins"], personKey: "josie", profileKey: "josie" },
  { key: "VISCID", displayName: "Viscid", aliases: ["viscid", "mark gillis"], personKey: "viscid", profileKey: "viscid" },
  { key: "MAETHOR", displayName: "Maethor", aliases: ["maethor"], personKey: "maethor", profileKey: "maethor" },
  { key: "UTHERAPTOR", displayName: "utheraptor", aliases: ["utheraptor"], personKey: "utheraptor" },
  { key: "HYPNAGOGIST", displayName: "Hypnagogist", aliases: ["hypnagogist"], profileKey: "hypnagogist" },
  { key: "STINGRAYZ", displayName: "StingrayZ", aliases: ["stingrayz"], profileKey: "stingrayz" },
  { key: "RHO", displayName: "Rho", aliases: ["rho"], profileKey: "rho" },
  { key: "NATALIE", displayName: "Natalie", aliases: ["natalie"], profileKey: "natalie" },
  { key: "NERVEWING", displayName: "Nervewing", aliases: ["nervewing"], profileKey: "nervewing" },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeKey(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasContent(value) {
  return typeof value === "string" && value.replace(/[\[\]_*`#>-]/g, "").trim().length >= 40;
}

function comparableBio(value) {
  return typeof value === "string"
    ? value
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase()
    : "";
}

function isSubstantiallyContained(candidate, container) {
  const candidateWords = comparableBio(candidate).split(" ").filter((word) => word.length > 2);
  const containerWords = new Set(comparableBio(container).split(" "));
  if (candidateWords.length === 0) return true;
  const matchingWords = candidateWords.filter((word) => containerWords.has(word)).length;
  return matchingWords / candidateWords.length >= 0.8;
}

function removeEmails(value) {
  if (typeof value !== "string") return "";

  return value
    .split("\n")
    .filter((line) => !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function validHttpsLinks(person) {
  const links = [];
  for (const social of Array.isArray(person?.social_media) ? person.social_media : []) {
    const value = typeof social?.value === "string" ? social.value.trim() : "";
    const label = typeof social?.type === "string" ? social.type.trim() : "";
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && label && links.length < 3) {
        links.push({ label, url: url.toString() });
      }
    } catch {
      // Non-URLs, including Discord handles, are intentionally excluded.
    }
  }
  return links;
}

function offlineExistingProfiles() {
  return new Map([
    ["JOSIE", { key: "JOSIE", displayName: "Josie Kins", aliases: [], avatarUrl: "/profile-avatars/josie.png", avatarStorageId: undefined, bio: "", links: [] }],
    ["NERVEWING", { key: "NERVEWING", displayName: "Nervewing", aliases: [], avatarUrl: "/profile-avatars/nervewing.jpeg", avatarStorageId: undefined, bio: "", links: [] }],
  ]);
}

function mergeProfile(definition, peopleByKey, profilesByKey, existingProfiles) {
  const person = definition.personKey ? peopleByKey.get(definition.personKey) : undefined;
  const profile = definition.profileKey ? profilesByKey.get(definition.profileKey) : undefined;
  const personIsPrivate = Boolean(person?.not_public || person?.isPrivate);
  const publicPerson = personIsPrivate ? undefined : person;
  const existing = existingProfiles.get(definition.key);
  const profileBio = removeEmails(profile?.body);
  const personBio = removeEmails(publicPerson?.bio?.raw);
  const usePersonBio = !profileBio && hasContent(personBio);
  const appendPersonBio = Boolean(
    profileBio && hasContent(personBio) && !isSubstantiallyContained(personBio, profileBio),
  );
  const importedBio = usePersonBio
    ? personBio
    : appendPersonBio
      ? `${profileBio}\n\n${personBio}`
      : profileBio;
  const importedLinks = validHttpsLinks(publicPerson);
  const fields = {
    displayName: existing?.displayName?.trim() ? existing.displayName : definition.displayName,
    aliases: Array.from(new Set([...(existing?.aliases ?? []), ...definition.aliases].map(normalizeKey).filter(Boolean))),
    bio: existing?.bio?.trim() ? existing.bio : importedBio,
    links: Array.isArray(existing?.links) && existing.links.length > 0 ? existing.links : importedLinks,
  };

  const row = {
    key: definition.key,
    ...fields,
    updatedBy: SCRIPT_UPDATED_BY,
  };
  if (existing?.avatarStorageId) row.avatarStorageId = existing.avatarStorageId;
  if (existing?.avatarUrl) row.avatarUrl = existing.avatarUrl;

  return {
    row,
    report: {
      key: definition.key,
      existing: Boolean(existing),
      privacy: person ? { not_public: person.not_public, isPrivate: person.isPrivate, excludedFromPublicMerge: personIsPrivate } : null,
      fields: {
        displayName: existing?.displayName?.trim() ? "preserved-existing" : "filled-from-canonical",
        bio: existing?.bio?.trim() ? "preserved-existing" : usePersonBio ? "filled-from-person.bio.raw" : appendPersonBio ? "filled-profile.body-plus-person.bio.raw" : "filled-from-profile.body",
        links: Array.isArray(existing?.links) && existing.links.length > 0 ? "preserved-existing" : importedLinks.length ? "filled-from-person.social_media" : "skipped-no-valid-https-links",
        avatarStorageId: existing?.avatarStorageId ? "preserved-existing" : "skipped-media-recovery-later",
        avatarUrl: existing?.avatarUrl ? "preserved-existing" : "skipped-media-recovery-later",
      },
    },
  };
}

function buildArchiveEntries(people, profiles, posts, importedAt) {
  // Convex reserves $-prefixed field names, which Mongo export payloads use
  // ($oid, $date). The archive stores the verbatim JSON as a string instead.
  const verbatim = (payload) => JSON.stringify(payload);
  return [
    ...posts.map((payload) => ({ kind: "post", key: payload.slug, payload: verbatim(payload), importedAt })),
    ...people.map((payload) => ({ kind: "person", key: normalizeKey(payload.profile_url || payload.alias), payload: verbatim(payload), importedAt })),
    ...profiles.map((payload) => ({ kind: "profile", key: normalizeKey(payload.username), payload: verbatim(payload), importedAt })),
  ];
}

function assertNoEmail(rows) {
  for (const row of rows) {
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(row.bio)) {
      throw new Error(`Refusing to import an email address in ${row.key}'s public bio.`);
    }
  }
}

const argv = process.argv.slice(2);
const writeRequested = argv.includes("--write");
const confirmed = argv.includes("--confirm-ei-import");
const onlineDryRun = argv.includes("--online");
const forceOffline = argv.includes("--offline");
const sourceArg = argv.find((arg) => arg.startsWith("--source-dir="));
const sourceDir = resolve(sourceArg ? sourceArg.slice("--source-dir=".length) : DEFAULT_SOURCE_DIR);
const runContext = createDataOpsRunContext({
  operation: "import Effect Index identities",
  intent: "dev-convex-import",
  argv: writeRequested ? argv : [...argv, "--dry-run"],
  sourceUrlKeys: [],
  localArtifacts: ["EffectIndex-master/effectindex_dump/{people,profiles,posts}.json"],
  confirmationFlag: "--confirm-ei-import",
  destructive: true,
});

if (writeRequested && !confirmed) {
  throw new Error("Live Effect Index imports require both --write and --confirm-ei-import.");
}
if (confirmed && !writeRequested) {
  throw new Error("--confirm-ei-import only has effect together with --write.");
}

const people = readJson(resolve(sourceDir, "people.json"));
const profiles = readJson(resolve(sourceDir, "profiles.json"));
const posts = readJson(resolve(sourceDir, "posts.json"));
const peopleByKey = new Map(people.map((person) => [normalizeKey(person.profile_url || person.alias), person]));
const profilesByKey = new Map(profiles.map((profile) => [normalizeKey(profile.username), profile]));
const shouldQueryExisting = writeRequested || (onlineDryRun && !forceOffline);

let existingProfiles;
let existingMode;
if (shouldQueryExisting) {
  const target = {
    key: runContext.targetUrlKey,
    url: requireTargetUrl(runContext),
  };
  const adminKey = requireAdminIntentToken("profileMediaWrite").token;
  const client = new ConvexHttpClient(target.url);
  const stored = await client.query(api.contributorProfiles.getForBulkImport, {
    apiKey: adminKey,
    keys: identityDefinitions.map((identity) => identity.key),
  });
  existingProfiles = new Map(stored.map((profile) => [profile.key, profile]));
  existingMode = `live query (${target.key})`;
} else {
  existingProfiles = offlineExistingProfiles();
  existingMode = "offline assumptions: JOSIE and NERVEWING exist with non-empty displayName and avatar; NERVEWING bio is empty";
}

const importedAt = Date.now();
const archiveEntries = buildArchiveEntries(people, profiles, posts, importedAt);
const merged = identityDefinitions.map((definition) => mergeProfile(definition, peopleByKey, profilesByKey, existingProfiles));
const profileRows = merged.map(({ row }) => row);
assertNoEmail(profileRows);

console.log(`Effect Index source: ${sourceDir}`);
printDataOpsRunContext(runContext);
console.log(`Mode: ${writeRequested ? "LIVE WRITE REQUESTED" : "DRY RUN ONLY — no Convex writes performed"}`);
console.log(`Existing profile state: ${existingMode}`);
console.log(`Archive writes: ${archiveEntries.length} (posts: ${posts.length}, people: ${people.length}, profiles: ${profiles.length})`);
console.log(`Contributor profile writes: ${profileRows.length}`);
console.log("Privacy flags:");
for (const person of people) {
  console.log(`- ${person.alias || person.profile_url}: not_public=${String(person.not_public)}, isPrivate=${String(person.isPrivate)}`);
}
console.log("\nMerged/filled/skipped field report:");
for (const { report } of merged) {
  console.log(`- ${report.key}: ${JSON.stringify(report)}`);
}
console.log("\nExact archive mutation entries:");
console.log(JSON.stringify(archiveEntries, null, 2));
console.log("\nExact contributorProfiles.bulkImport rows:");
console.log(JSON.stringify(profileRows, null, 2));

if (!writeRequested) process.exit(0);

assertDataOpsWriteAllowed(runContext);
const target = {
  key: runContext.targetUrlKey,
  url: requireTargetUrl(runContext),
};
const adminKey = requireAdminIntentToken("profileMediaWrite").token;
const client = new ConvexHttpClient(target.url);
const archiveResult = await client.mutation(api.effectIndexArchive.bulkImport, { apiKey: adminKey, entries: archiveEntries });
const profileResult = await client.mutation(api.contributorProfiles.bulkImport, { apiKey: adminKey, profiles: profileRows });
console.log(`\nArchive import complete. Created: ${archiveResult.created}, Updated: ${archiveResult.updated}`);
console.log(`Contributor profile import complete. Created: ${profileResult.created}, Updated: ${profileResult.updated}`);

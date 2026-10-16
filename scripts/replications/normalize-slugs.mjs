#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "normalize-replication-slugs";
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RESERVED = new Set(["audio", "tutorials"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALIAS_FILE = path.join(
  __dirname,
  "../../data/effects/replicationSlugAliases.json",
);

const NOISE_PATTERNS = [
  /_upscayl_\d+x_[a-z0-9-]+/gi,
  /_photos_v\d+(_x\d+)?/gi,
  /_digital_art(_x\d+)?/gi,
  /_faces(_x\d+)?/gi,
  /_prob\d+/gi,
  /_x\d+\b/gi,
  /\bfirefox_[a-z0-9]+\b/gi,
];

const MAX_SLUG_LENGTH = 72;

const TRANSLITERATIONS = {
  ł: "l", đ: "d", ø: "o", æ: "ae", œ: "oe", ß: "ss", þ: "th", ð: "d", ı: "i",
};

function toSegments(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[łđøæœßþðı]/g, (ch) => TRANSLITERATIONS[ch] ?? ch)
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .split("-")
    .filter(Boolean);
}

function stripNoise(value) {
  let result = String(value ?? "").toLowerCase();

  for (const pattern of NOISE_PATTERNS) {
    result = result.replace(pattern, " ");
  }

  return result;
}

export function normalizeSlug(slug) {
  const segments = toSegments(stripNoise(slug)).filter((segment) => segment !== "by");
  const withoutUnknown = segments.filter((segment) => segment !== "unknown");
  const chosen = withoutUnknown.length > 0 ? withoutUnknown : segments;

  return chosen.join("-");
}

function looksLikeFilename(title) {
  const segments = toSegments(title);
  if (segments.length === 0) return true;

  return segments.some(
    (segment) => segment.length >= 7 && /\d/.test(segment) && /^[a-z0-9]+$/.test(segment),
  );
}

function truncateSegments(segments, maxLength) {
  const kept = [];
  let length = 0;

  for (const segment of segments) {
    const next = length === 0 ? segment.length : length + 1 + segment.length;
    if (next > maxLength) break;
    kept.push(segment);
    length = next;
  }

  return kept.length > 0 ? kept : segments.slice(0, 1);
}

export function buildSlugCandidate({ slug, title, artist }) {
  const cleanedFilename = normalizeSlug(slug);
  const cleanedTitle = stripNoise(title);
  const titleSegments = looksLikeFilename(cleanedTitle) ? [] : toSegments(cleanedTitle);

  if (titleSegments.length === 0) {
    return cleanedFilename;
  }

  const artistSegments =
    artist && artist.trim().toLowerCase() !== "unknown" ? toSegments(artist) : [];

  const alreadyCredited =
    artistSegments.length > 0 &&
    titleSegments.slice(-artistSegments.length).join("-") === artistSegments.join("-");

  const combined = alreadyCredited
    ? titleSegments
    : [...titleSegments, ...artistSegments];

  return truncateSegments(combined, MAX_SLUG_LENGTH).join("-");
}

function resolveTarget(candidate, taken) {
  let base = candidate;

  if (!base || !KEBAB_RE.test(base)) {
    base = (base || "replication").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  if (!base || !KEBAB_RE.test(base)) {
    return null;
  }
  if (RESERVED.has(base)) {
    base = `${base}-replication`;
  }

  let target = base;
  let counter = 2;
  while (taken.has(target)) {
    target = `${base}-${counter}`;
    counter += 1;
  }

  return target;
}

export function planSlugRenames(replications) {
  const taken = new Set(replications.map((item) => item.slug));
  const renames = [];
  const skipped = [];

  const occurrences = new Map();
  for (const item of replications) {
    occurrences.set(item.slug, (occurrences.get(item.slug) ?? 0) + 1);
  }

  const duplicates = [...occurrences.entries()]
    .filter(([, count]) => count > 1)
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const needsRename = replications
    .filter((item) => !KEBAB_RE.test(item.slug) || RESERVED.has(item.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  for (const item of needsRename) {
    if (occurrences.get(item.slug) > 1) {
      skipped.push({ slug: item.slug, reason: "duplicate slug — merge the rows first" });
      continue;
    }

    const target = resolveTarget(buildSlugCandidate(item), taken);

    if (!target || target === item.slug) {
      skipped.push({ slug: item.slug, reason: "no safe kebab-case form" });
      continue;
    }

    taken.add(target);
    renames.push({ from: item.slug, to: target, title: item.title, effectSlug: item.effect_slug });
  }

  return { renames, skipped, duplicates };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;

  if (!readUrl) {
    throw new Error(
      "Set TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL) so the script knows which deployment to read.",
    );
  }

  const client = createDataClient({ target: readUrl }).client;
  const replications = await client.query(api.replications.getAll, {});
  const { renames, skipped, duplicates } = planSlugRenames(replications);

  console.log(`\nScanned ${replications.length} replications.`);
  console.log(`Rename plan: ${renames.length}; skipped: ${skipped.length}\n`);

  for (const rename of renames) {
    console.log(`  ${rename.from}\n    -> ${rename.to}   (${rename.title})`);
  }
  for (const skip of skipped) {
    console.warn(`  SKIP ${skip.slug}: ${skip.reason}`);
  }

  if (duplicates.length > 0) {
    console.warn(
      `\n${duplicates.length} slug(s) are held by more than one row. Only the first is reachable at its permalink:`,
    );
    for (const duplicate of duplicates) {
      console.warn(`  ${duplicate.slug} x${duplicate.count}`);
    }
    console.warn("  Resolve with scripts/replications/merge-unknown-twins.mjs before renaming.");
  }

  const aliases = Object.fromEntries(renames.map(({ from, to }) => [from, to]));
  const existing = fs.existsSync(ALIAS_FILE)
    ? JSON.parse(fs.readFileSync(ALIAS_FILE, "utf8"))
    : {};
  const merged = { ...existing, ...aliases };
  fs.writeFileSync(ALIAS_FILE, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`\nWrote ${Object.keys(merged).length} aliases to ${path.relative(process.cwd(), ALIAS_FILE)}`);

  if (command.dryRun) {
    console.log("\nDry run — no Postgres writes performed.");
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  let renamed = 0;
  let galleryOrdersPatched = 0;

  for (const rename of renames) {
    const result = await writeClient.mutation(api.replications.renameSlug, {
      apiKey,
      from: rename.from,
      to: rename.to,
    });
    if (result.renamed) renamed += 1;
    galleryOrdersPatched += result.galleryOrdersPatched ?? 0;
    console.log(`  renamed ${rename.from} -> ${rename.to}`);
  }

  console.log(`\nRenamed ${renamed} replications; patched ${galleryOrdersPatched} gallery_order arrays.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

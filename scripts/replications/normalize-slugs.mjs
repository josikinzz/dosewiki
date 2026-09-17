#!/usr/bin/env node
/**
 * Normalise replication slugs to kebab-case.
 *
 * A large slice of the corpus was imported straight from filenames, leaving
 * public URLs like `/replications/8696092281_e167055dd3_k-unknown`. Now that each
 * replication has its own page, the slug is the shareable identity of a work, so
 * it should read like one.
 *
 * Renaming a slug changes a live URL, so the script also writes an alias map
 * (old slug -> new slug) that the route layer redirects through. The map is
 * emitted by the same run that performs the rename, so the two cannot drift.
 *
 * Dry run (default):
 *   node scripts/replications/normalize-slugs.mjs
 *
 * Apply:
 *   node scripts/replications/normalize-slugs.mjs --write \
 *     --confirm-write=normalize-replication-slugs \
 *     --expected-deployment=<fingerprint>
 */
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

/** Slugs that would shadow the static pages under /replications. */
const RESERVED = new Set(["audio", "tutorials"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALIAS_FILE = path.join(
  __dirname,
  "../../data/effects/replicationSlugAliases.json",
);

/**
 * Filename debris that carries no meaning in a URL: upscaler suffixes, pipeline
 * markers, and the `-unknown` tail that the importer appended when it could not
 * identify a creator.
 */
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

/**
 * Latin letters that NFD cannot decompose, so they survive the accent strip and
 * would otherwise be replaced by a hyphen — turning "Zdzisław Beksiński" into
 * "zdzis-aw-beksi-ski".
 */
const TRANSLITERATIONS = {
  ł: "l", đ: "d", ø: "o", æ: "ae", œ: "oe", ß: "ss", þ: "th", ð: "d", ı: "i",
};

function toSegments(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    // Decompose accents (ń -> n + combining mark) and drop the marks, then map
    // the letters that have no decomposition.
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

/** Clean an existing filename-derived slug: drop pipeline debris and filler. */
export function normalizeSlug(slug) {
  // Split on separators before filtering words: underscores are word characters
  // to a regex, so `\bby\b` would never match inside `field_by_chelsea`.
  const segments = toSegments(stripNoise(slug)).filter((segment) => segment !== "by");
  const withoutUnknown = segments.filter((segment) => segment !== "unknown");
  const chosen = withoutUnknown.length > 0 ? withoutUnknown : segments;

  return chosen.join("-");
}

/**
 * A title that is really a filename tells us nothing a reader would recognise,
 * so it must not become the public URL. Opaque ID runs (Flickr/Imgur/Reddit
 * exports) are the giveaway.
 */
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

/**
 * Build the slug a reader should see: the work's title, disambiguated by its
 * creator. That is the durable public identity of a replication — the imported
 * filename is an artifact of how it arrived, not what it is.
 *
 * Falls back to the cleaned filename only when the title carries no usable
 * words, so an opaque export never becomes an equally opaque URL by default.
 */
export function buildSlugCandidate({ slug, title, artist }) {
  const cleanedFilename = normalizeSlug(slug);
  // Some titles were themselves set from the filename, so they carry the same
  // pipeline debris and deserve the same cleanup before being trusted.
  const cleanedTitle = stripNoise(title);
  const titleSegments = looksLikeFilename(cleanedTitle) ? [] : toSegments(cleanedTitle);

  if (titleSegments.length === 0) {
    return cleanedFilename;
  }

  const artistSegments =
    artist && artist.trim().toLowerCase() !== "unknown" ? toSegments(artist) : [];

  // Don't repeat the creator when the title already ends with it.
  const alreadyCredited =
    artistSegments.length > 0 &&
    titleSegments.slice(-artistSegments.length).join("-") === artistSegments.join("-");

  const combined = alreadyCredited
    ? titleSegments
    : [...titleSegments, ...artistSegments];

  return truncateSegments(combined, MAX_SLUG_LENGTH).join("-");
}

/** Guarantee kebab-case, non-reserved, and unique against everything already taken. */
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

  // A slug held by more than one row cannot be renamed safely: the mutation
  // resolves by slug and would only ever move the first match, silently leaving
  // its twin behind. Report them instead — merging duplicates is a data decision.
  const occurrences = new Map();
  for (const item of replications) {
    occurrences.set(item.slug, (occurrences.get(item.slug) ?? 0) + 1);
  }

  // Reported whether or not they need renaming: a duplicated slug means only the
  // first row is reachable at its permalink, which is a data bug in its own right.
  const duplicates = [...occurrences.entries()]
    .filter(([, count]) => count > 1)
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  // Deterministic order so repeated dry runs produce an identical plan.
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

  // The alias map is what keeps already-shared links alive, so write it in both
  // modes: a dry run should let you review the redirects before committing.
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
  // The intent name, not the operation name — it selects the scoped admin token
  // the mutation's requireAuth checks. `.token` is the string the arg validator
  // wants; the resolver returns provenance alongside it.
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

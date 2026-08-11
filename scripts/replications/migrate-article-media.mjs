#!/usr/bin/env node
/**
 * Move the curated article-embedded media into the `replications` table.
 *
 * 98 media assets were embedded in `subjectiveEffects` prose and
 * `effectIndexArticles` rather than stored as rows, so nothing credited them,
 * nothing tracked their rights, and nothing could withhold them. The curation
 * pass that reviewed them is `src/data/config/articleMediaCuration.json`, one
 * entry per asset with a role, an artist, an effect and a confidence.
 *
 * ## What it will and will not migrate
 *
 * Only `confidence: "strong"` entries whose `role` is `replication` or
 * `figure`, plus the entries the owner has explicitly ruled on in
 * `src/data/config/articleMediaMigrationDecisions.json`. Everything `weak`,
 * `needs-owner` or `role: "unclear"` that the owner has not ruled on stays out
 * and is reported, never guessed at.
 *
 * ## The duplicate problem this exists to avoid
 *
 * The original audit recorded `already_in_replications_table: false` on every
 * one of the 98. That was wrong. A fifth of them are the same works the public
 * gallery already carries, re-encoded, re-cropped or re-uploaded, so inserting
 * them would duplicate live gallery entries under new slugs. Neither input file
 * is trusted on this point. Every candidate is checked against production three
 * ways, in this order:
 *
 *   1. storage id — the resolved Convex object is compared against the
 *      `storage_id` of all 247 existing rows.
 *   2. bytes — the asset's `sha-256` digest, taken from production's own
 *      response header, is compared against the digest of every existing row's
 *      stored object. Exact, and it catches a re-upload of identical bytes.
 *   3. pixels — a re-encode or a re-crop changes the bytes and not the work.
 *      Those were found by a downsampled greyscale sweep of every image row in
 *      production and then confirmed by eye; the result is recorded in
 *      `verifiedDuplicates` with its metric, because a judgement made by eye
 *      should not be silently recomputed by a later run.
 *
 * A near-duplicate found by eye is data. A byte duplicate is checked live on
 * every run, so a row inserted between two runs is still caught.
 *
 * ## Re-runnable, not one-shot
 *
 * Two dead assets may yet be recovered (see `recoverableLater` in the decisions
 * file). Every run re-reads production, skips any slug already present, and
 * re-derives type, format and dimensions from the asset's actual bytes rather
 * than from the inventory's `media_kind` label — which says "image/video" for
 * every animated asset and cannot be trusted for either field.
 *
 * Dry run (default, needs no credential):
 *   node scripts/replications/migrate-article-media.mjs \
 *     --inventory=/path/to/article-embedded-media-inventory.json
 *
 * Apply:
 *   node scripts/replications/migrate-article-media.mjs \
 *     --inventory=/path/to/article-embedded-media-inventory.json \
 *     --write --confirm-write=migrate-article-embedded-media \
 *     --confirm-media-migration \
 *     --expected-deployment=glad-minnow-656 \
 *     --target-url=https://glad-minnow-656.convex.cloud \
 *     --limit=5
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";

const OPERATION = "migrate-article-embedded-media";
const CONFIRM_FLAG = "--confirm-media-migration";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CURATION_PATH = path.join(ROOT, "src/data/config/articleMediaCuration.json");
const DECISIONS_PATH = path.join(ROOT, "src/data/config/articleMediaMigrationDecisions.json");

/** Roles this migration knows how to file. `unclear` is nobody's decision to make here. */
const MIGRATABLE_ROLES = new Set(["replication", "figure"]);

/**
 * Content type to `(type, format)`.
 *
 * An animated GIF is stored as `type: "image"`, which is what all six existing
 * gif rows do and what every gallery surface expects — `type: "video"` means an
 * `<video>` element with a poster frame, which a GIF is not. `image/jpeg` becomes
 * `jpg` because 52 rows spell it that way against 8 that say `jpeg`.
 */
const MEDIA_TYPES = Object.freeze({
  "image/jpeg": { type: "image", format: "jpg" },
  "image/png": { type: "image", format: "png" },
  "image/gif": { type: "image", format: "gif" },
  "image/webp": { type: "image", format: "webp" },
  "video/mp4": { type: "video", format: "mp4" },
  "video/quicktime": { type: "video", format: "mov" },
  "audio/mpeg": { type: "audio", format: "mp3" },
  "audio/ogg": { type: "audio", format: "ogg" },
});

export function mediaTypeFromContentType(contentType) {
  if (typeof contentType !== "string") {
    return null;
  }
  return MEDIA_TYPES[contentType.split(";")[0].trim().toLowerCase()] ?? null;
}

/**
 * The corpus's marker for "nobody is credited".
 *
 * `Unknown` already sits on 20 replication rows, and both `hasKnownCreator` and
 * the contributor join read it as *not a person* — no profile, no contributor
 * page, no false credit. "Anonymous", an empty string and a missing field all
 * mean the same thing and must all arrive as that one string, or the corpus
 * grows a second spelling of absence that nothing special-cases.
 */
export function normalizeArtist(name, { marker = "Unknown", aliases = [] } = {}) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  const aliasSet = new Set([...aliases, ""].map((entry) => entry.toLowerCase()));
  if (!trimmed || aliasSet.has(trimmed.toLowerCase())) {
    return marker;
  }
  return trimmed;
}

/** Whether a credit names somebody, mirroring `hasKnownCreator` on the app side. */
export function isNamedCreator(artist, marker = "Unknown") {
  return Boolean(artist) && artist.trim().toLowerCase() !== marker.toLowerCase();
}

/**
 * `"<Title> by <Artist>"`, or `"<Title> (creator unknown)"` when nobody is named.
 * Both spellings already exist in the table; matching them keeps the gallery
 * caption identical to the rows beside it.
 */
export function buildCreditLine(title, artist, marker = "Unknown") {
  const cleanTitle = String(title ?? "").trim();
  return isNamedCreator(artist, marker)
    ? `${cleanTitle} by ${artist}`
    : `${cleanTitle} (creator unknown)`;
}

/**
 * Split the curation file's free-text `attribution` into the rights columns.
 *
 * The field is prose with a shape: an optional leading source URL, an optional
 * `(rightsholder X)` or `(creator unknown)` parenthetical, and commentary. Only
 * what is actually stated is carried across — an unstated licence stays unset
 * rather than becoming a guess, and `rights_status` is only asserted for the
 * public-domain case, which the text says outright.
 */
export function parseAttribution(attribution) {
  const text = typeof attribution === "string" ? attribution.trim() : "";
  if (!text) {
    return {};
  }

  const parsed = {};

  const urlMatch = text.match(/https?:\/\/\S+?(?=\s|$)/);
  if (urlMatch) {
    parsed.source_url = urlMatch[0].replace(/[.,;]$/, "");
  }

  const rightsholderMatch = text.match(/\(\s*rightsholder\s+([^)]+?)\s*\)/i);
  if (rightsholderMatch) {
    parsed.rightsholder = rightsholderMatch[1].trim();
  }

  if (/public domain/i.test(text)) {
    parsed.rights_status = "public-domain";
  }

  // Whatever is left once the URL and the parenthetical are removed is the
  // human note — the rights caveats ("copyrighted fine art", a dead host, a
  // publication reference) that nothing else has a column for.
  const remainder = text
    .replace(urlMatch?.[0] ?? "", "")
    .replace(rightsholderMatch?.[0] ?? "", "")
    .replace(/\(\s*creator unknown\s*\)/i, "")
    .replace(/^[\s—–-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (remainder && remainder !== text.trim()) {
    parsed.permission_notes = remainder;
  } else if (remainder && !urlMatch && !rightsholderMatch) {
    parsed.permission_notes = remainder;
  }

  return parsed;
}

/**
 * Which entries this run is even willing to consider.
 *
 * `strong` plus a filable role, widened by the owner's explicit rulings and
 * narrowed by the groups the owner has held back. Everything else is reported
 * under the reason it was left alone.
 */
export function selectCandidates(assets, decisions) {
  const rulings = decisions.ownerRulings ?? {};
  const promotedById = new Map((rulings.promoted ?? []).map((entry) => [entry.id, entry]));
  const heldById = new Map();
  for (const group of rulings.heldGroups ?? []) {
    for (const id of group.ids ?? []) {
      heldById.set(id, group);
    }
  }
  const deadIds = new Set(rulings.deadAssetsLeftDead?.ids ?? []);

  const considered = [];
  const excluded = [];

  for (const asset of assets) {
    const held = heldById.get(asset.id);
    if (held) {
      excluded.push({ asset, reason: `held-group:${held.name}`, detail: held.reason });
      continue;
    }

    const promotion = promotedById.get(asset.id);
    if (promotion) {
      considered.push({ asset, promotion });
      continue;
    }

    if (deadIds.has(asset.id)) {
      excluded.push({
        asset,
        reason: "owner-ruled-dead",
        detail: rulings.deadAssetsLeftDead.$comment,
      });
      continue;
    }

    if (asset.confidence !== "strong") {
      excluded.push({
        asset,
        reason: `confidence:${asset.confidence}`,
        detail: "Only strong entries migrate automatically; the rest are the owner's to rule on.",
      });
      continue;
    }

    if (!MIGRATABLE_ROLES.has(asset.role)) {
      excluded.push({
        asset,
        reason: `role:${asset.role}`,
        detail: "Neither a replication nor a figure, so there is nothing to file it as.",
      });
      continue;
    }

    considered.push({ asset, promotion: null });
  }

  return { considered, excluded };
}

/**
 * Turn one considered entry into the exact `insertMediaAsset` arguments.
 *
 * `facts` is what production said about the asset — its resolved storage id,
 * content type, byte length, digest and pixel dimensions — never what the
 * inventory claimed. Returns `{ row }` or `{ blocked }`.
 */
export function planRow({ asset, promotion, facts, decisions }) {
  const rulings = decisions.ownerRulings ?? {};
  const marker = rulings.unknownArtistMarker ?? "Unknown";
  const correction = (rulings.artistCorrections ?? []).find((entry) =>
    (entry.ids ?? []).includes(asset.id),
  );

  if (!facts || !facts.storageId) {
    return { blocked: { reason: "no-storage", detail: "No usable Convex storage object." } };
  }
  if (!facts.reachable) {
    return {
      blocked: { reason: "unreachable", detail: `Production returned ${facts.status} for the asset.` },
    };
  }

  const media = mediaTypeFromContentType(facts.contentType);
  if (!media) {
    return {
      blocked: { reason: "unknown-media-type", detail: `Unhandled content type ${facts.contentType}.` },
    };
  }

  const artist = normalizeArtist(promotion?.artist ?? correction?.artist ?? asset.artist_name, {
    marker,
    aliases: rulings.unknownArtistAliases ?? [],
  });

  // A ruling that names the artist settles the credit, so the attribution prose
  // it overrides must not follow it in through the back door. A023's text says
  // "(rightsholder Oracle Emissary…)" — carrying that across would restore in a
  // rights column exactly the credit the owner just ruled against.
  const attribution = promotion?.artist ? {} : parseAttribution(asset.attribution);
  if (promotion?.artist && isNamedCreator(artist, marker)) {
    attribution.rightsholder = artist;
  }
  if (!promotion?.artist && correction) {
    attribution.rightsholder = isNamedCreator(artist, marker) ? artist : undefined;
  }
  const permissionNotes = [
    promotion?.permission_notes,
    correction ? `Credit corrected: the embed stored "${correction.storedArtist}" as the artist. ${correction.reason}` : null,
    attribution.permission_notes,
  ]
    .filter(Boolean)
    .join(" ");

  const row = {
    slug: asset.slug,
    title: String(asset.title ?? "").trim(),
    artist,
    role: asset.role,
    type: media.type,
    format: media.format,
    storage_id: facts.storageId,
    credit_line: buildCreditLine(asset.title, artist, marker),
  };

  if (asset.effect_slug) {
    row.effect_slug = asset.effect_slug;
  }
  if (Number.isFinite(facts.width) && facts.width > 0) {
    row.width = facts.width;
  }
  if (Number.isFinite(facts.height) && facts.height > 0) {
    row.height = facts.height;
  }
  if (Number.isFinite(facts.size) && facts.size > 0) {
    row.file_size = facts.size;
  }
  if (attribution.source_url) {
    row.source_url = attribution.source_url;
  }
  if (attribution.rightsholder) {
    row.rightsholder = attribution.rightsholder;
  }
  if (attribution.rights_status) {
    row.rights_status = attribution.rights_status;
  }
  if (permissionNotes) {
    row.permission_notes = permissionNotes;
  }

  return { row };
}

/**
 * The whole plan: one outcome per considered entry, and nothing inserted twice.
 *
 * Order matters. A slug already in production means the row landed on an earlier
 * run and the entry is simply done. A duplicate of an existing work must lose to
 * nothing, so it is checked before anything cosmetic. An entry that duplicates
 * another entry *in this same batch* — the same object embedded into both a
 * description and a long summary — collapses to one row, unless the two sit on
 * different effects, in which case two gallery rows is the intended outcome.
 */
export function planMigration({
  assets,
  decisions,
  existingRows,
  effectSlugs,
  facts,
  storageIdsInUse,
}) {
  const { considered, excluded } = selectCandidates(assets, decisions);
  const verifiedDuplicates = new Map(
    (decisions.verifiedDuplicates ?? []).map((entry) => [entry.id, entry]),
  );
  const allowedDuplicateFor = new Map(
    (decisions.ownerRulings?.promoted ?? [])
      .filter((entry) => entry.allowDuplicateOfSlug)
      .map((entry) => [entry.id, entry.allowDuplicateOfSlug]),
  );

  const existingSlugs = new Set(existingRows.map((row) => row.slug));

  // Rows this migration itself created on an earlier batch. They are the batch,
  // only already persisted, so they get the batch's rule rather than the rule
  // for the 247 rows that predate it: one object under two effects is two
  // intended gallery rows, and only a same-effect match is a duplicate. Without
  // this, running in batches quietly drops the second of every such pair — the
  // vasoconstriction/vasodilation diagram and the Wheeler circuit both split
  // across batch boundaries.
  const migrationSlugs = new Set(assets.map((asset) => asset.slug));

  const rowsByStorageId = new Map();
  const rowsByDigest = new Map();
  for (const row of existingRows) {
    if (!rowsByStorageId.has(row.storage_id)) {
      rowsByStorageId.set(row.storage_id, []);
    }
    rowsByStorageId.get(row.storage_id).push(row);

    const digest = storageIdsInUse.get(row.storage_id);
    if (digest) {
      if (!rowsByDigest.has(digest)) {
        rowsByDigest.set(digest, []);
      }
      rowsByDigest.get(digest).push(row);
    }
  }

  /**
   * Which existing row, if any, makes this candidate a duplicate.
   *
   * A pre-existing row wins on the asset alone — `A008` is the same file as
   * `blurred-english-terraces-josie-kins` and is a duplicate even though the two
   * sit on different effects. A row this migration made only wins when it also
   * shares the effect.
   */
  const duplicateAgainst = (matches, effectSlug, allowedAgainst) => {
    const relevant = matches.filter((row) => row.slug !== allowedAgainst);
    const preExisting = relevant.find((row) => !migrationSlugs.has(row.slug));
    if (preExisting) {
      return { row: preExisting, sibling: false };
    }
    const sibling = relevant.find((row) => (row.effect_slug ?? null) === (effectSlug ?? null));
    return sibling ? { row: sibling, sibling: true } : null;
  };

  const insert = [];
  const skipped = [];
  const seenInBatch = new Map();

  for (const entry of excluded) {
    skipped.push({ id: entry.asset.id, slug: entry.asset.slug, reason: entry.reason, detail: entry.detail });
  }

  for (const { asset, promotion } of considered) {
    const assetFacts = facts.get(asset.id) ?? null;
    const push = (reason, detail) => skipped.push({ id: asset.id, slug: asset.slug, reason, detail });

    if (existingSlugs.has(asset.slug)) {
      push("already-migrated", `Slug ${asset.slug} is already a row in production.`);
      continue;
    }

    const allowedAgainst = allowedDuplicateFor.get(asset.id);

    const verified = verifiedDuplicates.get(asset.id);
    if (verified && verified.existingSlug !== allowedAgainst) {
      push(
        "duplicate-of-existing",
        `${verified.existingSlug} — ${verified.method} (correlation ${verified.correlation}, rmse ${verified.rmse}). ${verified.note}`,
      );
      continue;
    }

    if (assetFacts?.storageId) {
      const effectSlug = asset.effect_slug ?? null;
      const byStorage = duplicateAgainst(
        rowsByStorageId.get(assetFacts.storageId) ?? [],
        effectSlug,
        allowedAgainst,
      );
      const byDigest = assetFacts.digest
        ? duplicateAgainst(rowsByDigest.get(assetFacts.digest) ?? [], effectSlug, allowedAgainst)
        : null;
      const match = byStorage ?? byDigest;
      if (match) {
        const how = byStorage
          ? `the same Convex storage object (${assetFacts.storageId})`
          : "identical sha-256 of the stored bytes";
        push(
          match.sibling ? "already-migrated" : "duplicate-of-existing",
          match.sibling
            ? `${match.row.slug} is this migration's own row for the same asset on the same effect — inserted by an earlier batch.`
            : `${match.row.slug} — ${how}.`,
        );
        continue;
      }
    }

    const { row, blocked } = planRow({ asset, promotion, facts: assetFacts, decisions });
    if (blocked) {
      push(blocked.reason, blocked.detail);
      continue;
    }

    if (!row.artist.trim()) {
      push("no-artist", "The mutation requires a non-blank artist and none could be resolved.");
      continue;
    }
    if (row.effect_slug && !effectSlugs.has(row.effect_slug)) {
      push("unknown-effect", `effect_slug ${row.effect_slug} is not a subjectiveEffects row.`);
      continue;
    }

    const batchKey = `${assetFacts.digest ?? assetFacts.storageId}::${row.effect_slug ?? "∅"}`;
    const earlier = seenInBatch.get(batchKey);
    if (earlier) {
      push(
        "duplicate-within-batch",
        `Same asset and same effect as ${earlier.id} (${earlier.slug}), which is already planned. ` +
          "One work, embedded twice into the same article.",
      );
      continue;
    }
    seenInBatch.set(batchKey, { id: asset.id, slug: asset.slug });

    insert.push({ id: asset.id, row, promotion: promotion?.reason ?? null });
  }

  return { insert, skipped };
}

/** Group the skips so a plan reads as reasons rather than as a list of ids. */
export function groupSkips(skipped) {
  const groups = new Map();
  for (const entry of skipped) {
    const key = entry.reason;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }
  return [...groups.entries()].sort((left, right) => right[1].length - left[1].length);
}

async function readAssetFacts({ assets, inventoryById, storageIds, readUrl, client }) {
  const facts = new Map();
  const uuids = [
    ...new Set(
      assets
        .map((asset) => inventoryById.get(asset.id)?.convex_storage_id)
        .filter(Boolean),
    ),
  ];

  // Confirm every mapped storage id really is the object the embed points at,
  // rather than trusting the checked-in map. `getUrl` returns a per-file URL
  // token, so a wrong id resolves to a different token and fails here.
  const mapped = uuids.map((uuid) => storageIds[uuid]).filter(Boolean);
  const resolved = mapped.length
    ? await client.query(api.replications.resolveStorageUrls, { storageIds: mapped })
    : [];
  const verifiedStorageId = new Map();
  mapped.forEach((storageId, index) => {
    const url = resolved[index];
    const uuid = uuids.find((candidate) => storageIds[candidate] === storageId);
    if (url && uuid && url.endsWith(`/${uuid}`)) {
      verifiedStorageId.set(uuid, storageId);
    }
  });

  let sharp = null;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    // Dimensions are optional on the row; a missing decoder costs width/height
    // and nothing else.
  }

  for (const asset of assets) {
    const uuid = inventoryById.get(asset.id)?.convex_storage_id;
    if (!uuid) {
      facts.set(asset.id, { storageId: null, reachable: false, status: 0 });
      continue;
    }
    const storageId = verifiedStorageId.get(uuid) ?? null;
    const url = `${readUrl.replace(/\/$/, "")}/api/storage/${uuid}`;
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      facts.set(asset.id, { storageId, reachable: false, status: 0, error: String(error) });
      continue;
    }
    if (!response.ok) {
      facts.set(asset.id, { storageId, reachable: false, status: response.status });
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = (response.headers.get("digest") ?? "").replace(/^sha-256=/, "") || null;
    let width;
    let height;
    if (sharp) {
      try {
        ({ width, height } = await sharp(bytes, { animated: false }).metadata());
      } catch {
        // Undecodable is not fatal; the row simply carries no dimensions.
      }
    }
    facts.set(asset.id, {
      storageId,
      reachable: true,
      status: response.status,
      contentType: response.headers.get("content-type"),
      size: bytes.byteLength,
      digest,
      width,
      height,
      uuid,
    });
  }

  return facts;
}

/** Digest per storage id for every object an existing row points at. */
async function readExistingDigests(existingRows, readUrl, client) {
  const storageIds = [...new Set(existingRows.map((row) => row.storage_id).filter(Boolean))];
  const urls = await client.query(api.replications.resolveStorageUrls, { storageIds });
  const digests = new Map();
  for (let index = 0; index < storageIds.length; index += 1) {
    const url = urls[index];
    if (!url) {
      continue;
    }
    try {
      const response = await fetch(url, { method: "HEAD" });
      const digest = (response.headers.get("digest") ?? "").replace(/^sha-256=/, "");
      if (digest) {
        digests.set(storageIds[index], digest);
      }
    } catch {
      // A row whose object cannot be reached simply takes no part in the byte
      // comparison; the pixel list still covers it.
    }
  }
  return digests;
}

function printPlan(plan, { assetsById }) {
  console.log("\n" + "#".repeat(78));
  console.log("# ARTICLE-EMBEDDED MEDIA -> replications");
  console.log("#".repeat(78));

  console.log(`\n  ${plan.insert.length} row(s) would be inserted.\n`);
  for (const entry of plan.insert) {
    const { row } = entry;
    console.log(`  ${entry.id}  ${row.slug}`);
    console.log(
      `      role=${row.role}  type=${row.type}  format=${row.format}` +
        `  ${row.width ?? "?"}x${row.height ?? "?"}  ${row.file_size ?? "?"} bytes`,
    );
    console.log(`      title      ${JSON.stringify(row.title)}`);
    console.log(`      artist     ${JSON.stringify(row.artist)}`);
    console.log(`      effect     ${row.effect_slug ?? "(none — omitted)"}`);
    console.log(`      storage    ${row.storage_id}`);
    console.log(`      credit     ${JSON.stringify(row.credit_line)}`);
    for (const field of ["source_url", "rightsholder", "rights_status", "permission_notes"]) {
      if (row[field]) {
        console.log(`      ${field.padEnd(10)} ${JSON.stringify(row[field])}`);
      }
    }
    if (entry.promotion) {
      console.log(`      ruling     ${entry.promotion}`);
    }
    console.log("");
  }

  console.log("=".repeat(78));
  console.log(`= SKIPPED (${plan.skipped.length}), grouped by reason`);
  console.log("=".repeat(78));
  for (const [reason, entries] of groupSkips(plan.skipped)) {
    console.log(`\n  ${reason}  (${entries.length})`);
    for (const entry of entries) {
      const asset = assetsById.get(entry.id);
      console.log(`    ${entry.id}  ${entry.slug}`);
      console.log(`        ${JSON.stringify(asset?.title ?? "")} — ${entry.detail}`);
    }
  }
  console.log("");
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const argv = process.argv.slice(2);
  const inventoryPath = getFlagValue(argv, "--inventory");
  if (!inventoryPath) {
    throw new Error(
      "Pass --inventory=<path to article-embedded-media-inventory.json>; it carries each asset's storage id and host.",
    );
  }

  const readUrl = command.targetUrl || process.env.CONVEX_PUBLIC_READ_URL;
  if (!readUrl) {
    throw new Error(
      "Set TARGET_CONVEX_URL (or CONVEX_PUBLIC_READ_URL) so the script knows which deployment to read.",
    );
  }

  const curation = JSON.parse(fs.readFileSync(CURATION_PATH, "utf8"));
  const decisions = JSON.parse(fs.readFileSync(DECISIONS_PATH, "utf8"));
  const inventory = JSON.parse(fs.readFileSync(path.resolve(inventoryPath), "utf8"));
  const inventoryById = new Map(inventory.assets.map((row) => [row.id, row]));
  const assetsById = new Map(curation.assets.map((asset) => [asset.id, asset]));

  const client = new ConvexHttpClient(readUrl);
  const [existingRows, effects] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.subjectiveEffects.getPublicPreviews, {}),
  ]);
  const effectSlugs = new Set(effects.map((effect) => effect.slug));

  console.log(
    `\nRead ${existingRows.length} replication row(s) and ${effectSlugs.size} effect(s) from ${readUrl}.`,
  );
  console.log(`Curation file carries ${curation.assets.length} reviewed asset(s).`);

  const { considered } = selectCandidates(curation.assets, decisions);
  console.log(`Fetching ${considered.length} candidate asset(s) and every existing row's digest…`);

  const [facts, storageIdsInUse] = await Promise.all([
    readAssetFacts({
      assets: considered.map((entry) => entry.asset),
      inventoryById,
      storageIds: decisions.storageIds ?? {},
      readUrl,
      client,
    }),
    readExistingDigests(existingRows, readUrl, client),
  ]);

  const plan = planMigration({
    assets: curation.assets,
    decisions,
    existingRows,
    effectSlugs,
    facts,
    storageIdsInUse,
  });

  printPlan(plan, { assetsById });

  if (command.dryRun) {
    console.log("Dry run — no Convex writes performed.");
    return;
  }

  assertProductionWriteAllowed(command);
  if (!hasFlag(argv, CONFIRM_FLAG)) {
    throw new Error(`Refusing to write without ${CONFIRM_FLAG}.`);
  }

  const limitFlag = getFlagValue(argv, "--limit");
  const limit = limitFlag ? Number.parseInt(limitFlag, 10) : plan.insert.length;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("--limit must be a positive integer.");
  }

  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = new ConvexHttpClient(command.targetUrl);

  const batch = plan.insert.slice(0, limit);
  console.log(`\nInserting ${batch.length} of ${plan.insert.length} planned row(s).`);
  for (const entry of batch) {
    const result = await writeClient.mutation(api.replications.insertMediaAsset, {
      apiKey,
      ...entry.row,
    });
    console.log(`  inserted ${result.slug}  role=${result.role}  id=${result.id}`);
  }

  const remaining = plan.insert.length - batch.length;
  if (remaining > 0) {
    console.log(`\n${remaining} row(s) remain. Re-run to continue; inserted slugs are skipped.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

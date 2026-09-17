#!/usr/bin/env node
/**
 * Move the curated article-embedded media into the `replications` table.
 *
 * 98 media assets were embedded in `subjectiveEffects` prose and
 * `effectIndexArticles` rather than stored as rows, so nothing credited them,
 * nothing tracked their rights, and nothing could withhold them. The curation
 * pass that reviewed them is a JSON dossier passed in with `--curation=<path>`,
 * one entry per asset with a role, an artist, an effect and a confidence.
 *
 * ## What it will and will not migrate
 *
 * Only `confidence: "strong"` entries whose `role` is `replication` or
 * `figure`, plus the entries the owner has explicitly ruled on in the decisions
 * file passed in with `--decisions=<path>`. Everything `weak`, `needs-owner` or
 * `role: "unclear"` that the owner has not ruled on stays out and is reported,
 * never guessed at.
 *
 * Both files are editor review records about creator-retained media (owner
 * rulings, per-asset evidence, and the storage ids they resolved to), so they
 * are kept outside the repository and never defaulted here.
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
 *   1. storage id — the resolved Postgres object is compared against the
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
 * ## Assets with no storage object yet
 *
 * The first pass could only file assets Postgres already held. Round two brought
 * four that had to be recovered from the live web first — dead gfycat ids and a
 * page hero whose host started returning 404 — so this script now uploads bytes
 * as well as referencing them. `ownerRulings.uploads` in the decisions file
 * names each recovered file, pins it by sha-256, and states the content type its
 * own container signature must produce; a file that has drifted fails closed
 * rather than quietly becoming the published asset. Uploads happen inside the
 * write phase, after the slug and duplicate checks, so a re-run pushes nothing.
 *
 * ## Re-runnable, not one-shot
 *
 * Every run re-reads production, skips any slug already present, and re-derives
 * type, format and dimensions from the asset's actual bytes rather than from the
 * inventory's `media_kind` label — which says "image/video" for every animated
 * asset and cannot be trusted for either field.
 *
 * Dry run (default, needs no credential):
 *   node scripts/replications/migrate-article-media.mjs \
 *     --curation=/path/to/article-media-curation.json \
 *     --decisions=/path/to/article-media-migration-decisions.json \
 *     --inventory=/path/to/article-embedded-media-inventory.json \
 *     --uploads-dir=/path/to/recovered-media
 *
 * Apply:
 *   node scripts/replications/migrate-article-media.mjs \
 *     --curation=/path/to/article-media-curation.json \
 *     --decisions=/path/to/article-media-migration-decisions.json \
 *     --inventory=/path/to/article-embedded-media-inventory.json \
 *     --uploads-dir=/path/to/recovered-media \
 *     --write --confirm-write=migrate-article-embedded-media \
 *     --confirm-media-migration \
 *     --expected-deployment=<host>/<database> \
 *     --target=postgresql://<host>/<database> \
 *     --limit=5
 */
import fs from "node:fs";
import path from "node:path";
import { uploadReplicationFile, replicationImportReceipts } from "./lib/r2-upload.mjs";
import { createDataClient, resolvePostgresSource, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";
import {
  buildCreditLine,
  isNamedCreator,
  mediaTypeFromContentType,
  normalizeArtist,
  parseAttribution,
} from "./article-media-evidence.mjs";
import {
  readUploadFacts,
  sniffMediaContentType,
} from "./article-media-sniff.mjs";
import {
  groupSkips,
  planMigration,
  planRow,
  selectCandidates,
} from "./article-media-planning.mjs";
import {
  expectsPublication,
  verifyInsertedRow,
} from "./article-media-publication.mjs";
import { printPlan } from "./article-media-reporting.mjs";

export {
  buildCreditLine,
  expectsPublication,
  groupSkips,
  isNamedCreator,
  mediaTypeFromContentType,
  normalizeArtist,
  parseAttribution,
  planMigration,
  planRow,
  readUploadFacts,
  selectCandidates,
  sniffMediaContentType,
  verifyInsertedRow,
};

const OPERATION = "migrate-article-embedded-media";
const CONFIRM_FLAG = "--confirm-media-migration";

/** Read a reviewed JSON input named by a required flag. */
function readRequiredJson(argv, flag, description) {
  const filePath = getFlagValue(argv, flag);
  if (!filePath) {
    throw new Error(`Pass ${flag}=<path to ${description}>.`);
  }
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

async function readAssetFacts({ assets, inventoryById, storageIds, readUrl, client, decisions, uploadsDir }) {
  const facts = new Map();
  const uploads = decisions?.ownerRulings?.uploads ?? {};
  const uploadKeyById = new Map(
    (decisions?.ownerRulings?.promoted ?? [])
      .filter((entry) => entry.upload)
      .map((entry) => [entry.id, entry.upload]),
  );
  const uuids = [
    ...new Set(
      assets
        .map((asset) => inventoryById.get(asset.id)?.storage_uuid)
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
    // A recovered asset's bytes are on disk and nowhere else yet, so its facts
    // come from the file. Checked before the inventory, which for these assets
    // still records the dead host the recovery pass replaced.
    const uploadKey = uploadKeyById.get(asset.id);
    if (uploadKey) {
      const upload = uploads[uploadKey];
      if (!upload) {
        throw new Error(`${asset.id} names upload "${uploadKey}", which the decisions file does not define.`);
      }
      facts.set(asset.id, readUploadFacts(upload, uploadsDir));
      continue;
    }

    const uuid = inventoryById.get(asset.id)?.storage_uuid;
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




async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const argv = process.argv.slice(2);
  const inventoryPath = getFlagValue(argv, "--inventory");
  if (!inventoryPath) {
    throw new Error(
      "Pass --inventory=<path to article-embedded-media-inventory.json>; each asset row carries its `storage_uuid` and host.",
    );
  }
  const uploadsDir = getFlagValue(argv, "--uploads-dir");

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;
  if (!readUrl) {
    throw new Error(
      "Set TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL) so the script knows which deployment to read.",
    );
  }

  const curation = readRequiredJson(argv, "--curation", "the article media curation dossier");
  const decisions = readRequiredJson(argv, "--decisions", "the article media migration decisions file");
  const inventory = JSON.parse(fs.readFileSync(path.resolve(inventoryPath), "utf8"));
  const inventoryById = new Map(inventory.assets.map((row) => [row.id, row]));
  const assetsById = new Map(curation.assets.map((asset) => [asset.id, asset]));

  const client = createDataClient({ target: readUrl }).client;
  const [existingRows, effects] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.subjectiveEffects.getPublicPreviews, {}),
  ]);
  const effectSlugs = new Set(effects.map((effect) => effect.slug));

  console.log(
    `\nRead ${existingRows.length} replication row(s) and ${effectSlugs.size} effect(s) from ${postgresFingerprintFromUrl(readUrl)}.`,
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
      decisions,
      uploadsDir: uploadsDir ? path.resolve(uploadsDir) : null,
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
    const uploads = plan.insert.filter((entry) => entry.upload);
    if (uploads.length) {
      console.log(`${uploads.length} row(s) would upload bytes before inserting:`);
      for (const entry of uploads) {
        console.log(
          `  ${entry.id}  ${entry.upload.absolutePath}\n` +
            `      ${entry.upload.bytes} bytes as ${entry.upload.contentType}, ` +
            `sha-256 verified against the decisions file`,
        );
      }
      console.log("");
    }
    console.log("Per-row verification that would run after each insert:");
    console.log("  1. re-read the row through api.replications.getBySlug");
    console.log("  2. require role, artist, type and format to match the plan");
    console.log("  3. require the resolved url to be non-null and to serve HTTP 200");
    console.log("  4. require the served content type to be the format that was written");
    console.log("  5. require the publication gate to read the row as the plan says");
    console.log("  A failing row stops the run before the next one is written.\n");
    console.log("Dry run — nothing uploaded, no Postgres writes performed.");
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
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  const batch = plan.insert.slice(0, limit);
  console.log(`\nInserting ${batch.length} of ${plan.insert.length} planned row(s).`);
  for (const entry of batch) {
    if (entry.upload) {
      console.log(`  uploading ${entry.upload.path} (${entry.upload.bytes} bytes, ${entry.upload.contentType})…`);
      entry.row.r2_key = await uploadReplicationFile(
        writeClient,
        apiKey,
        entry.upload.absolutePath,
        entry.upload.contentType,
      );
      delete entry.row.storage_id;
      console.log(`    stored as ${entry.row.r2_key}`);
    }
    if (!entry.row.r2_key && !entry.row.storage_id) {
      throw new Error(`${entry.row.slug} has no verified media identity. Nothing further written.`);
    }

    const result = await writeClient.mutation(api.replications.insertMediaAsset, {
      apiKey,
      expected_absent: true,
      ...entry.row,
      rights_status: entry.row.rights_status ?? "unknown",
      ...(await replicationImportReceipts(writeClient, apiKey, entry.row.slug, entry.row)),
    });
    console.log(`  inserted ${result.slug}  role=${result.role}  id=${result.id}`);

    const verdict = await verifyInsertedRow({ client, row: entry.row });
    if (!verdict.ok) {
      console.error(`  ${entry.row.slug}: VERIFICATION FAILED`);
      for (const reason of verdict.reasons) {
        console.error(`    ${reason}`);
      }
      throw new Error("Stopping before the next row. Everything written so far is listed above.");
    }
    console.log(
      `    verified  ${verdict.status} ${verdict.servedContentType}  ` +
        `role=${entry.row.role}  publishable=${expectsPublication(entry.row)}`,
    );
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

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDataClient, resolvePostgresSource, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  createProductionWriteCommand,
  printProductionWriteCommand,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";
import { classifyHostRisk } from "./lib/media-hosts.mjs";
import { assertMediaType, DEFAULT_MEDIA_TYPE } from "./lib/media-types.mjs";
import {
  DEFAULT_OPTIONS,
  assertToolsAvailable,
  buildFfmpegArgs,
  isCompletedRendition,
  planVideoAction,
  probeVideo,
  sha256File,
} from "./transcode-videos.mjs";

const OPERATION = "archive-replication-masters";

export const DEFAULT_RESERVE_BYTES = 1024 * 1024 * 1024;

function extensionFor(url, fallback) {
  const clean = String(url ?? "").split("?")[0];
  const ext = path.extname(clean).toLowerCase();
  if (ext && /^\.[a-z0-9]{2,5}$/.test(ext)) return ext;
  return fallback;
}

function assetFrom(row, { kind, url, relativePath, bytes }) {
  const { host, risk, atRisk } = classifyHostRisk(url);
  return {
    rowId: row._id,
    slug: row.slug,
    kind,
    url,
    host,
    risk,
    atRisk,
    bytes,
    format: row.format ?? null,
    relativePath,
  };
}

function describeVideoRowAssets(row) {
  const assets = [];

  if (row.url) {
    assets.push(
      assetFrom(row, {
        kind: "video",
        url: row.url,
        bytes: Number.isFinite(row.file_size) ? row.file_size : null,
        relativePath: path.join("video", `${row.slug}${extensionFor(row.url, `.${row.format || "mp4"}`)}`),
      }),
    );
  }

  if (row.thumbnail_url) {
    assets.push(
      assetFrom(row, {
        kind: "thumbnail",
        url: row.thumbnail_url,
        bytes: null,
        relativePath: path.join("poster", `${row.slug}-poster${extensionFor(row.thumbnail_url, ".jpg")}`),
      }),
    );
  }

  return assets;
}

function describeImageRowAssets(row) {
  const assets = [];

  if (row.url) {
    assets.push(
      assetFrom(row, {
        kind: "image",
        url: row.url,
        bytes: Number.isFinite(row.file_size) ? row.file_size : null,
        relativePath: path.join("image", `${row.slug}${extensionFor(row.url, `.${row.format || "jpg"}`)}`),
      }),
    );
  }

  if (row.thumbnail_url && row.thumbnail_url !== row.url) {
    assets.push(
      assetFrom(row, {
        kind: "thumbnail",
        url: row.thumbnail_url,
        bytes: null,
        relativePath: path.join(
          "image",
          `${row.slug}-thumbnail${extensionFor(row.thumbnail_url, `.${row.format || "jpg"}`)}`,
        ),
      }),
    );
  }

  return assets;
}

export function describeRowAssets(row, mediaType = DEFAULT_MEDIA_TYPE) {
  return assertMediaType(mediaType) === "image"
    ? describeImageRowAssets(row)
    : describeVideoRowAssets(row);
}

export function buildArchivePlan(rows, mediaType = DEFAULT_MEDIA_TYPE) {
  return rows
    .flatMap((row) => describeRowAssets(row, mediaType))
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.kind.localeCompare(b.kind));
}

export function detectArchiveCollisions(assets) {
  const byFoldedPath = new Map();

  for (const asset of assets) {
    const key = asset.relativePath.toLocaleLowerCase("en-US").normalize("NFC");
    const existing = byFoldedPath.get(key) ?? [];
    existing.push(asset);
    byFoldedPath.set(key, existing);
  }

  return [...byFoldedPath.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([foldedPath, group]) => ({
      foldedPath,
      paths: group.map((asset) => asset.relativePath),
      slugs: group.map((asset) => asset.slug),
      identical: new Set(group.map((asset) => asset.relativePath)).size === 1,
    }))
    .sort((a, b) => a.foldedPath.localeCompare(b.foldedPath));
}

export function hasRoomFor({ availableBytes, reserveBytes = DEFAULT_RESERVE_BYTES, fileBytes }) {
  if (!Number.isFinite(fileBytes)) {
    return { fits: false, reason: "size unknown" };
  }
  const usable = availableBytes - reserveBytes;
  if (fileBytes > usable) {
    return {
      fits: false,
      reason: `needs ${fileBytes} bytes, ${Math.max(0, usable)} usable after the ${reserveBytes}-byte reserve`,
    };
  }
  return { fits: true, reason: "fits within the reserve" };
}

export function planArchiveBudget(assets, { availableBytes, reserveBytes = DEFAULT_RESERVE_BYTES }) {
  const totalBytes = assets.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0);
  const usableBytes = Math.max(0, availableBytes - reserveBytes);
  const unknownSizes = assets.filter((asset) => asset.bytes === null).length;

  return {
    assets: assets.length,
    unknownSizes,
    totalBytes,
    availableBytes,
    reserveBytes,
    usableBytes,
    shortfallBytes: Math.max(0, totalBytes - usableBytes),
    sufficient: totalBytes <= usableBytes,
  };
}

export function summarizeRisk(assets) {
  const byHost = {};
  let atRisk = 0;

  for (const asset of assets) {
    const key = asset.host ?? "unknown";
    byHost[key] = (byHost[key] ?? 0) + 1;
    if (asset.atRisk) atRisk += 1;
  }

  return { total: assets.length, atRisk, safe: assets.length - atRisk, byHost };
}

export function assertArchiveAllowed(command, argv) {
  if (!command?.writeRequested) throw new Error(`${OPERATION} requires --write to download anything.`);
  if (command.dryRun) throw new Error("--dry-run and --write cannot be combined.");
  if (!hasFlag(argv, "--confirm-archive")) {
    throw new Error(`${OPERATION} requires --confirm-archive alongside --write.`);
  }
}

function availableBytesOn(dir) {
  const stats = fs.statfsSync(dir);
  return stats.bavail * stats.bsize;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function downloadTo(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${response.status} ${response.statusText}`);

  const declared = Number(response.headers.get("content-length"));
  const partPath = `${destination}.part`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(partPath)) fs.rmSync(partPath);

  const handle = fs.openSync(partPath, "w");
  let written = 0;
  try {
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      fs.writeSync(handle, buffer, 0, buffer.length);
      written += buffer.length;
    }
  } finally {
    fs.closeSync(handle);
  }

  if (Number.isFinite(declared) && declared > 0 && written !== declared) {
    fs.rmSync(partPath);
    throw new Error(`truncated download: got ${written} of ${declared} bytes`);
  }

  fs.renameSync(partPath, destination);
  return { bytes: written, contentType: response.headers.get("content-type") };
}

function archiveFile(sourcePath, archivePath) {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  const partPath = `${archivePath}.part`;
  if (fs.existsSync(partPath)) fs.rmSync(partPath);

  fs.copyFileSync(sourcePath, partPath);
  const sourceDigest = sha256File(sourcePath);
  if (sha256File(partPath) !== sourceDigest) {
    fs.rmSync(partPath);
    throw new Error("archive copy failed verification");
  }
  fs.renameSync(partPath, archivePath);
  return sourceDigest;
}

function alreadyArchived(archivePath, expectedBytes) {
  if (!fs.existsSync(archivePath)) return false;
  if (!Number.isFinite(expectedBytes)) return true;
  return fs.statSync(archivePath).size === expectedBytes;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  console.log("Database writes: none — this operation reads public queries and writes local files.\n");

  const mediaType = assertMediaType(getFlagValue(argv, "--media-type") ?? DEFAULT_MEDIA_TYPE);
  const producesRenditions = mediaType === "video";
  const archiveDir = getFlagValue(argv, "--archive-dir");
  const scratchDir = getFlagValue(argv, "--scratch-dir");
  const outputDir = getFlagValue(argv, "--output-dir");
  const reserveBytes = Number(getFlagValue(argv, "--reserve-bytes") ?? DEFAULT_RESERVE_BYTES);
  const limit = Number(getFlagValue(argv, "--limit") ?? Infinity);

  if (!archiveDir) throw new Error("Pass --archive-dir=<master archive volume path>.\nUsage: bun scripts/replications/archive-replication-masters.mjs --archive-dir=<archive> --scratch-dir=<scratch> [--output-dir=<renditions>] [--media-type=video|image]\nDefault is a dry run. Video requires --output-dir; images are copied unchanged. Apply requires --write --confirm-archive and the approved write ceremony in docs/operations/data-credentials.md.");
  if (!scratchDir) throw new Error("Pass --scratch-dir=<local working directory>.");
  if (producesRenditions && !outputDir) {
    throw new Error("Pass --output-dir=<directory for web renditions>.");
  }

  const readUrl = resolvePostgresSource({}).url;
  if (!readUrl) {
    throw new Error(
      "Set SOURCE_POSTGRES_URL to the deployment whose rows should be archived. Point it at production — reading from dev resolves storage URLs against the wrong deployment and has already produced one misleading audit.",
    );
  }

  if (!command.dryRun) assertArchiveAllowed(command, argv);
  if (producesRenditions) assertToolsAvailable();

  const archiveRoot = path.resolve(archiveDir);
  if (!fs.existsSync(archiveRoot) && !command.dryRun) {
    fs.mkdirSync(archiveRoot, { recursive: true });
  }
  const measuredAgainst = fs.existsSync(archiveRoot) ? archiveRoot : path.dirname(archiveRoot);
  if (!fs.existsSync(measuredAgainst)) {
    throw new Error(`Archive volume is not mounted: ${measuredAgainst}`);
  }
  const availableBytes = availableBytesOn(measuredAgainst);

  const client = createDataClient({ target: readUrl }).client;
  const rows = (await client.query(api.replications.getPublicReplications, {})).filter(
    (row) => row.type === mediaType,
  );

  const assets = buildArchivePlan(rows, mediaType).slice(0, Number.isFinite(limit) ? limit : undefined);
  const risk = summarizeRisk(assets);
  const budget = planArchiveBudget(assets, { availableBytes, reserveBytes });

  console.log(`Media type  : ${mediaType} (${rows.length} row(s))`);
  console.log(`Read source : ${postgresFingerprintFromUrl(readUrl)}`);
  console.log(`Archive     : ${archiveRoot}`);
  console.log(`Scratch     : ${path.resolve(scratchDir)}`);
  console.log(
    producesRenditions
      ? `Renditions  : ${path.resolve(outputDir)}\n`
      : "Renditions  : none — image masters are archived and re-served byte for byte\n",
  );

  console.log("--- Where the media lives ----------------------------------------");
  for (const [host, count] of Object.entries(risk.byHost).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${host}`);
  }
  console.log(`  ${risk.atRisk} of ${risk.total} assets are on a host this project does not control.\n`);

  const collisions = detectArchiveCollisions(assets);
  if (collisions.length > 0) {
    console.error("Archive name collisions on a case-insensitive volume (exFAT):");
    for (const collision of collisions) {
      console.error(
        `  ${collision.foldedPath}\n    ${collision.identical ? "identical names" : "differ only by case"}: ${collision.slugs.join(", ")}`,
      );
    }
    throw new Error(
      `${collisions.length} archive name collision(s). Archiving would overwrite a master. Resolve the slugs first (scripts/replications/normalize-slugs.mjs, merge-unknown-twins.mjs).`,
    );
  }
  console.log(`Name collision check: ${assets.length} archive paths, none collide case-insensitively.\n`);

  console.log("--- Volume budget ------------------------------------------------");
  console.log(`Free on volume : ${formatBytes(budget.availableBytes)}`);
  console.log(`Held in reserve: ${formatBytes(budget.reserveBytes)}`);
  console.log(`Masters to copy: ${formatBytes(budget.totalBytes)} known${budget.unknownSizes ? ` (+${budget.unknownSizes} of unknown size)` : ""}`);
  console.log(
    budget.sufficient
      ? `Headroom       : ${formatBytes(budget.usableBytes - budget.totalBytes)} spare — the volume holds the corpus.\n`
      : `SHORTFALL      : ${formatBytes(budget.shortfallBytes)} — this volume cannot hold the corpus. Attach more storage before running.\n`,
  );

  const manifestEntries = [];
  let archived = 0;
  let stoppedEarly = null;

  for (const [index, asset] of assets.entries()) {
    console.log(`[${index + 1}/${assets.length}] ${asset.slug} (${asset.kind})`);
    console.log(`  host ${asset.host ?? "unknown"} · risk ${asset.risk}`);

    const archivePath = path.join(archiveRoot, asset.relativePath);
    const scratchPath = path.join(path.resolve(scratchDir), path.basename(asset.relativePath));
    const entry = {
      rowId: asset.rowId,
      slug: asset.slug,
      kind: asset.kind,
      host: asset.host,
      risk: asset.risk,
      sourceUrl: asset.url,
      format: asset.format,
      archivePath,
    };

    if (alreadyArchived(archivePath, asset.bytes)) {
      entry.status = "already-archived";
      entry.archivedBytes = fs.statSync(archivePath).size;
      manifestEntries.push(entry);
      console.log(`  already archived (${formatBytes(entry.archivedBytes)}) — skipping\n`);
      continue;
    }

    if (command.dryRun) {
      entry.status = "planned";
      manifestEntries.push(entry);
      console.log(`  would fetch -> ${scratchPath}`);
      console.log(`  would archive -> ${archivePath}\n`);
      continue;
    }

    assertArchiveAllowed(command, argv);

    const freeNow = availableBytesOn(archiveRoot);

    let downloaded;
    try {
      downloaded = await downloadTo(asset.url, scratchPath);
    } catch (error) {
      entry.status = "fetch-failed";
      entry.reason = error.message;
      manifestEntries.push(entry);
      console.warn(`  FETCH FAILED ${error.message}\n`);
      continue;
    }
    entry.sourceBytes = downloaded.bytes;
    entry.contentType = downloaded.contentType;
    console.log(`  fetched ${formatBytes(downloaded.bytes)}${downloaded.contentType ? ` (${downloaded.contentType})` : ""}`);

    if (producesRenditions && asset.kind === "video") {
      try {
        const probe = probeVideo(scratchPath);
        const renditionPath = path.join(path.resolve(outputDir), `${asset.slug}.mp4`);
        const existingProbe = fs.existsSync(renditionPath) ? probeVideo(renditionPath) : null;
        const done =
          existingProbe &&
          isCompletedRendition(existingProbe, { expectedDurationSeconds: probe.durationSeconds }).complete;

        if (done) {
          console.log("  rendition already present — skipping encode");
        } else {
          const videoPlan = planVideoAction(probe, DEFAULT_OPTIONS);
          fs.mkdirSync(path.dirname(renditionPath), { recursive: true });
          const partPath = `${renditionPath}.part`;
          if (videoPlan.action === "copy") {
            fs.copyFileSync(scratchPath, partPath);
          } else {
            const args = buildFfmpegArgs({
              action: videoPlan.action,
              inputPath: scratchPath,
              outputPath: partPath,
              scale: videoPlan.scale,
              hasAudio: probe.hasAudio,
            });
            const result = spawnSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
            if (result.status !== 0) throw new Error(`ffmpeg exited ${result.status}`);
          }
          fs.renameSync(partPath, renditionPath);
          entry.renditionPath = renditionPath;
          entry.renditionBytes = fs.statSync(renditionPath).size;
          entry.renditionAction = videoPlan.action;
          console.log(
            `  rendition ${videoPlan.action}: ${formatBytes(downloaded.bytes)} -> ${formatBytes(entry.renditionBytes)}`,
          );
        }
      } catch (error) {
        entry.renditionError = error.message;
        console.warn(`  RENDITION FAILED ${error.message}`);
      }
    }

    const room = hasRoomFor({ availableBytes: freeNow, reserveBytes, fileBytes: downloaded.bytes });
    if (!room.fits) {
      entry.status = "not-archived-no-room";
      entry.reason = room.reason;
      manifestEntries.push(entry);
      stoppedEarly = {
        slug: asset.slug,
        kind: asset.kind,
        neededBytes: downloaded.bytes,
        freeBytes: freeNow,
        scratchPath,
      };
      console.warn(`  NO ROOM ON VOLUME — ${room.reason}`);
      console.warn(`  Stopping. The fetched master is left at ${scratchPath}; free space and re-run.\n`);
      break;
    }

    try {
      entry.sha256 = archiveFile(scratchPath, archivePath);
      entry.status = "archived";
      archived += 1;
      console.log(`  archived -> ${archivePath} (sha256 verified)`);
    } catch (error) {
      entry.status = "archive-failed";
      entry.reason = error.message;
      manifestEntries.push(entry);
      console.warn(`  ARCHIVE FAILED ${error.message}\n`);
      continue;
    }

    fs.rmSync(scratchPath, { force: true });
    manifestEntries.push(entry);
    console.log("");
  }

  const notArchived = manifestEntries
    .filter((entry) => entry.status && entry.status !== "archived" && entry.status !== "already-archived")
    .map((entry) => ({
      slug: entry.slug,
      kind: entry.kind,
      host: entry.host,
      risk: entry.risk,
      bytes: entry.sourceBytes ?? null,
      reason: entry.reason ?? entry.status,
    }));

  const defaultManifestPath = producesRenditions
    ? path.join(path.resolve(outputDir), "archive-manifest.json")
    : path.join(archiveRoot, `${mediaType}-archive-manifest.json`);
  const manifestPath = getFlagValue(argv, "--manifest") ?? defaultManifestPath;
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        operation: OPERATION,
        generatedAt: new Date().toISOString(),
        mode: command.dryRun ? "dry-run" : "write",
        mediaType,
        readSource: postgresFingerprintFromUrl(readUrl),
        archiveDir: archiveRoot,
        risk,
        budget,
        stoppedEarly,
        archived: manifestEntries.filter(
          (entry) => entry.status === "archived" || entry.status === "already-archived",
        ),
        notArchived,
      },
      null,
      2,
    )}\n`,
  );

  console.log("--- Result -------------------------------------------------------");
  console.log(`Archived this run : ${archived}`);
  console.log(`Not archived      : ${notArchived.length}`);
  if (stoppedEarly) {
    console.log(
      `Stopped early at  : ${stoppedEarly.slug} (${stoppedEarly.kind}) — needed ${formatBytes(stoppedEarly.neededBytes)}, ${formatBytes(stoppedEarly.freeBytes)} free`,
    );
  }
  console.log(`Manifest          : ${manifestPath}`);

  if (command.dryRun) {
    console.log("\nDry run — nothing fetched, nothing written. Re-run with --write --confirm-archive.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`\n${error.message}\n`);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
}

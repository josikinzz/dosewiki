#!/usr/bin/env node
/**
 * Rescue replication media off deployments nobody controls, and produce a web
 * rendition on the way past.
 *
 * 99% of the replication corpus by bytes does not live on production. 59 video
 * masters resolve from `warmhearted-mosquito-204`, 6 from `adept-goldfish-624`,
 * and 65 thumbnails from the *development* deployment `enchanted-echidna-791`.
 * None of those are backed by anything this project owns, no admin credential
 * for them exists here, and an HTTP GET is the only way to obtain the bytes. If
 * one of those deployments is reset or deleted, those files are gone — not
 * degraded, gone, with nothing able to re-derive them.
 *
 * So this script does three things per row, strictly one row at a time:
 *
 *   1. fetch the master to local scratch,
 *   2. transcode it to a web rendition (see transcode-videos.mjs),
 *   3. copy the master to the archive volume and release the scratch copy.
 *
 * Peak local scratch therefore stays near the largest single file (~4.8 GB)
 * rather than the 44.6 GB corpus.
 *
 * Order is plain slug order. There is no prioritisation scheme because nothing
 * forces one: the archive volume (`/Volumes/DeepSeek`, 639 GB free against 44.6
 * GB of masters) has ample room for the whole corpus. The free-space check and
 * the resumable design below are kept because they are correct regardless — a
 * volume can be shared, filled by something else, or swapped — not because this
 * particular volume is tight.
 *
 * exFAT properties this script handles deliberately:
 *
 *   - **Case-insensitive filenames.** Two rows whose archive names differ only
 *     by case would silently overwrite one another, which is the exact failure
 *     this whole exercise exists to prevent. Collisions are detected up front
 *     and abort the run before a single byte is written.
 *   - **No POSIX permissions, ownership, symlinks, or hard links** (`noowners`).
 *     Nothing here relies on any of them; verification is by content digest.
 *   - **No 4 GB file-size limit** — that is FAT32. The 4.80 GB and 4.79 GB
 *     masters write fine.
 *
 * This script performs NO Convex write. It reads public queries and writes local
 * files only.
 *
 * Dry run (default — plans, checks space and collisions, downloads nothing):
 *   node scripts/replications/archive-video-masters.mjs \
 *     --archive-dir="/Volumes/DeepSeek/dosewiki-replication-masters" \
 *     --scratch-dir=/tmp/replication-scratch \
 *     --output-dir=/vol/replication-web
 *
 * Apply:
 *   node scripts/replications/archive-video-masters.mjs \
 *     --archive-dir="/Volumes/DeepSeek/dosewiki-replication-masters" \
 *     --scratch-dir=/tmp/replication-scratch \
 *     --output-dir=/vol/replication-web \
 *     --write --confirm-archive
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  createProductionWriteCommand,
  printProductionWriteCommand,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";
import { classifyHostRisk } from "./lib/media-hosts.mjs";
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

/**
 * Hold this much of the volume back. Filling a volume to the last byte is how
 * you get a write that fails partway with no room to clean up after itself.
 */
export const DEFAULT_RESERVE_BYTES = 1024 * 1024 * 1024;

function extensionFor(url, fallback) {
  const clean = String(url ?? "").split("?")[0];
  const ext = path.extname(clean).toLowerCase();
  if (ext && /^\.[a-z0-9]{2,5}$/.test(ext)) return ext;
  return fallback;
}

/**
 * Split a replication row into the individual assets that have to be rescued.
 *
 * A row is not the unit of work: its video and its poster can live on different
 * deployments in different amounts of danger, and 65 rows are in exactly that
 * state today — video on an orphan host, thumbnail on dev.
 */
export function describeRowAssets(row) {
  const assets = [];

  if (row.url) {
    const { host, risk, atRisk } = classifyHostRisk(row.url);
    assets.push({
      rowId: row._id,
      slug: row.slug,
      kind: "video",
      url: row.url,
      host,
      risk,
      atRisk,
      bytes: Number.isFinite(row.file_size) ? row.file_size : null,
      relativePath: path.join("video", `${row.slug}${extensionFor(row.url, `.${row.format || "mp4"}`)}`),
    });
  }

  if (row.thumbnail_url) {
    const { host, risk, atRisk } = classifyHostRisk(row.thumbnail_url);
    assets.push({
      rowId: row._id,
      slug: row.slug,
      kind: "thumbnail",
      url: row.thumbnail_url,
      host,
      risk,
      atRisk,
      bytes: null,
      relativePath: path.join("poster", `${row.slug}-poster${extensionFor(row.thumbnail_url, ".jpg")}`),
    });
  }

  return assets;
}

/**
 * Deterministic archive order: by slug, then by asset kind.
 *
 * Sorting by slug keeps a row's video and poster adjacent, which is what makes
 * the one-row-at-a-time cycle readable in the log and makes an interrupted run
 * resume at an obvious place. There is no cleverness here on purpose.
 */
export function buildArchivePlan(rows) {
  return rows
    .flatMap((row) => describeRowAssets(row))
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.kind.localeCompare(b.kind));
}

/**
 * Find archive names that would collide on a case-insensitive filesystem.
 *
 * exFAT preserves case but compares without it, so `Tracers.mp4` and
 * `tracers.mp4` are one file. Silently overwriting a master is the single worst
 * outcome available to this script, so this runs before anything is fetched and
 * a hit is fatal rather than a warning.
 *
 * Exact duplicate slugs land here too, which is correct: the corpus is known to
 * contain rows sharing a slug, and two of those would archive to one name.
 */
export function detectArchiveCollisions(assets) {
  const byFoldedPath = new Map();

  for (const asset of assets) {
    // Unicode-aware case folding, so accented names collide the same way the
    // filesystem would collide them.
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

/** Would this file fit, leaving the reserve intact? */
export function hasRoomFor({ availableBytes, reserveBytes = DEFAULT_RESERVE_BYTES, fileBytes }) {
  if (!Number.isFinite(fileBytes)) {
    // An unknown size cannot be proven to fit. Assume it does not rather than
    // discover it halfway through a write.
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

/**
 * Check the whole job against the volume before starting.
 *
 * With 639 GB free against 44.6 GB of masters this passes trivially today. It
 * stays because the alternative — discovering a full volume at file 90 of 125 —
 * costs hours of re-fetching, and because the destination is an ordinary
 * external drive that anything else can fill.
 */
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

/** Count what is at risk, for the report. Purely descriptive; it changes no behaviour. */
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

/** Local gate. No Convex write happens here, so the deployment ceremony does not apply. */
export function assertArchiveAllowed(command, argv) {
  if (!command?.writeRequested) throw new Error(`${OPERATION} requires --write to download anything.`);
  if (command.dryRun) throw new Error("--dry-run and --write cannot be combined.");
  if (!hasFlag(argv, "--confirm-archive")) {
    throw new Error(`${OPERATION} requires --confirm-archive alongside --write.`);
  }
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

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

/** Stream a URL to disk, landing on `.part` and renaming only once the byte count agrees. */
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

/** Copy to the archive volume via `.part`, then prove the copy byte-for-byte. */
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
  console.log("Convex writes: none — this operation reads public queries and writes local files.\n");

  const archiveDir = getFlagValue(argv, "--archive-dir");
  const scratchDir = getFlagValue(argv, "--scratch-dir");
  const outputDir = getFlagValue(argv, "--output-dir");
  const reserveBytes = Number(getFlagValue(argv, "--reserve-bytes") ?? DEFAULT_RESERVE_BYTES);
  const limit = Number(getFlagValue(argv, "--limit") ?? Infinity);

  if (!archiveDir) throw new Error("Pass --archive-dir=<master archive volume path>.");
  if (!scratchDir) throw new Error("Pass --scratch-dir=<local working directory>.");
  if (!outputDir) throw new Error("Pass --output-dir=<directory for web renditions>.");

  const readUrl = process.env.CONVEX_PUBLIC_READ_URL || process.env.VITE_CONVEX_URL;
  if (!readUrl) {
    throw new Error(
      "Set CONVEX_PUBLIC_READ_URL to the deployment whose rows should be archived. Point it at production — reading from dev resolves storage URLs against the wrong deployment and has already produced one misleading audit.",
    );
  }

  // Checked before the archive directory is created and before the first read.
  // A run missing its confirmation must fail having touched nothing at all.
  if (!command.dryRun) assertArchiveAllowed(command, argv);
  assertToolsAvailable();

  const archiveRoot = path.resolve(archiveDir);
  if (!fs.existsSync(archiveRoot) && !command.dryRun) {
    fs.mkdirSync(archiveRoot, { recursive: true });
  }
  const measuredAgainst = fs.existsSync(archiveRoot) ? archiveRoot : path.dirname(archiveRoot);
  if (!fs.existsSync(measuredAgainst)) {
    throw new Error(`Archive volume is not mounted: ${measuredAgainst}`);
  }
  const availableBytes = availableBytesOn(measuredAgainst);

  const client = new ConvexHttpClient(readUrl);
  const rows = (await client.query(api.replications.getPublicReplications, {})).filter(
    (row) => row.type === "video",
  );

  const assets = buildArchivePlan(rows).slice(0, Number.isFinite(limit) ? limit : undefined);
  const risk = summarizeRisk(assets);
  const budget = planArchiveBudget(assets, { availableBytes, reserveBytes });

  console.log(`Read source : ${readUrl}`);
  console.log(`Archive     : ${archiveRoot}`);
  console.log(`Scratch     : ${path.resolve(scratchDir)}`);
  console.log(`Renditions  : ${path.resolve(outputDir)}\n`);

  console.log("--- Where the media lives ----------------------------------------");
  for (const [host, count] of Object.entries(risk.byHost).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${host}`);
  }
  console.log(`  ${risk.atRisk} of ${risk.total} assets are on a host this project does not control.\n`);

  // --- collision check: must pass before anything is fetched ----------------
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

    // Free space is re-measured immediately before every write. The budget above
    // used row metadata, which is optional in the schema and demonstrably
    // unreliable; this is the check that actually protects the volume.
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
    console.log(`  fetched ${formatBytes(downloaded.bytes)}`);

    // Transcode before archiving, so a volume-full stop still leaves a usable
    // web rendition behind for this row.
    if (asset.kind === "video") {
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
      // An orderly, resumable stop. The fetched master is left in scratch so the
      // next run archives it without re-downloading several GB.
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

    // Release scratch only once the archive copy is proven.
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

  const manifestPath =
    getFlagValue(argv, "--manifest") ?? path.join(path.resolve(outputDir), "archive-manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        operation: OPERATION,
        generatedAt: new Date().toISOString(),
        mode: command.dryRun ? "dry-run" : "write",
        readSource: readUrl,
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

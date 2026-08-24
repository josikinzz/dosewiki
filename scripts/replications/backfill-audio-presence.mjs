#!/usr/bin/env node

/**
 * Backfill `has_audio` on video replications.
 *
 * Reads the public replications API (no credentials), ffprobes each video's
 * delivered URL for an audio stream, and records a {slug, id, has_audio}
 * ledger in this script's work dir. GIF-format rows and images are never
 * probed and never written.
 *
 * Dry run (default) prints the tally and stops. Writing requires the full
 * production-write gate plus an explicit --confirm-production-write flag, and
 * applies the verdicts in batches via `replications.setAudioPresence`.
 *
 * Usage:
 *   node scripts/replications/backfill-audio-presence.mjs                # dry run, full corpus
 *   node scripts/replications/backfill-audio-presence.mjs --limit=5 --max-items=5
 *   node scripts/replications/backfill-audio-presence.mjs --write \
 *     --confirm-write=backfill-audio-presence \
 *     --expected-deployment=<fingerprint> --confirm-production-write
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "backfill-audio-presence";
const FFPROBE = process.env.FFPROBE_BIN ?? "ffprobe";
const DEFAULT_API_BASE = "https://dev.dose.wiki/api/v1";
const DEFAULT_PAGE_LIMIT = 100;
const PROBE_CONCURRENCY = 4;
const PROBE_TIMEOUT_MS = 60_000;
const WRITE_BATCH_SIZE = 100;

const WORK_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "data",
  "audio-presence",
);
const DEFAULT_LEDGER = path.join(WORK_DIR, "audio-presence-ledger.json");

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);

function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

async function fetchAllReplications(apiBase, pageLimit, maxItems) {
  const items = [];
  let cursor = null;
  do {
    const url = new URL(`${apiBase}/replications`);
    url.searchParams.set("limit", String(pageLimit));
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} responded ${response.status}.`);
    }
    const page = await response.json();
    items.push(...page.data);
    cursor = page.pagination?.next_cursor ?? null;
  } while (cursor && items.length < maxItems);
  return items.slice(0, maxItems);
}

/** True when the delivered file has at least one audio stream. */
async function probeHasAudio(url) {
  const { stdout } = await execFileAsync(
    FFPROBE,
    [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      url,
    ],
    { timeout: PROBE_TIMEOUT_MS },
  );
  return stdout.split("\n").some((line) => line.trim() === "audio");
}

async function probeAll(candidates, knownVerdicts) {
  const verdicts = new Map();
  const errors = [];
  const queue = [...candidates];
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const known = knownVerdicts.get(item.slug);
      if (typeof known === "boolean") {
        verdicts.set(item.slug, known);
        console.log(
          `  ${item.slug}: ${known ? "audio" : "silent"} (from ledger)`,
        );
        continue;
      }
      try {
        const hasAudio = await probeHasAudio(item.url);
        verdicts.set(item.slug, hasAudio);
        console.log(`  ${item.slug}: ${hasAudio ? "audio" : "silent"}`);
      } catch (error) {
        errors.push({
          slug: item.slug,
          error: String(error?.message ?? error),
        });
        console.log(`  ${item.slug}: probe failed`);
      }
    }
  }
  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
  return { verdicts, errors };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const apiBase = (
    getFlagValue(argv, "--api-base") ?? DEFAULT_API_BASE
  ).replace(/\/$/, "");
  const pageLimit = Number(getFlagValue(argv, "--limit") ?? DEFAULT_PAGE_LIMIT);
  const maxItemsValue = getFlagValue(argv, "--max-items");
  const maxItems = maxItemsValue === null ? Infinity : Number(maxItemsValue);
  const ledgerPath = path.resolve(
    getFlagValue(argv, "--ledger") ?? DEFAULT_LEDGER,
  );
  const reprobe = hasFlag(argv, "--reprobe");
  if (!(Number.isInteger(pageLimit) && pageLimit >= 1)) {
    throw new Error("--limit must be a positive integer.");
  }
  if (
    !(maxItems === Infinity || (Number.isInteger(maxItems) && maxItems >= 1))
  ) {
    throw new Error("--max-items must be a positive integer.");
  }

  const rows = await fetchAllReplications(apiBase, pageLimit, maxItems);
  const candidates = rows.filter(
    (row) => row.type === "video" && row.format !== "gif",
  );
  const skipped = rows.length - candidates.length;

  const previousLedger =
    !reprobe && fs.existsSync(ledgerPath) ? loadJson(ledgerPath) : null;
  const knownVerdicts = new Map(
    (previousLedger?.entries ?? []).map((entry) => [
      entry.slug,
      entry.has_audio,
    ]),
  );

  console.log(
    `Probing ${candidates.length} videos (${skipped} stills/GIFs skipped)...`,
  );
  const { verdicts, errors } = await probeAll(candidates, knownVerdicts);

  // Convex row ids for the ledger and the write path. Reads need no
  // credential; without a configured target the dry run leaves ids null.
  let idsBySlug = new Map();
  if (command.targetUrl) {
    const client = new ConvexHttpClient(command.targetUrl);
    const liveRows = await client.query(api.replications.getAll, {});
    idsBySlug = new Map(liveRows.map((row) => [row.slug, row]));
  }

  const entries = candidates
    .filter((item) => verdicts.has(item.slug))
    .map((item) => ({
      slug: item.slug,
      id: idsBySlug.get(item.slug)?._id ?? null,
      has_audio: verdicts.get(item.slug),
    }));
  writeJsonAtomic(ledgerPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    apiBase,
    target: command.targetUrl ?? null,
    entries,
    errors,
  });

  const withAudio = entries.filter((entry) => entry.has_audio).length;
  const tally = {
    mode: command.dryRun ? "dry-run" : "write",
    fetched: rows.length,
    probed: entries.length,
    withAudio,
    silent: entries.length - withAudio,
    skippedStillsAndGifs: skipped,
    probeErrors: errors.length,
    ledgerPath,
  };
  console.log(JSON.stringify(tally, null, 2));

  if (command.dryRun) return;

  assertProductionWriteAllowed(command);
  if (!hasFlag(argv, "--confirm-production-write")) {
    throw new Error("Write requires --confirm-production-write.");
  }
  if (errors.length > 0) {
    throw new Error(
      `Refusing to write with ${errors.length} unresolved probe failures.`,
    );
  }
  const unresolved = entries.filter((entry) => entry.id === null);
  if (unresolved.length > 0) {
    throw new Error(
      `${unresolved.length} probed slugs have no production row (e.g. ${unresolved[0].slug}).`,
    );
  }

  const pending = entries.filter(
    (entry) => idsBySlug.get(entry.slug)?.has_audio !== entry.has_audio,
  );
  console.log(
    `Writing ${pending.length} rows (${entries.length - pending.length} already correct)...`,
  );
  const client = new ConvexHttpClient(command.targetUrl);
  const maintenanceKey = requireProductionWriteCredential(
    "replicationMaintenance",
  ).token;
  let written = 0;
  for (let start = 0; start < pending.length; start += WRITE_BATCH_SIZE) {
    const batch = pending.slice(start, start + WRITE_BATCH_SIZE);
    const result = await client.mutation(api.replications.setAudioPresence, {
      apiKey: maintenanceKey,
      entries: batch.map(({ id, has_audio }) => ({ id, has_audio })),
    });
    written += result.updated;
  }
  console.log(JSON.stringify({ written, total: pending.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

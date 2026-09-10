#!/usr/bin/env node
/**
 * Import Effect Index audio replication metadata for locally available media.
 *
 * Usage:
 *   node scripts/replications/import-audio-replications.mjs
 *   node scripts/replications/import-audio-replications.mjs --write --confirm-audio-import \
 *     --confirm-write=import-audio-replications --expected-deployment=<deployment>
 *
 * The default is a dry run. Records whose media is absent from public/audio are
 * skipped so recovered files can be picked up by rerunning this script.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const EFFECT_INDEX_ROOT = "/Users/josie/Documents/Utilities/EffectIndex-master";
const DUMP_PATH = path.join(EFFECT_INDEX_ROOT, "effectindex_dump", "replications.json");
const MARKDOWN_PATH = path.join(EFFECT_INDEX_ROOT, "audio_replications.md");
const AUDIO_DIRECTORY = path.join(REPO_ROOT, "public", "audio");

const EFFECT_BY_AUDIO_SLUG = new Map([
  ["distorted-forests", "auditory-distortion"],
  ["distorted-nonsensical-math-lecture", "auditory-distortion"],
  ["dmt-drone", "auditory-hallucination"],
  ["sinister-hallucinatory-voices", "auditory-hallucination"],
  ["normal-vs-suppressed-watts-lecture", "auditory-suppression"],
  ["deliriant-audio", "auditory-hallucination"],
  ["psilocybin-auditory-effects", "auditory-hallucination"],
  ["volume-warning-8000-hz-tinnitus-replication", "tinnitus"],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseAudioMarkdownTable(markdown) {
  const tableStart = markdown.indexOf("| Title | Filename | Artist | Artist URL | Description |");
  if (tableStart === -1) {
    throw new Error(`Could not find the audio metadata table in ${MARKDOWN_PATH}.`);
  }

  const table = markdown.slice(tableStart).split(/\r?\n/u);
  const records = new Map();

  for (const line of table.slice(2)) {
    if (!line.startsWith("|")) {
      break;
    }

    const columns = line.split("|").slice(1, -1).map((value) => value.trim());
    if (columns.length < 9) {
      throw new Error(`Malformed audio metadata row: ${line}`);
    }

    const [title, filename, artist, artistUrl, description] = columns;
    records.set(filename, {
      title,
      artist,
      artist_url: artistUrl || undefined,
      description,
    });
  }

  return records;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildImportPlan() {
  const dump = readJson(DUMP_PATH);
  const markdownMetadata = parseAudioMarkdownTable(fs.readFileSync(MARKDOWN_PATH, "utf8"));
  const payloadsByEffect = new Map();
  const skipped = [];

  for (const replication of dump.filter((record) => record.type === "audio")) {
    const audioSlug = replication.url;
    const effectSlug = EFFECT_BY_AUDIO_SLUG.get(audioSlug);
    if (!effectSlug) {
      throw new Error(`No DoseWiki effect mapping for audio replication ${audioSlug}.`);
    }

    const filename = replication.resource;
    const markdownRecord = markdownMetadata.get(filename);
    if (!markdownRecord) {
      throw new Error(`Missing Markdown metadata for audio file ${filename}.`);
    }

    const markdownArtistUrl = normalizeOptionalString(markdownRecord.artist_url);
    const dumpArtistUrl = normalizeOptionalString(replication.artist_url);
    if (markdownArtistUrl && dumpArtistUrl && markdownArtistUrl !== dumpArtistUrl) {
      throw new Error(`Conflicting artist URLs for ${audioSlug}.`);
    }
    const sourceArtistUrl = markdownArtistUrl ?? dumpArtistUrl;

    const destination = path.join(AUDIO_DIRECTORY, filename);
    if (!fs.existsSync(destination)) {
      skipped.push({ audioSlug, effectSlug, filename, reason: "media file is absent from public/audio" });
      continue;
    }

    const metadata = {
      title: markdownRecord.title,
      artist: markdownRecord.artist,
      ...(sourceArtistUrl ? { artist_url: sourceArtistUrl } : {}),
      description: markdownRecord.description,
      resource: `/audio/${filename}`,
    };
    const existing = payloadsByEffect.get(effectSlug) ?? [];
    existing.push(metadata);
    payloadsByEffect.set(effectSlug, existing);
  }

  return { payloadsByEffect, skipped };
}

function printPlan(payloadsByEffect, skipped) {
  console.log("Audio replication import plan:\n");
  for (const [effectSlug, audioReplications] of payloadsByEffect) {
    console.log(JSON.stringify({ slug: effectSlug, updates: { audio_replications: audioReplications } }, null, 2));
  }

  console.log(`\nSkipped ${skipped.length} audio replication(s):`);
  for (const entry of skipped) {
    console.log(`- ${entry.audioSlug} → ${entry.effectSlug}: ${entry.filename} (${entry.reason})`);
  }
}

async function main() {
  const command = createProductionWriteCommand({
    operation: "import-audio-replications",
  });
  const { payloadsByEffect, skipped } = buildImportPlan();

  printPlan(payloadsByEffect, skipped);
  if (command.dryRun) {
    console.log("\n[DRY RUN] No Convex mutations were called.");
    return;
  }
  if (!process.argv.includes("--confirm-audio-import")) {
    throw new Error("Writing audio replications requires --confirm-audio-import.");
  }

  assertProductionWriteAllowed(command);
  const credential = requireProductionWriteCredential("replicationMaintenance");
  const client = createDataClient({ target: command.targetUrl }).client;

  for (const [slug, audioReplications] of payloadsByEffect) {
    await client.mutation(api.subjectiveEffects.update, {
      apiKey: credential.token,
      slug,
      updates: { audio_replications: audioReplications },
    });
    console.log(`Updated ${slug} with ${audioReplications.length} audio replication(s).`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createDataClient, resolvePostgresSource, resolvePostgresTarget, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { getFlagValue, loadEnvFiles } from "../lib/data-ops-run-context.mjs";
import { buildProvenanceAudit } from "./lib/provenance-audit.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const args = normalizeArgv(process.argv.slice(2));
const DUMP_DIR_FLAG = getFlagValue(args, "--dump-dir");
const OUTPUT_DIR = path.resolve(getFlagValue(args, "--output-dir") ?? path.join(homedir(), ".local/state/dosewiki-housecleaning/replication-provenance"));
const NO_WRITE = args.includes("--no-write");
const WRITE_REPORTS = args.includes("--reports");
const INPUT_PATH = getFlagValue(args, "--input");
if (args.includes("--help")) {
  console.log("Usage: bun scripts/replications/audit-provenance.mjs [--output-dir <private-directory>] [--no-write] [--reports] [--skip-health] --dump-dir <effectindex-dump-directory> [--input <local-fixture.json>]");
  console.log("Defaults to private JSON output under ~/.local/state/dosewiki-housecleaning/replication-provenance. --reports also writes Markdown and HTML. --no-write emits summary only. --skip-health does not fetch or reuse cached health. --input reads {liveReplications, effects} locally instead of Postgres; combine with --skip-health for offline use.");
  process.exit(0);
}
if (!DUMP_DIR_FLAG) throw new Error("--dump-dir <directory> is required: the Effect Index archive dump (replications.json, effects.json) is not stored in this repository.");
const DUMP_DIR = path.resolve(DUMP_DIR_FLAG);
const JSON_PATH = path.join(OUTPUT_DIR, "audit-latest.json");
const MARKDOWN_PATH = path.join(OUTPUT_DIR, "audit-latest.md");
const CONTACT_SHEET_PATH = path.join(OUTPUT_DIR, "contact-sheet.html");
const SKIP_HEALTH = process.argv.includes("--skip-health");
const TARGET_DEPLOYMENT = process.argv.some((arg) => arg === "--target" || arg.startsWith("--target=")) || Boolean(process.env.TARGET_POSTGRES_URL);

function normalizeArgv(argv) {
  const normalized = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--output-dir", "--dump-dir", "--input"].includes(value)) {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Missing value for ${value}`);
      normalized.push(`${value}=${argv[++index]}`);
    } else {
      normalized.push(value);
    }
  }
  return normalized;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function objectId(value) {
  return typeof value === "string" ? value : value?.$oid ?? null;
}

async function fetchHealth(url) {
  if (!url) return { state: "missing", status: null, content_type: null };
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    await response.body?.cancel();
    return {
      state: response.ok ? "ok" : "broken",
      status: response.status,
      content_type: response.headers.get("content-type"),
      final_url: response.url,
    };
  } catch (error) {
    return { state: "broken", status: null, content_type: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function mapConcurrent(items, concurrency, fn) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await fn(items[index], index);
    }
  }));
  return output;
}

async function resolveHealth(replications) {
  if (SKIP_HEALTH) return new Map();
  const rows = await mapConcurrent(replications, 8, async (replication, index) => {
    process.stderr.write(`\rChecking media ${index + 1}/${replications.length}`);
    const media = await fetchHealth(replication.url);
    const thumbnail = replication.type === "video"
      ? await fetchHealth(replication.thumbnail_url)
      : { state: "not-applicable", status: null, content_type: null };
    return [String(replication._id), {
      media: media.state,
      media_status: media.status,
      media_content_type: media.content_type,
      media_final_url: media.final_url,
      media_error: media.error,
      thumbnail: thumbnail.state,
      thumbnail_status: thumbnail.status,
      thumbnail_content_type: thumbnail.content_type,
      thumbnail_final_url: thumbnail.final_url,
      thumbnail_error: thumbnail.error,
    }];
  });
  process.stderr.write("\n");
  return new Map(rows);
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function writeContactSheet(audit) {
  const suspects = audit.records.filter((record) => record.symptoms.length > 0);
  const cards = suspects.map((record) => {
    const media = record.current.type === "video"
      ? `<video src="${escapeHtml(record.current.url)}" poster="${escapeHtml(record.current.thumbnail_url)}" controls muted preload="none"></video>`
      : record.current.url
        ? `<img src="${escapeHtml(record.current.url)}" alt="${escapeHtml(record.current.title)}" loading="lazy">`
        : '<div class="missing">Media unavailable</div>';
    const proposed = record.proposal
      ? `<p class="proposal"><b>Proposed:</b> ${escapeHtml(record.proposal.title)} — ${escapeHtml(record.proposal.artist)}</p>`
      : "";
    return `<article id="${escapeHtml(record.slug)}">${media}<div class="copy"><code>${escapeHtml(record.slug)}</code><h2>${escapeHtml(record.current.title)}</h2><p>${escapeHtml(record.current.artist || "Unknown")}</p>${proposed}<p class="symptoms">${record.symptoms.map(escapeHtml).join(" · ")}</p><p>${record.evidence.map((row) => `${escapeHtml(row.title)} — ${escapeHtml(row.artist)}`).join("<br>")}</p></div></article>`;
  }).join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Replication provenance contact sheet</title><style>body{margin:0;background:#171714;color:#eee7da;font:14px system-ui;padding:24px}header{max-width:1200px;margin:auto auto 24px}main{max-width:1200px;margin:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}article{background:#24211c;border:1px solid #4a443b;min-width:0}img,video,.missing{width:100%;aspect-ratio:4/3;object-fit:contain;background:#0e0d0b}.missing{display:grid;place-items:center;color:#c88168}.copy{padding:14px}h2{font:20px Georgia;margin:10px 0 4px}p{margin:5px 0;color:#bdb3a6;overflow-wrap:anywhere}code{font-size:10px;color:#87b6ca}.proposal{color:#aac4a3}.symptoms{color:#dfb966;font-size:11px}</style></head><body><header><h1>Replication provenance contact sheet</h1><p>${suspects.length} suspect records · generated ${escapeHtml(audit.generated_at)}</p></header><main>${cards}</main></body></html>`;
  fs.writeFileSync(CONTACT_SHEET_PATH, html, { mode: 0o600 });
}

function writeMarkdown(audit) {
  const proposed = audit.records.filter((record) => record.proposal);
  const holds = audit.records.filter((record) => record.action === "hold");
  const broken = audit.records.filter((record) => ["recover", "regenerate-thumbnail"].includes(record.action));
  const lines = [
    "# Replication provenance audit",
    "",
    `Generated: ${audit.generated_at}`,
    "",
    `- Live records: **${audit.summary.total}**`,
    `- Suspect records: **${audit.summary.suspect}**`,
    `- Archive-supported proposals: **${audit.summary.proposed}**`,
    `- Unresearched/held: **${audit.summary.unresearched + audit.summary.traced}**`,
    `- Broken media: **${audit.summary.broken_media}**`,
    `- Missing/broken video thumbnails: **${audit.summary.missing_thumbnails}**`,
    "",
    "## Archive-supported correction proposals",
    "",
    "| Slug | Current | Proposed | Evidence |",
    "| --- | --- | --- | --- |",
    ...proposed.map((row) => `| ${row.slug} | ${row.current.title} — ${row.current.artist} | ${row.proposal.title} — ${row.proposal.artist} | ${row.evidence.map((evidence) => `Effect Index ${evidence.effect_index_id}`).join(", ")} |`),
    "",
    "## Media recovery queue",
    "",
    ...broken.map((row) => `- **${row.slug}** — ${row.action}; media=${row.health.media}, thumbnail=${row.health.thumbnail}`),
    "",
    "## Held for research",
    "",
    ...holds.map((row) => `- **${row.slug}** — ${row.symptoms.join(", ")}`),
    "",
    "The JSON artifact is canonical. This Markdown file is a review summary.",
    "",
  ];
  fs.writeFileSync(MARKDOWN_PATH, lines.join("\n"), { mode: 0o600 });
}

async function main() {
  let liveReplications;
  let effects;
  let sourceFingerprint = null;
  if (INPUT_PATH) {
    ({ liveReplications, effects } = readJson(path.resolve(INPUT_PATH)));
    if (!Array.isArray(liveReplications) || !Array.isArray(effects)) {
      throw new Error("Local input must contain liveReplications and effects arrays.");
    }
  } else {
    loadEnvFiles({ rootDir: ROOT });
    const selected = TARGET_DEPLOYMENT ? resolvePostgresTarget({ explicitOnly: true }) : resolvePostgresSource();
    if (!selected.url) throw new Error("Set --source-url/SOURCE_POSTGRES_URL or an explicit --target/TARGET_POSTGRES_URL.");
    sourceFingerprint = postgresFingerprintFromUrl(selected.url);
    const client = createDataClient({ target: selected.url }).client;
    [liveReplications, effects] = await Promise.all([
      client.query(api.replications.getPublicReplications, {}),
      client.query(api.subjectiveEffects.getAll, {}),
    ]);
  }
  const effectIndexReplications = readJson(path.join(DUMP_DIR, "replications.json"));
  const effectIndexEffects = readJson(path.join(DUMP_DIR, "effects.json"));
  const effectsById = new Map(effectIndexEffects.map((effect) => [objectId(effect._id), effect]));
  const healthById = await resolveHealth(liveReplications);
  const audit = buildProvenanceAudit({ liveReplications, effectIndexReplications, effectsById, healthById });
  audit.sources = { postgres_target: sourceFingerprint, target_selected: !INPUT_PATH && TARGET_DEPLOYMENT, local_input: INPUT_PATH ? path.resolve(INPUT_PATH) : null, health_checks: SKIP_HEALTH ? "skipped; no cached results reused" : "current run", live_effects_count: effects.length, effect_index_dump: DUMP_DIR, effect_index_replications_count: effectIndexReplications.length };
  const outputs = {};
  if (!NO_WRITE) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(JSON_PATH, `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o600 });
    outputs.json = JSON_PATH;
    if (WRITE_REPORTS) {
      writeMarkdown(audit);
      writeContactSheet(audit);
      outputs.markdown = MARKDOWN_PATH;
      outputs.contact_sheet = CONTACT_SHEET_PATH;
    }
  }
  console.log(JSON.stringify({ outputs, health_checks: audit.sources.health_checks, summary: audit.summary }, null, 2));
}

await main();

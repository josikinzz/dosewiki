#!/usr/bin/env node
import crypto from "node:crypto";
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OPERATION = "apply-replication-editorial-review-v2";
const DEFAULT_BASE_INPUT = "/Users/josie/Downloads/dose-wiki-replication-review (1).json";
const DEFAULT_INPUT = "/Users/josie/Downloads/dose-wiki-replication-review (2).json";
const DEFAULT_AUDIO = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/production-video-audio-streams.json";
const DEFAULT_LEDGER = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/replication-editorial-review-v2-ledger.json";
const DEFAULT_PLAN = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/replication-editorial-review-v2-plan.json";

const EXPECTED_ADDED_NOTES = 15;
const AYAHUASCA_KEYWORDS = /shipibo|shapibo/i;

// The second export is cumulative. These directives cover only replication IDs
// that are new relative to the first reviewed export. Add/remove operations are
// applied to the current production effect set so unrelated newer curation is
// preserved. `set` is reserved for notes that explicitly say "only".
const ROW_DIRECTIVES = new Map(Object.entries({
  k575yn7yvk1k2yb0qa4fq2p5998cmcdd: {
    slug: "dark-alley-trip-v2-loka",
    add: ["recursion"],
    remove: ["symmetrical-texture-repetition"],
  },
  k572qr30e7e72xtm49q5bs8qd58cmfrc: {
    slug: "forest-walkthrough-shipibo-loka",
    set: ["chromatic-aberration", "drifting"],
  },
  k57a4fmr081gwebk9rmspresth8cmp3z: {
    slug: "from-0-to-biiiiuuuuuuu-loka",
    set: ["colour-shifting", "geometry", "drifting"],
  },
  k57enhy171wap85b88e0pxravx8cmrkk: {
    slug: "ground-tiles-v1-loka",
    add: ["geometry"],
  },
  k571h4zbyx5ndekwpvcv2wzjg98cn304: {
    slug: "happy-feet-eyes-loka",
    set: ["drifting", "increased-pareidolia"],
  },
  k570bye5h6pnexta52k19hrh3s8cntpr: {
    slug: "loka-grass-loka",
    set: ["environmental-patterning"],
  },
  k571yt7bpkknw3h32j58swtv2d8cma0q: {
    slug: "peaches-loka",
    set: ["drifting"],
  },
  k573pndkykwn4cad5k5y3tzmfn8cmd8n: {
    slug: "staring-at-moss-loka",
    set: ["environmental-patterning", "drifting", "symmetrical-texture-repetition"],
  },
  k57fc80pb115crxtskg1zp1xyn8cm3xx: {
    slug: "stream-patterns-loka",
    set: ["environmental-patterning", "drifting", "texture-liquidation"],
  },
  k57aw8q1q60mptkv1evx6rmz2n8cnhwq: {
    slug: "totoro-loka",
    set: ["increased-pareidolia", "transformations"],
  },
  k579499t4gmv045theawr194gh8cmmnk: {
    slug: "wood-texture-morph-loka",
    add: ["geometry"],
  },
}));

const ARTIST_REMOVALS = new Map([
  ["lukebrown", new Set(["symmetrical-texture-repetition"])],
  ["luistamani", new Set(["symmetrical-texture-repetition"])],
  ["loka", new Set(["object-alteration"])],
]);

const REQUIRED_NEW_NOTE_IDS = new Set([
  ...ROW_DIRECTIVES.keys(),
  "k5774bqp5dvz57zznf9xj95jt58cnhrr", // Luke Brown artist-wide removal.
  "k57eyf81vg85xdbtwqh9d86xx98cmtv9", // Luis Tamani artist-wide removal.
  "k57dek5rkb46r5b7npqk4cmqm98cm7se", // Loka artist-wide removal.
  "k570m90bp0tkftk6jc0drhxdq98cngsr", // Ayahuasca keyword rule.
]);

function flagValue(name) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stable(entry)]),
  );
}

function digest(value) {
  return sha256(JSON.stringify(stable(value)));
}

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}

function artistKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function effectListOf(row) {
  return [...new Set([row.effect_slug, ...(row.effect_tags ?? [])].filter(Boolean))];
}

function editorialSnapshot(row) {
  return {
    title: row.title,
    artist: row.artist,
    role: row.role ?? "replication",
    effect_slug: row.effect_slug ?? null,
    credit_line: row.credit_line ?? null,
    effect_tags: [...(row.effect_tags ?? [])].sort(),
  };
}

function editorialUpdate(row, effects) {
  const unique = [...new Set(effects)];
  return {
    ...editorialSnapshot(row),
    effect_slug: unique[0] ?? null,
    effect_tags: unique.slice(1).sort(),
  };
}

function assertCumulativeExport(baseDocument, notesDocument) {
  if (baseDocument.notes?.length !== 186 || notesDocument.notes?.length !== 201) {
    throw new Error("Expected the 186-note base export and 201-note cumulative v2 export.");
  }
  const currentById = new Map(notesDocument.notes.map((note) => [note.replicationId, note]));
  for (const note of baseDocument.notes) {
    const current = currentById.get(note.replicationId);
    if (!current || !sameJson(current, note)) {
      throw new Error(`${note.slug}: a previously reviewed note changed in the cumulative export.`);
    }
  }
  const baseIds = new Set(baseDocument.notes.map((note) => note.replicationId));
  const added = notesDocument.notes.filter((note) => !baseIds.has(note.replicationId));
  if (added.length !== EXPECTED_ADDED_NOTES) {
    throw new Error(`Expected ${EXPECTED_ADDED_NOTES} new notes; found ${added.length}.`);
  }
  const addedIds = new Set(added.map((note) => note.replicationId));
  if (
    addedIds.size !== REQUIRED_NEW_NOTE_IDS.size
    || [...REQUIRED_NEW_NOTE_IDS].some((id) => !addedIds.has(id))
  ) {
    throw new Error("The cumulative export's new-note identity set is not the reviewed v2 set.");
  }
  return added;
}

function applyDirective(effects, directive) {
  const retainedGlobalAudio = effects.filter((effect) =>
    effect === "auditory-distortion" || effect === "auditory-hallucination"
  );
  const starting = directive.set ? [...directive.set, ...retainedGlobalAudio] : [...effects];
  const removals = new Set(directive.remove ?? []);
  return [...new Set([...starting.filter((effect) => !removals.has(effect)), ...(directive.add ?? [])])];
}

function buildPlan({ addedNotes, liveRows, audioDocument, effectSlugs }) {
  const liveById = new Map(liveRows.map((row) => [row._id, row]));
  for (const note of addedNotes) {
    const row = liveById.get(note.replicationId);
    if (!row) throw new Error(`${note.slug}: new-note replication is missing from production.`);
    if (row.slug !== note.slug) {
      throw new Error(`${note.replicationId}: live slug ${row.slug} does not match ${note.slug}.`);
    }
  }

  const effectsById = new Map(liveRows.map((row) => [row._id, effectListOf(row)]));
  const sourceNoteIdsByRow = new Map();
  for (const [id, directive] of ROW_DIRECTIVES) {
    const row = liveById.get(id);
    if (!row || row.slug !== directive.slug) {
      throw new Error(`${directive.slug}: row directive identity check failed.`);
    }
    effectsById.set(id, applyDirective(effectsById.get(id) ?? [], directive));
    sourceNoteIdsByRow.set(id, [id]);
  }

  for (const row of liveRows) {
    const removals = ARTIST_REMOVALS.get(artistKey(row.artist));
    if (!removals) continue;
    const current = effectsById.get(row._id) ?? [];
    if (!current.some((effect) => removals.has(effect))) continue;
    const next = current.filter((effect) => !removals.has(effect));
    if (next.length === 0) {
      throw new Error(`${row.slug}: artist-wide removal would leave no subjective effect.`);
    }
    effectsById.set(row._id, next);
    const sourceId = artistKey(row.artist) === "lukebrown"
      ? "k5774bqp5dvz57zznf9xj95jt58cnhrr"
      : artistKey(row.artist) === "luistamani"
        ? "k57eyf81vg85xdbtwqh9d86xx98cmtv9"
        : "k57dek5rkb46r5b7npqk4cmqm98cm7se";
    sourceNoteIdsByRow.set(row._id, [...new Set([...(sourceNoteIdsByRow.get(row._id) ?? []), sourceId])]);
  }

  const addedNoteIds = new Set(addedNotes.map((note) => note.replicationId));
  const audioById = new Map(audioDocument.records.map((record) => [record.id, record]));
  for (const id of addedNoteIds) {
    if (!audioById.get(id)?.has_audio) continue;
    const effects = effectsById.get(id) ?? [];
    if (!effects.includes("auditory-distortion")) effects.push("auditory-distortion");
    effectsById.set(id, effects);
  }

  const updates = [];
  for (const row of liveRows) {
    const effects = effectsById.get(row._id) ?? effectListOf(row);
    const expected = editorialSnapshot(row);
    const next = editorialUpdate(row, effects);
    if (!sameJson(expected, next)) {
      for (const effect of effects) {
        if (!effectSlugs.has(effect)) {
          throw new Error(`${row.slug}: planned effect does not exist: ${effect}`);
        }
      }
      updates.push({
        id: row._id,
        slug: row.slug,
        expected,
        updates: next,
        sourceNoteIds: sourceNoteIdsByRow.get(row._id) ?? [],
      });
    }
  }

  const ayahuascaSlugs = liveRows
    .filter((row) => AYAHUASCA_KEYWORDS.test(`${row.slug} ${row.title} ${row.artist}`))
    .map((row) => row.slug)
    .sort();
  if (ayahuascaSlugs.length === 0) {
    throw new Error("The Ayahuasca Shipibo/Shipibo-Konibo rule matched no live replications.");
  }

  return {
    updates,
    playlists: [{ substanceSlug: "ayahuasca", addSlugs: ayahuascaSlugs }],
  };
}

async function readGallery(client, substanceSlug) {
  return await client.query(api.substanceGalleries.getBySubstance, {
    substance_slug: substanceSlug,
  });
}

async function verify(client, plan) {
  const rows = await client.query(api.replications.getAll, {});
  const byId = new Map(rows.map((row) => [row._id, row]));
  const updateMismatches = plan.updates.filter(
    (entry) => !sameJson(editorialSnapshot(byId.get(entry.id) ?? {}), entry.updates),
  );
  const playlistMismatches = [];
  for (const entry of plan.playlists) {
    const gallery = await readGallery(client, entry.substanceSlug);
    const stored = new Set(gallery?.curated_slugs ?? []);
    const missing = entry.addSlugs.filter((slug) => !stored.has(slug));
    if (missing.length > 0) playlistMismatches.push({ substanceSlug: entry.substanceSlug, missing });
  }
  return { updateMismatches, playlistMismatches };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION, startDir: ROOT });
  printProductionWriteCommand(command);
  if (!command.targetUrl) throw new Error("Set TARGET_CONVEX_URL or pass --target-url.");

  const baseInputPath = path.resolve(flagValue("--base-input") ?? DEFAULT_BASE_INPUT);
  const inputPath = path.resolve(flagValue("--input") ?? DEFAULT_INPUT);
  const audioPath = path.resolve(flagValue("--audio-inventory") ?? DEFAULT_AUDIO);
  const ledgerPath = path.resolve(flagValue("--ledger") ?? DEFAULT_LEDGER);
  const planPath = path.resolve(flagValue("--plan") ?? DEFAULT_PLAN);
  const baseInputBytes = fs.readFileSync(baseInputPath);
  const inputBytes = fs.readFileSync(inputPath);
  const audioBytes = fs.readFileSync(audioPath);
  const baseDocument = JSON.parse(baseInputBytes);
  const notesDocument = JSON.parse(inputBytes);
  const audioDocument = JSON.parse(audioBytes);
  const addedNotes = assertCumulativeExport(baseDocument, notesDocument);
  if (audioDocument.successfulProbes !== audioDocument.totalVideos) {
    throw new Error("The video audio inventory is incomplete.");
  }

  const client = new ConvexHttpClient(command.targetUrl);
  const [liveRows, effects] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.subjectiveEffects.getAll, {}),
  ]);
  const sourceSha256 = sha256(inputBytes);
  const baseSourceSha256 = sha256(baseInputBytes);
  const audioInventorySha256 = sha256(audioBytes);
  const frozenPlan = !command.dryRun && fs.existsSync(planPath)
    ? JSON.parse(fs.readFileSync(planPath, "utf8"))
    : null;
  if (!command.dryRun && !frozenPlan) {
    throw new Error(`Write requires the reviewed dry-run plan at ${planPath}.`);
  }
  if (
    frozenPlan
    && (
      frozenPlan.sourceSha256 !== sourceSha256
      || frozenPlan.baseSourceSha256 !== baseSourceSha256
      || frozenPlan.audioInventorySha256 !== audioInventorySha256
    )
  ) {
    throw new Error("Frozen plan source hashes do not match the current editorial inputs.");
  }
  if (frozenPlan && frozenPlan.summary?.target !== command.deploymentFingerprint) {
    throw new Error("Frozen plan target does not match the requested deployment.");
  }
  const plan = frozenPlan?.plan ?? buildPlan({
    addedNotes,
    liveRows,
    audioDocument,
    effectSlugs: new Set(effects.map((effect) => effect.slug)),
  });
  const payloadDigest = digest(plan);
  if (frozenPlan && frozenPlan.payloadDigest !== payloadDigest) {
    throw new Error("Frozen plan payload digest is invalid.");
  }

  const summary = {
    mode: command.dryRun ? "dry-run" : "write",
    target: command.deploymentFingerprint,
    sourceSha256,
    baseSourceSha256,
    audioInventorySha256,
    payloadDigest,
    liveRows: liveRows.length,
    cumulativeNoteCount: notesDocument.notes.length,
    newNoteCount: addedNotes.length,
    priorDeletedNoteTargets: baseDocument.notes.filter(
      (note) => !liveRows.some((row) => row._id === note.replicationId),
    ).length,
    updates: plan.updates.length,
    directUpdates: plan.updates.filter((entry) => REQUIRED_NEW_NOTE_IDS.has(entry.id)).length,
    artistWideAdditionalUpdates: plan.updates.filter((entry) => !REQUIRED_NEW_NOTE_IDS.has(entry.id)).length,
    playlistSubstances: plan.playlists.length,
    playlistPairs: plan.playlists.reduce((sum, entry) => sum + entry.addSlugs.length, 0),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (command.dryRun) {
    writeJsonAtomic(planPath, {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      baseSourcePath: baseInputPath,
      sourcePath: inputPath,
      audioInventoryPath: audioPath,
      sourceSha256,
      baseSourceSha256,
      audioInventorySha256,
      payloadDigest,
      summary,
      plan,
    });
    console.log(JSON.stringify({ planPath, playlists: plan.playlists }, null, 2));
    return;
  }

  assertProductionWriteAllowed(command);
  if (!process.argv.includes("--confirm-editorial-review-v2")) {
    throw new Error("Write requires --confirm-editorial-review-v2.");
  }
  if (flagValue("--digest") !== payloadDigest) {
    throw new Error(`Write requires --digest=${payloadDigest}.`);
  }

  const maintenanceKey = requireProductionWriteCredential("replicationMaintenance").token;
  const editorKey = requireProductionWriteCredential("editorArticleWrite").token;
  const previousLedger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : null;
  if (previousLedger && previousLedger.payloadDigest !== payloadDigest) {
    throw new Error("Existing ledger belongs to a different editorial payload.");
  }
  if (previousLedger && previousLedger.target !== command.targetUrl) {
    throw new Error("Existing ledger belongs to a different deployment.");
  }
  const ledger = previousLedger ?? {
    schemaVersion: 1,
    payloadDigest,
    sourceSha256,
    target: command.targetUrl,
    startedAt: new Date().toISOString(),
    completed: {},
  };
  const checkpoint = (key, result) => {
    ledger.completed[key] = { completedAt: new Date().toISOString(), result };
    writeJsonAtomic(ledgerPath, ledger);
  };

  const writeRows = await client.query(api.replications.getAll, {});
  const writeRowsById = new Map(writeRows.map((row) => [row._id, row]));
  for (const entry of plan.updates) {
    const key = `update:${entry.id}`;
    if (ledger.completed[key]) continue;
    const live = writeRowsById.get(entry.id);
    if (live && sameJson(editorialSnapshot(live), entry.updates)) {
      checkpoint(key, { status: "already-applied", slug: entry.slug });
      continue;
    }
    if (!live || !sameJson(editorialSnapshot(live), entry.expected)) {
      throw new Error(`${entry.slug}: live editorial fields no longer match the frozen plan.`);
    }
    const result = await client.mutation(api.replications.updateEditorialFields, {
      apiKey: maintenanceKey,
      id: entry.id,
      expected: entry.expected,
      updates: entry.updates,
    });
    checkpoint(key, result);
  }

  for (const entry of plan.playlists) {
    const key = `playlist:${entry.substanceSlug}`;
    if (ledger.completed[key]) continue;
    const existing = await readGallery(client, entry.substanceSlug);
    const curated = [...new Set([...(existing?.curated_slugs ?? []), ...entry.addSlugs])];
    const removed = (existing?.removed_slugs ?? []).filter((slug) => !entry.addSlugs.includes(slug));
    const result = await client.mutation(api.substanceGalleries.upsert, {
      apiKey: editorKey,
      substance_slug: entry.substanceSlug,
      curated_slugs: curated,
      removed_slugs: removed,
      updatedBy: `${OPERATION}@dosewiki.internal`,
      expectedUpdatedAt: existing?.updated_at ?? null,
    });
    if (result.status !== "ok") {
      throw new Error(`${entry.substanceSlug}: gallery changed during the write.`);
    }
    if (result.pruned_curated.length > 0) {
      throw new Error(`${entry.substanceSlug}: curated slugs were unexpectedly pruned: ${result.pruned_curated.join(", ")}`);
    }
    checkpoint(key, result);
  }

  const verification = await verify(client, plan);
  if (verification.updateMismatches.length > 0 || verification.playlistMismatches.length > 0) {
    throw new Error(`Verification failed:\n${JSON.stringify(verification, null, 2)}`);
  }
  ledger.completedAt = new Date().toISOString();
  ledger.verification = {
    updates: plan.updates.length,
    playlistSubstances: plan.playlists.length,
    playlistPairs: plan.playlists.reduce((sum, entry) => sum + entry.addSlugs.length, 0),
  };
  writeJsonAtomic(ledgerPath, ledger);
  console.log(JSON.stringify({ complete: true, verification: ledger.verification, ledgerPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

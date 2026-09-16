#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OPERATION = "apply-replication-editorial-review";
const DEFAULT_INPUT = "/Users/josie/Downloads/dose-wiki-replication-review (1).json";
const DEFAULT_AUDIO = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/production-video-audio-streams.json";
const DEFAULT_LEDGER = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/replication-editorial-review-ledger.json";
const DEFAULT_PLAN = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/replication-editorial-review-plan.json";
const DELIRIANT_SUBSTANCES = [
  "benzydamine",
  "datura",
  "dimenhydrinate",
  "diphenhydramine",
  "nutmeg",
  "scopolamine",
];
const CUSTOM_EFFECT_SLUGS = new Set([
  "aesthetic-distillation",
  "blurred-vision",
  "diffraction-spikes",
  "immersive-hallucinations",
  "unknown",
]);

const NOTE_EFFECTS = new Map(Object.entries({
  1: ["visual-twisting", "chromatic-aberration", "geometry"],
  3: ["external-hallucination", "delirium"],
  4: ["autonomous-entity", "geometry", "internal-hallucination"],
  5: ["colour-shifting", "drifting", "symmetrical-texture-repetition"],
  6: ["tracers", "after-images"],
  7: ["autonomous-entity", "geometry"],
  8: ["geometry"],
  9: ["autonomous-entity"],
  10: ["tracers", "geometry"],
  12: ["autonomous-entity", "geometry", "settings-sceneries-and-landscapes"],
  13: ["autonomous-entity", "settings-sceneries-and-landscapes", "scenarios-and-plots", "geometry", "internal-hallucination", "immersive-hallucinations"],
  14: ["autonomous-entity", "geometry"],
  15: ["drifting", "geometry", "colour-shifting"],
  16: ["drifting"],
  17: ["unspeakable-horrors"],
  18: ["settings-sceneries-and-landscapes", "geometry", "immersive-hallucinations"],
  19: ["drifting", "geometry"],
  20: ["geometry", "autonomous-entity"],
  21: ["geometry", "internal-hallucination"],
  22: ["drifting", "texture-liquidation"],
  23: ["drifting", "geometry"],
  24: ["geometry"],
  25: ["geometry", "internal-hallucination", "settings-sceneries-and-landscapes"],
  26: ["autonomous-entity"],
  27: ["geometry", "settings-sceneries-and-landscapes"],
  28: ["geometry", "drifting"],
  29: ["geometry"],
  30: ["internal-hallucination"],
  31: ["chromatic-aberration", "drifting", "visual-acuity-suppression", "recursion"],
  32: ["autonomous-entity", "settings-sceneries-and-landscapes"],
  33: ["geometry"],
  34: ["internal-hallucination", "autonomous-entity"],
  36: ["drifting", "auditory-distortion", "auditory-hallucination", "environmental-patterning"],
  37: ["geometry"],
  38: ["symmetrical-texture-repetition", "texture-liquidation"],
  39: ["geometry"],
  40: ["settings-sceneries-and-landscapes"],
  41: ["symmetrical-texture-repetition", "geometry", "environmental-patterning"],
  42: ["geometry", "drifting"],
  43: ["magnification", "drifting", "auditory-distortion"],
  44: ["internal-hallucination", "delirium"],
  45: ["unspeakable-horrors", "delirium"],
  46: ["external-hallucination", "delirium"],
  47: ["external-hallucination", "delirium"],
  48: ["geometry"],
  49: ["autonomous-entity"],
  50: ["geometry"],
  51: ["autonomous-entity", "immersive-hallucinations"],
  53: ["drifting", "environmental-patterning", "texture-liquidation"],
  54: ["geometry", "drifting"],
  55: ["geometry", "visual-strobing", "internal-hallucination", "autonomous-entity"],
  56: ["geometry"],
  57: ["geometry"],
  58: ["internal-hallucination"],
  59: ["autonomous-entity", "geometry"],
  60: ["settings-sceneries-and-landscapes", "geometry"],
  61: ["settings-sceneries-and-landscapes"],
  62: ["autonomous-entity", "geometry", "settings-sceneries-and-landscapes"],
  63: ["geometry", "drifting"],
  64: ["autonomous-entity", "geometry", "internal-hallucination"],
  65: ["geometry", "internal-hallucination"],
  66: ["external-hallucination", "autonomous-entity", "geometry", "drifting"],
  67: ["unity-and-interconnectedness"],
  68: ["autonomous-entity", "geometry"],
  69: ["internal-hallucination", "autonomous-entity"],
  70: ["symmetrical-texture-repetition", "magnification"],
  71: ["geometry", "settings-sceneries-and-landscapes"],
  72: ["environmental-patterning", "drifting"],
  73: ["environmental-patterning", "geometry", "drifting", "visual-acuity-suppression"],
  74: ["field-of-view-alteration"],
  75: ["settings-sceneries-and-landscapes", "internal-hallucination", "geometry"],
  76: ["internal-hallucination", "geometry"],
  77: ["environmental-patterning", "geometry"],
  78: ["autonomous-entity", "geometry"],
  79: ["internal-hallucination", "geometry", "settings-sceneries-and-landscapes"],
  80: ["environmental-patterning", "drifting"],
  81: ["geometry"],
  82: ["symmetrical-texture-repetition", "geometry"],
  83: ["geometry", "drifting"],
  84: ["environmental-patterning", "geometry", "drifting"],
  86: ["autonomous-entity", "internal-hallucination"],
  87: ["autonomous-entity", "geometry"],
  88: ["environmental-patterning", "drifting", "visual-acuity-enhancement"],
  89: ["geometry", "internal-hallucination"],
  90: ["visual-acuity-enhancement"],
  91: ["autonomous-entity", "geometry"],
  92: ["shadow-people", "delirium"],
  93: ["environmental-patterning", "geometry", "drifting", "auditory-distortion"],
  94: ["geometry", "texture-liquidation", "environmental-patterning"],
  95: ["autonomous-entity", "geometry"],
  96: ["geometry"],
  98: ["internal-hallucination", "geometry"],
  99: ["internal-hallucination", "geometry", "auditory-hallucination"],
  100: ["geometry", "internal-hallucination"],
  102: ["geometry"],
  103: ["visual-acuity-enhancement", "geometry", "drifting"],
  104: ["autonomous-entity"],
  105: ["autonomous-entity", "geometry", "internal-hallucination"],
  106: ["geometry"],
  107: ["geometry", "internal-hallucination"],
  108: ["geometry", "texture-liquidation"],
  109: ["geometry", "drifting", "auditory-hallucination"],
  110: ["geometry", "internal-hallucination"],
  112: ["drifting", "visual-acuity-enhancement", "auditory-distortion"],
  113: ["autonomous-entity", "geometry"],
  115: ["autonomous-entity", "geometry"],
  116: ["drifting", "environmental-patterning"],
  117: ["autonomous-entity", "geometry"],
  118: ["autonomous-entity", "internal-hallucination", "geometry"],
  119: ["geometry"],
  120: ["geometry", "auditory-distortion"],
  121: ["settings-sceneries-and-landscapes", "geometry"],
  122: ["visual-acuity-enhancement"],
  123: ["geometry", "internal-hallucination"],
  124: ["autonomous-entity", "geometry"],
  125: ["geometry"],
  126: ["autonomous-entity", "geometry"],
  127: ["geometry"],
  128: ["geometry"],
  129: ["symmetrical-texture-repetition", "geometry"],
  130: ["geometry", "settings-sceneries-and-landscapes"],
  131: ["geometry", "drifting", "auditory-distortion"],
  132: ["autonomous-entity", "geometry", "internal-hallucination"],
  133: ["geometry", "visual-strobing", "aesthetic-distillation"],
  134: ["geometry", "immersive-hallucinations"],
  135: ["visual-acuity-suppression", "chromatic-aberration", "environmental-patterning"],
  136: ["internal-hallucination", "settings-sceneries-and-landscapes"],
  137: ["autonomous-entity", "geometry"],
  138: ["environmental-patterning", "drifting"],
  139: ["geometry", "symmetrical-texture-repetition", "visual-acuity-suppression"],
  140: ["drifting", "geometry"],
  141: ["internal-hallucination"],
  142: ["internal-hallucination"],
  143: ["geometry"],
  145: ["internal-hallucination", "geometry"],
  147: ["geometry", "internal-hallucination"],
  148: ["autonomous-entity", "geometry"],
  149: ["colour-shifting", "drifting"],
  150: ["geometry", "settings-sceneries-and-landscapes"],
  151: ["environmental-patterning", "auditory-hallucination", "auditory-distortion", "drifting"],
  152: ["autonomous-entity", "geometry"],
  154: ["geometry"],
  155: ["geometry", "autonomous-entity", "internal-hallucination", "settings-sceneries-and-landscapes"],
  156: ["geometry", "internal-hallucination"],
  157: ["drifting", "colour-shifting", "environmental-patterning"],
  159: ["internal-hallucination", "geometry"],
  160: ["environmental-patterning", "chromatic-aberration", "geometry", "texture-liquidation"],
  161: ["geometry", "internal-hallucination"],
  162: ["unspeakable-horrors"],
  163: ["unspeakable-horrors"],
  164: ["machinescapes"],
  165: ["unspeakable-horrors"],
  166: ["unspeakable-horrors"],
  167: ["unspeakable-horrors"],
  168: ["unspeakable-horrors"],
  169: ["environmental-patterning", "geometry", "drifting"],
  170: ["drifting", "colour-shifting"],
  171: ["visual-disconnection"],
  172: ["colour-enhancement", "visual-acuity-enhancement"],
  173: ["drifting", "environmental-patterning"],
  174: ["geometry", "internal-hallucination"],
  175: ["geometry", "internal-hallucination", "autonomous-entity"],
  176: ["drifting", "geometry"],
  177: ["autonomous-entity", "geometry"],
  178: ["drifting", "geometry"],
  179: ["symmetrical-texture-repetition", "colour-enhancement"],
  180: ["autonomous-entity", "settings-sceneries-and-landscapes", "scenarios-and-plots", "geometry", "internal-hallucination", "immersive-hallucinations"],
  181: ["autonomous-entity", "geometry"],
  182: ["autonomous-entity", "geometry"],
  183: ["environmental-patterning", "geometry", "drifting", "auditory-distortion"],
  184: ["internal-hallucination"],
  185: ["geometry", "internal-hallucination"],
  186: ["geometry", "symmetrical-texture-repetition", "drifting"],
}).map(([index, effects]) => [Number(index), effects]));

const ARTIST_REMOVALS = new Map([
  ["elohprojects", new Set(["symmetrical-texture-repetition"])],
  ["johnspeaker", new Set(["symmetrical-texture-repetition"])],
  ["bearfromvoid", new Set(["colour-shifting", "symmetrical-texture-repetition", "visual-twisting"])],
  ["amandasage", new Set(["environmental-patterning", "perspective-distortion", "symmetrical-texture-repetition", "transformations", "visual-auras", "visual-twisting"])],
  ["fabianjimenez", new Set(["symmetrical-texture-repetition", "visual-auras"])],
  ["jonathansolter", new Set(["increased-pareidolia", "machinescapes"])],
  ["jerrysullivan", new Set(["symmetrical-texture-repetition"])],
  ["kvisuals", new Set(["colour-shifting", "symmetrical-texture-repetition", "transformations", "visual-twisting"])],
  ["ayjayart", new Set(["symmetrical-texture-repetition"])],
  ["hypnagogist", new Set(["colour-shifting"])],
  ["cristinamcallister", new Set(["symmetrical-texture-repetition"])],
  ["cryptogeometry", new Set(["symmetrical-texture-repetition"])],
  ["imageshaman", new Set(["symmetrical-texture-repetition"])],
  ["benridgway", new Set(["machinescapes", "symmetrical-texture-repetition"])],
]);

const CLOSED_EYE_ARTISTS = new Set([
  "amandasage",
  "ayjayart",
  "bearfromvoid",
  "benridgway",
  "cristinamcallister",
  "cryptogeometry",
  "elohprojects",
  "fabianjimenez",
  "hypnagogist",
  "imageshaman",
  "jerrysullivan",
  "johnspeaker",
  "jonathansolter",
  "kvisuals",
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

function editorialUpdate(row, effects, artist = row.artist) {
  const unique = [...new Set(effects)];
  return {
    title: row.title,
    artist,
    role: row.role ?? "replication",
    effect_slug: unique[0] ?? null,
    credit_line: row.credit_line ?? null,
    effect_tags: unique.slice(1).sort(),
  };
}

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function applyRemovalRule(row, effects, removals) {
  const kept = effects.filter((effect) => !removals.has(effect));
  if (kept.length > 0) return kept;
  throw new Error(`${row.slug}: artist-wide removal would leave no effect.`);
}

function titlePlaylistTargets(rows) {
  const text = (row) => `${row.title} ${row.slug}`;
  const match = (pattern) => rows.filter((row) => pattern.test(text(row))).map((row) => row.slug);
  const deliriants = match(/\bdph\b|benadryl|diphenhydramine|deliriant/i);
  const salvia = rows
    .filter((row) => /salvia|salvier|cuckington/i.test(text(row)) || ["salviadroid", "cuckingtoniv"].includes(artistKey(row.artist)))
    .map((row) => row.slug);
  salvia.push("incredisphere-incedigris");
  return {
    "2c-b": match(/\b2c[ -]?b\b/i),
    "2c-e": [
      "eye-tower-city-incedigris",
      "incredisphere-incedigris",
      "machineself-incedigris",
      "sophiasphinx-incedigris",
    ],
    dmt: match(/\bdmt\b|\bchanga\b/i),
    lsd: match(/\blsd\b|\b[1-9][0-9]{1,3}\s*(?:u|µ)g\b/i),
    salvia,
    ...Object.fromEntries(DELIRIANT_SUBSTANCES.map((slug) => [slug, deliriants])),
  };
}

function buildPlan({ notesDocument, liveRows, audioDocument, effectSlugs }) {
  const liveById = new Map(liveRows.map((row) => [row._id, row]));
  const noteNumbersById = new Map();
  const effectsById = new Map();
  for (const [offset, note] of notesDocument.notes.entries()) {
    const number = offset + 1;
    const row = liveById.get(note.replicationId);
    if (!row) throw new Error(`Note ${number}: replication ${note.replicationId} is missing.`);
    if (row.slug !== note.slug) {
      throw new Error(`Note ${number}: live slug ${row.slug} does not match export slug ${note.slug}.`);
    }
    noteNumbersById.set(row._id, [number]);
    if (NOTE_EFFECTS.has(number)) effectsById.set(row._id, [...NOTE_EFFECTS.get(number)]);
  }

  const alexGreyDeletions = liveRows
    .filter((row) => artistKey(row.artist) === "alexgrey")
    .map((row) => ({
      id: row._id,
      expectedSlug: row.slug,
      expectedTitle: row.title,
      expectedArtist: row.artist,
      expectedStorageId: row.storage_id,
      sourceNoteNumbers: [11, 85],
    }));
  const clancy = liveById.get(notesDocument.notes[34]?.replicationId);
  if (!clancy || clancy.slug !== "clancy-s-journey-hypnagogist") {
    throw new Error("Note 35: expected Clancy's Journey in the live corpus.");
  }
  const deletions = [
    ...alexGreyDeletions,
    {
      id: clancy._id,
      expectedSlug: clancy.slug,
      expectedTitle: clancy.title,
      expectedArtist: clancy.artist,
      expectedStorageId: clancy.storage_id,
      sourceNoteNumbers: [35],
    },
  ];
  const deleting = new Set(deletions.map((entry) => entry.id));

  for (const row of liveRows) {
    if (deleting.has(row._id)) continue;
    const key = artistKey(row.artist);
    let effects = effectsById.get(row._id) ?? effectListOf(row);
    if (key === "hrgiger" || key === "zdzisawbeksiski") {
      effects = ["unspeakable-horrors"];
      noteNumbersById.set(row._id, [...new Set([...(noteNumbersById.get(row._id) ?? []), key === "hrgiger" ? 17 : 162])]);
    }
    const removals = ARTIST_REMOVALS.get(key);
    if (removals && effects.some((effect) => removals.has(effect))) {
      effects = applyRemovalRule(row, effects, removals);
    }
    effectsById.set(row._id, effects);
  }

  const audioById = new Map(audioDocument.records.map((record) => [record.id, record]));
  for (const row of liveRows) {
    if (deleting.has(row._id) || !audioById.get(row._id)?.has_audio) continue;
    const effects = effectsById.get(row._id) ?? effectListOf(row);
    if (!effects.includes("auditory-distortion")) effects.push("auditory-distortion");
    if (
      (effects.includes("internal-hallucination") || CLOSED_EYE_ARTISTS.has(artistKey(row.artist)))
      && !effects.includes("auditory-hallucination")
    ) {
      effects.push("auditory-hallucination");
    }
    effectsById.set(row._id, effects);
    noteNumbersById.set(row._id, [...new Set([...(noteNumbersById.get(row._id) ?? []), 36, 99])]);
  }

  const updates = [];
  for (const row of liveRows) {
    if (deleting.has(row._id)) continue;
    const effects = effectsById.get(row._id) ?? effectListOf(row);
    for (const effect of effects) {
      if (!effectSlugs.has(effect) && !CUSTOM_EFFECT_SLUGS.has(effect)) {
        throw new Error(`${row.slug}: planned effect does not exist: ${effect}`);
      }
    }
    const artist = row._id === notesDocument.notes[6]?.replicationId ? "Josie Kins" : row.artist;
    const expected = editorialSnapshot(row);
    const next = editorialUpdate(row, effects, artist);
    if (!sameJson(expected, next)) {
      updates.push({
        id: row._id,
        slug: row.slug,
        expected,
        updates: next,
        sourceNoteNumbers: noteNumbersById.get(row._id) ?? [],
      });
    }
  }

  const liveSlugs = new Set(liveRows.filter((row) => !deleting.has(row._id)).map((row) => row.slug));
  const playlists = Object.entries(titlePlaylistTargets(liveRows))
    .map(([substanceSlug, slugs]) => ({
      substanceSlug,
      addSlugs: [...new Set(slugs)].filter((slug) => liveSlugs.has(slug)),
    }))
    .filter((entry) => entry.addSlugs.length > 0);

  return { updates, deletions, playlists };
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
  const deletionMismatches = plan.deletions.filter((entry) => byId.has(entry.id));
  const playlistMismatches = [];
  for (const entry of plan.playlists) {
    const gallery = await readGallery(client, entry.substanceSlug);
    const stored = new Set(gallery?.curated_slugs ?? []);
    const missing = entry.addSlugs.filter((slug) => !stored.has(slug));
    if (missing.length > 0) playlistMismatches.push({ substanceSlug: entry.substanceSlug, missing });
  }
  return { updateMismatches, deletionMismatches, playlistMismatches };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION, startDir: ROOT });
  printProductionWriteCommand(command);
  if (!command.targetUrl) throw new Error("Set TARGET_POSTGRES_URL or pass --target.");

  const inputPath = path.resolve(flagValue("--input") ?? DEFAULT_INPUT);
  const audioPath = path.resolve(flagValue("--audio-inventory") ?? DEFAULT_AUDIO);
  const ledgerPath = path.resolve(flagValue("--ledger") ?? DEFAULT_LEDGER);
  const planPath = path.resolve(flagValue("--plan") ?? DEFAULT_PLAN);
  const inputBytes = fs.readFileSync(inputPath);
  const audioBytes = fs.readFileSync(audioPath);
  const notesDocument = JSON.parse(inputBytes);
  const audioDocument = JSON.parse(audioBytes);
  if (notesDocument.notedReplications !== 186 || notesDocument.notes?.length !== 186) {
    throw new Error("Expected the 186-note editorial export.");
  }
  if (audioDocument.successfulProbes !== audioDocument.totalVideos) {
    throw new Error("The video audio inventory is incomplete.");
  }

  const client = createDataClient({ target: command.targetUrl }).client;
  const [liveRows, effects] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.subjectiveEffects.getAll, {}),
  ]);
  const sourceSha256 = sha256(inputBytes);
  const audioInventorySha256 = sha256(audioBytes);
  const frozenPlan = !command.dryRun && fs.existsSync(planPath)
    ? JSON.parse(fs.readFileSync(planPath, "utf8"))
    : null;
  if (!command.dryRun && !frozenPlan) {
    throw new Error(`Write requires the reviewed dry-run plan at ${planPath}.`);
  }
  if (
    frozenPlan
    && (frozenPlan.sourceSha256 !== sourceSha256 || frozenPlan.audioInventorySha256 !== audioInventorySha256)
  ) {
    throw new Error("Frozen plan source hashes do not match the current editorial inputs.");
  }
  const plan = frozenPlan?.plan ?? buildPlan({
    notesDocument,
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
    audioInventorySha256,
    payloadDigest,
    liveRows: liveRows.length,
    noteCount: notesDocument.notes.length,
    updates: plan.updates.length,
    deletions: plan.deletions.length,
    playlistSubstances: plan.playlists.length,
    playlistPairs: plan.playlists.reduce((sum, entry) => sum + entry.addSlugs.length, 0),
    audioTaggedRows: plan.updates.filter((entry) => entry.updates.effect_tags.includes("auditory-distortion") || entry.updates.effect_slug === "auditory-distortion").length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (command.dryRun) {
    writeJsonAtomic(planPath, {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      sourcePath: inputPath,
      audioInventoryPath: audioPath,
      sourceSha256,
      audioInventorySha256,
      payloadDigest,
      summary,
      plan,
    });
    console.log(JSON.stringify({
      planPath,
      deletions: plan.deletions.map((entry) => entry.expectedSlug),
      playlists: plan.playlists,
    }, null, 2));
    return;
  }

  assertProductionWriteAllowed(command);
  if (!process.argv.includes("--confirm-editorial-review")) {
    throw new Error("Write requires --confirm-editorial-review.");
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
  const ledger = previousLedger ?? {
    schemaVersion: 1,
    payloadDigest,
    sourceSha256: summary.sourceSha256,
    target: command.deploymentFingerprint,
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

  for (const entry of plan.deletions) {
    const key = `delete:${entry.id}`;
    if (ledger.completed[key]) continue;
    const live = writeRowsById.get(entry.id);
    if (!live) {
      checkpoint(key, { status: "already-deleted", slug: entry.expectedSlug });
      continue;
    }
    const result = await client.mutation(api.replications.deleteAuditedRow, {
      apiKey: maintenanceKey,
      id: entry.id,
      expectedSlug: entry.expectedSlug,
      expectedTitle: entry.expectedTitle,
      expectedArtist: entry.expectedArtist,
      expectedStorageId: entry.expectedStorageId,
      requireDuplicate: false,
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
      throw new Error(`${entry.substanceSlug}: direct curated slugs were unexpectedly pruned: ${result.pruned_curated.join(", ")}`);
    }
    checkpoint(key, result);
  }

  const verification = await verify(client, plan);
  if (
    verification.updateMismatches.length > 0
    || verification.deletionMismatches.length > 0
    || verification.playlistMismatches.length > 0
  ) {
    throw new Error(`Verification failed:\n${JSON.stringify(verification, null, 2)}`);
  }
  ledger.completedAt = new Date().toISOString();
  ledger.verification = {
    updates: plan.updates.length,
    deletions: plan.deletions.length,
    playlistSubstances: plan.playlists.length,
  };
  writeJsonAtomic(ledgerPath, ledger);
  console.log(JSON.stringify({ complete: true, verification: ledger.verification, ledgerPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

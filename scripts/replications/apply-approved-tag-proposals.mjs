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
const OPERATION = "apply-approved-replication-tags";
const DEFAULT_PROPOSALS = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/replication-review-app/data/remaining-tag-proposals.json";
const DEFAULT_NOTES = "/Users/josie/.codex/attachments/49de168d-6792-4fad-ad91-5756ef9002ce/pasted-text.txt";
const DEFAULT_PLAN = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/approved-replication-tags-plan.json";
const DEFAULT_LEDGER = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/approved-replication-tags-ledger.json";
const EXPECTED_PROPOSALS = 254;
const EXPECTED_NOTES = 10;
const CANARY_ID = "k570paa5yt4458t52fq66yttcs8cng93";

const NOTE_OVERRIDES = new Map(Object.entries({
  k570jsf7djn4nyzdsscba50es18cmrt6: {
    slug: "under-skin-shipibo-snake-tunnel-symmetric-vision",
    effects: ["geometry"],
  },
  k570paa5yt4458t52fq66yttcs8cng93: {
    slug: "wavy-lizard-symmetric-vision",
    effects: ["drifting", "texture-liquidation", "geometry"],
  },
  k57595s9d9h48pp0fz6wxkg5g58cnbez: {
    slug: "weird-conveyor-space-symmetric-vision",
    effects: ["geometry", "internal-hallucination", "autonomous-entity"],
  },
  k574jvcnqe0rjf0x72r5wmapg58cnp3j: {
    slug: "women-s-day-2020-dmt-symmetric-vision",
    effects: ["geometry", "colour-enhancement", "environmental-patterning", "transformations"],
  },
  k572z3gb2yjtpbbzv3jemcmd858cn0gr: {
    slug: "entangled-trent-kuhn",
    effects: ["geometry", "internal-hallucination", "settings-sceneries-and-landscapes", "autonomous-entity"],
  },
  k57504mcga9h7d62kx5ewtn6qd8cmbx6: {
    slug: "falling-figure-in-the-dark-grid-utheraptor",
    effects: ["visual-disconnection"],
  },
  k57bp5nchh6axa7grafyr80pmn8cnh5t: {
    slug: "falling-figure-through-the-particle-tunnel-utheraptor",
    effects: ["visual-disconnection"],
  },
  k57dmgg88wanmvr0taa6kn115x8cmfat: {
    slug: "falling-figure-toward-the-distant-light-utheraptor",
    effects: ["visual-disconnection"],
  },
  k576x84wjabkv2t1b0yzt2k59n8cmazw: {
    slug: "podular-manifestation-xavi-panneton",
    effects: ["autonomous-entity", "geometry", "internal-hallucination", "settings-sceneries-and-landscapes"],
  },
  k570mkhfek8tk8rgy1wsjcp1mn8cngth: {
    slug: "high-dose-shrooms-trip-simulation-pov-loka",
    effects: ["drifting", "environmental-patterning", "perspective-distortion", "auditory-distortion", "geometry", "colour-enhancement"],
  },
}));

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

function parseNotes(source) {
  const declared = Number.parseInt(source.match(/^Reviewed notes: (\d+) of \d+/m)?.[1] ?? "", 10);
  const notes = source.split(/^## /m).slice(1).map((block) => {
    const match = (label) => block.match(new RegExp(`^- ${label}: (.+)$`, "m"))?.[1] ?? null;
    return {
      replicationId: match("Replication ID"),
      slug: match("Slug"),
      note: block.match(/^Reviewer note:\n([\s\S]*)$/m)?.[1].trim() ?? "",
    };
  });
  if (declared !== EXPECTED_NOTES || notes.length !== EXPECTED_NOTES) {
    throw new Error(`Expected ${EXPECTED_NOTES} notes; parsed ${notes.length}.`);
  }
  if (notes.some((note) => !note.replicationId || !note.slug || !note.note)) {
    throw new Error("The note export contains an incomplete note block.");
  }
  return notes;
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

function updatedSnapshot(row, effects) {
  const unique = [...new Set(effects.filter(Boolean))];
  return {
    ...editorialSnapshot(row),
    effect_slug: unique[0] ?? null,
    effect_tags: unique.slice(1).sort(),
  };
}

function buildPlan({ proposals, notes, liveRows, effectSlugs }) {
  const proposalEntries = Object.values(proposals);
  if (proposalEntries.length !== EXPECTED_PROPOSALS) {
    throw new Error(`Expected ${EXPECTED_PROPOSALS} proposals; found ${proposalEntries.length}.`);
  }
  const noteIds = new Set(notes.map((note) => note.replicationId));
  if (noteIds.size !== NOTE_OVERRIDES.size || [...NOTE_OVERRIDES.keys()].some((id) => !noteIds.has(id))) {
    throw new Error("The note identity set does not match the approved override set.");
  }

  const liveById = new Map(liveRows.map((row) => [row._id, row]));
  const updates = [];
  const desired = [];
  for (const proposal of proposalEntries.sort((left, right) => left.currentOrdinal - right.currentOrdinal)) {
    const row = liveById.get(proposal.replicationId);
    if (!row) throw new Error(`${proposal.replicationId}: target is missing from production.`);
    if (row.slug !== proposal.slug) {
      throw new Error(`${proposal.replicationId}: live slug ${row.slug} does not match ${proposal.slug}.`);
    }
    const override = NOTE_OVERRIDES.get(proposal.replicationId);
    if (override && override.slug !== row.slug) {
      throw new Error(`${proposal.replicationId}: note override slug mismatch.`);
    }
    const effects = override?.effects ?? [proposal.proposedEffectSlug, ...(proposal.proposedEffectTags ?? [])];
    for (const effect of effects.filter(Boolean)) {
      if (!effectSlugs.has(effect)) throw new Error(`${row.slug}: unknown production effect ${effect}.`);
    }
    const next = updatedSnapshot(row, effects);
    desired.push({ id: row._id, slug: row.slug, ordinal: proposal.currentOrdinal, updates: next });
    const expected = editorialSnapshot(row);
    if (!sameJson(expected, next)) {
      updates.push({
        id: row._id,
        slug: row.slug,
        ordinal: proposal.currentOrdinal,
        source: override ? "curator-note" : "approved-proposal",
        expected,
        updates: next,
      });
    }
  }
  updates.sort((left, right) => {
    if (left.id === CANARY_ID) return -1;
    if (right.id === CANARY_ID) return 1;
    return left.ordinal - right.ordinal;
  });
  return { desired, updates, canaryId: CANARY_ID };
}

async function verify(client, desired) {
  const rows = await client.query(api.replications.getAll, {});
  const byId = new Map(rows.map((row) => [row._id, row]));
  return desired.filter((entry) => {
    const row = byId.get(entry.id);
    return !row || !sameJson(editorialSnapshot(row), entry.updates);
  });
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION, startDir: ROOT });
  printProductionWriteCommand(command);
  if (!command.targetUrl) throw new Error("Set TARGET_CONVEX_URL or pass --target-url.");

  const proposalsPath = path.resolve(flagValue("--proposals") ?? DEFAULT_PROPOSALS);
  const notesPath = path.resolve(flagValue("--notes") ?? DEFAULT_NOTES);
  const planPath = path.resolve(flagValue("--plan") ?? DEFAULT_PLAN);
  const ledgerPath = path.resolve(flagValue("--ledger") ?? DEFAULT_LEDGER);
  const proposalsBytes = fs.readFileSync(proposalsPath);
  const notesBytes = fs.readFileSync(notesPath);
  const proposals = JSON.parse(proposalsBytes);
  const notes = parseNotes(notesBytes.toString("utf8"));
  const proposalSha256 = sha256(proposalsBytes);
  const notesSha256 = sha256(notesBytes);

  const client = new ConvexHttpClient(command.targetUrl);
  const [liveRows, effects] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.subjectiveEffects.getAll, {}),
  ]);
  const generatedPlan = buildPlan({
    proposals,
    notes,
    liveRows,
    effectSlugs: new Set(effects.map((effect) => effect.slug)),
  });
  const frozen = !command.dryRun && fs.existsSync(planPath)
    ? JSON.parse(fs.readFileSync(planPath, "utf8"))
    : null;
  if (!command.dryRun && !frozen) throw new Error(`Write requires the dry-run plan at ${planPath}.`);
  if (frozen && (frozen.proposalSha256 !== proposalSha256 || frozen.notesSha256 !== notesSha256)) {
    throw new Error("Frozen plan source hashes do not match the current inputs.");
  }
  if (frozen && frozen.target !== command.deploymentFingerprint) {
    throw new Error("Frozen plan target does not match the requested deployment.");
  }
  const plan = frozen?.plan ?? generatedPlan;
  const payloadDigest = digest(plan);
  if (frozen && frozen.payloadDigest !== payloadDigest) throw new Error("Frozen plan digest is invalid.");

  const summary = {
    mode: command.dryRun ? "dry-run" : "write",
    target: command.deploymentFingerprint,
    liveRows: liveRows.length,
    productionEffects: effects.length,
    approvedProposals: plan.desired.length,
    curatorNotes: notes.length,
    changedRows: plan.updates.length,
    unchangedRows: plan.desired.length - plan.updates.length,
    canaryId: plan.canaryId,
    proposalSha256,
    notesSha256,
    payloadDigest,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (command.dryRun) {
    writeJsonAtomic(planPath, {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      target: command.deploymentFingerprint,
      proposalPath: proposalsPath,
      notesPath,
      proposalSha256,
      notesSha256,
      payloadDigest,
      summary,
      plan,
    });
    console.log(JSON.stringify({ planPath }, null, 2));
    return;
  }

  assertProductionWriteAllowed(command);
  if (!process.argv.includes("--confirm-approved-tags")) {
    throw new Error("Write requires --confirm-approved-tags.");
  }
  if (flagValue("--digest") !== payloadDigest) {
    throw new Error(`Write requires --digest=${payloadDigest}.`);
  }

  const maintenanceKey = requireProductionWriteCredential("replicationMaintenance").token;
  const previousLedger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : null;
  if (previousLedger && previousLedger.payloadDigest !== payloadDigest) {
    throw new Error("Existing ledger belongs to a different payload.");
  }
  if (previousLedger && previousLedger.target !== command.targetUrl) {
    throw new Error("Existing ledger belongs to a different deployment.");
  }
  const ledger = previousLedger ?? {
    schemaVersion: 1,
    payloadDigest,
    proposalSha256,
    notesSha256,
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
  for (const [index, entry] of plan.updates.entries()) {
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
    checkpoint(key, { status: index === 0 ? "canary-applied" : "applied", ...result });
  }

  const mismatches = await verify(client, plan.desired);
  if (mismatches.length > 0) {
    throw new Error(`Verification found ${mismatches.length} mismatched target rows.`);
  }
  ledger.completedAt = new Date().toISOString();
  ledger.verification = {
    approvedProposals: plan.desired.length,
    changedRows: plan.updates.length,
    exactMatches: plan.desired.length,
  };
  writeJsonAtomic(ledgerPath, ledger);
  console.log(JSON.stringify({ complete: true, verification: ledger.verification, ledgerPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

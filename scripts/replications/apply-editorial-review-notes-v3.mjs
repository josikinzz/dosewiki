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
const OPERATION = "apply-replication-editorial-review-v3";
const DEFAULT_BASE_INPUT = "/Users/josie/Downloads/dose-wiki-replication-review (2).json";
const DEFAULT_INPUT = "/Users/josie/.codex/attachments/964d30bd-e33d-478f-b1cb-f8cfd1a75fd6/pasted-text.txt";
const DEFAULT_LEDGER = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/replication-editorial-review-v3-ledger.json";
const DEFAULT_PLAN = "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/work/replication-editorial-review-v3-plan.json";
const EXPECTED_CUMULATIVE_NOTES = 247;
const EXPECTED_BASE_NOTES = 201;
const EXPECTED_ADDED_NOTES = EXPECTED_CUMULATIVE_NOTES - EXPECTED_BASE_NOTES;

// The pasted Markdown export is cumulative. These directives cover only the
// 46 replication IDs added after the reviewed 201-note JSON export. Add/remove
// operations start from production so unrelated newer curation is preserved;
// `set` is reserved for notes that explicitly narrow the row to a fixed set.
const ROW_DIRECTIVES = new Map(Object.entries({
  k57cvqg9qw71pr5v8edhxnpngn8cns4v: {
    slug: "tower-of-faces-in-space-luke-brown",
    set: ["geometry", "internal-hallucination"],
  },
  k571re32v5abhvmzfmwx74gjkd8cnwet: {
    slug: "the-number-one-game-luke-schroeder",
    set: ["geometry"],
  },
  k57870nmaqajj0vzczq8ht1q7n8cnj5a: {
    slug: "blue-tentacled-woman-martina-hoffmann",
    set: ["autonomous-entity"],
  },
  k57fptjnmsj5bb6zh4h3ezg3c18cmt2w: {
    slug: "white-winged-threshold-martina-hoffmann",
    set: ["geometry", "internal-hallucination"],
  },
  k571tmbq7c4x5sv7r76bn7tzq18cmhsr: {
    slug: "angels-matt-wilson",
    remove: ["symmetrical-texture-repetition"],
  },
  k5779qt860rnk51whzgfcbmja18cn6w8: {
    slug: "nectar-of-the-gods-natural-warp",
    set: ["geometry"],
  },
  k57cbpnt1ajvmqkqd7ws3gfppx8cnyfj: {
    slug: "forest-mandala-oracle-emissary",
    remove: ["increased-pareidolia"],
  },
  k577rj657tdzqdpmhb822r452n8cmqem: {
    slug: "welcome-iii-paniq",
    set: ["geometry"],
  },
  k5785kwkhjk20gsa5qmcr0at0x8cnsrb: {
    slug: "heyokah-the-light-bearer-pavel-souviron",
    remove: ["symmetrical-texture-repetition"],
  },
  k573jq3c2frwat3zc6s6ce6mt98cm2cz: {
    slug: "bathroom-tiles-phosform",
    add: ["auditory-distortion", "auditory-hallucination"],
  },
  k57evd49yjwtfvf0fwekzvm0xn8cn0hx: {
    slug: "foxglove-phosform",
    add: ["drifting"],
  },
  k574pge158vaa4xeteyts0sn5d8cmcxk: {
    slug: "heart-restart-phosform",
    add: ["auditory-distortion", "auditory-hallucination"],
  },
  k574kqa8s3pet5bfc4q178xses8cm20y: {
    slug: "oneness-audio-phosform",
    add: ["symmetrical-texture-repetition", "auditory-distortion"],
    remove: ["visual-haze"],
  },
  k575w8dnb5wd4j2a6f01db40dn8cm353: {
    slug: "spider-plant-phosform",
    add: ["drifting"],
  },
  k574k61sg371ky5ckcdsg6qn7s8cng8w: {
    slug: "welcome-back-phosform",
    remove: ["visual-haze"],
  },
  k573zyce8exdwr0zwqx51c8ge98cn0re: {
    slug: "spiraling-ocean-dreams-randal-roberts",
    set: ["geometry"],
  },
  k574hfm0gznavzjc6exv6fnk718cneb7: {
    slug: "sobek-rising-salviadroid",
    remove: ["visual-auras"],
  },
  k570j5g4ykjp5xstmbfb7tswgs8cmw6z: {
    slug: "neolithic-man-sean-allum",
    remove: ["visual-auras"],
  },
  k57d1byfxfeb768hp1fwdx5fnx8cn6nt: {
    slug: "eden-s-dream-simon-haiduk",
    set: ["geometry", "internal-hallucination", "autonomous-entity"],
  },
  k5707qb65w7xw07h5ckv6rpbex8cnza1: {
    slug: "visionary-art-visuals-forest-meditation-simon-haiduk",
    set: ["geometry", "colour-shifting", "drifting", "environmental-patterning"],
  },
  k574vtdt9bv422trwxn3ta3kad8cmmdh: {
    slug: "4a-comet-drawing-symmetric-vision",
    set: ["geometry", "recursion", "drifting"],
  },
  k572cn1yf93wwqm0mh1787fmh98cm6sv: {
    slug: "ayjay-tapestry-symmetric-vision",
    add: ["magnification"],
    remove: ["symmetrical-texture-repetition"],
  },
  k579dfpwkwgqq33fevbhs4m6898cmagw: {
    slug: "bad-trip-symmetric-vision",
    add: ["colour-suppression"],
    remove: ["visual-haze"],
  },
  k57c0647pcza5gwm927s6sp1wh8cnfsm: {
    slug: "be-the-potato-symmetric-vision",
    add: ["drifting"],
    remove: ["increased-pareidolia"],
  },
  k572pq511m3hwq00tdzqq4fv0h8cm56v: {
    slug: "beach-girl-recursion-symmetric-vision",
    add: ["geometry"],
  },
  k5731t76d0bzx86295v58kvejn8cmgtt: {
    slug: "biuuuuuu-symmetric-vision",
    add: ["internal-hallucination"],
  },
  k57ek39vnx5rpk0rsb29gbgpzn8cm0g8: {
    slug: "blacklight-flower-mini-coop-symmetric-vision",
    add: ["geometry"],
  },
  k57bc82z403fh0r9xdgq5k88998cnfbn: {
    slug: "brick-in-the-wall-on-mescaline-symmetric-vision",
    add: ["drifting"],
  },
  k57ahkvks8q9qcd9dzxfepajw58cnh7k: {
    slug: "cascade-patterns-symmetric-vision",
    add: ["drifting"],
  },
  k5752c03bmccrecvv3mzfq4g7x8cnzf0: {
    slug: "cat-food-dmt-oevs-symmetric-vision",
    add: ["geometry"],
  },
  k573090g8892a8d49zn3xrfq8n8cmdwf: {
    slug: "centibeee-symmetric-vision",
    set: ["autonomous-entity", "geometry", "internal-hallucination"],
  },
  k5724styss4bqpbght5hesp0en8cnk8m: {
    slug: "cevs-2-symmetric-vision",
    set: ["geometry"],
  },
  k57fd4b9v26hf8agfhz46gddrs8cmkyh: {
    slug: "chameleon-symmetric-vision",
    set: ["drifting", "colour-shifting"],
  },
}));

const ARTIST_REMOVALS = new Map([
  ["martinahoffmann", new Set(["transformations"])],
  ["naturalwarp", new Set(["symmetrical-texture-repetition"])],
  ["neilgibson", new Set(["environmental-cubism"])],
  ["oliviacurry", new Set(["symmetrical-texture-repetition"])],
  ["randalroberts", new Set(["visual-twisting"])],
  ["rickjacobi", new Set(["symmetrical-texture-repetition"])],
  ["robertstevenconnett", new Set(["symmetrical-texture-repetition"])],
  ["rogdog", new Set(["symmetrical-texture-repetition"])],
  ["salviadroid", new Set(["symmetrical-texture-repetition"])],
  // The collaboration is also SalviaDroid work, so it inherits the earlier
  // artist-wide texture-repetition removal as well as its own transformation
  // removal note.
  ["salviadroidmifsudvisions", new Set(["symmetrical-texture-repetition", "transformations"])],
  ["somnio8", new Set(["machinescapes"])],
  ["sunterry", new Set(["symmetrical-texture-repetition"])],
]);

const ARTIST_RULE_SOURCE_IDS = new Map([
  ["martinahoffmann", ["k57870nmaqajj0vzczq8ht1q7n8cnj5a"]],
  ["naturalwarp", ["k5779qt860rnk51whzgfcbmja18cn6w8"]],
  ["neilgibson", ["k577aqp6ch5ny3tds43c7v74d58cnkv3"]],
  ["oliviacurry", ["k57bf39y3ayzt57tsyb1bf85yn8cn5p4"]],
  ["randalroberts", ["k573zyce8exdwr0zwqx51c8ge98cn0re"]],
  ["rickjacobi", ["k5728j2qbsak8z324km6ae2s518cncx6"]],
  ["robertstevenconnett", ["k576vcgbwd52ee6e68yeexkt2d8cnqas"]],
  ["rogdog", ["k570ebkc4vdfnrrk1qrjz5jdvs8cn056"]],
  ["salviadroid", ["k57ac64c1rmdqzqrpjar24xzs18cndps"]],
  ["salviadroidmifsudvisions", [
    "k57ac64c1rmdqzqrpjar24xzs18cndps",
    "k576wk5b1es6xhqzdaxp7ffjfx8cm30h",
  ]],
  ["somnio8", ["k57dkqwmhvfa3ryb68y0dsbvss8cnap4"]],
  ["sunterry", ["k57401x0885ky2cbapc440628n8cmfm6"]],
]);

const PLAYLISTS = [
  {
    sourceNoteId: "k570w3712xzctp0tsa4f7d2pzs8cm788",
    substanceSlug: "salvia",
    addSlugs: ["salvia-divinorum-luke-brown"],
  },
  {
    sourceNoteId: "k574pge158vaa4xeteyts0sn5d8cmcxk",
    substanceSlug: "5-meo-dmt",
    addSlugs: ["heart-restart-phosform"],
  },
  {
    sourceNoteId: "k576eakc79fwtf0jje1cfapzz58cm470",
    substanceSlug: "4-ho-met",
    addSlugs: ["4-ho-met-20-mg-symmetric-vision"],
  },
  {
    sourceNoteId: "k5796n49vnc9a320se0t9sw6dn8cmm85",
    substanceSlug: "ald-52",
    addSlugs: ["ald-52-snow-symmetric-vision"],
  },
];

const REQUIRED_NEW_NOTE_IDS = new Set([
  "k570w3712xzctp0tsa4f7d2pzs8cm788", "k57cvqg9qw71pr5v8edhxnpngn8cns4v",
  "k571re32v5abhvmzfmwx74gjkd8cnwet", "k57870nmaqajj0vzczq8ht1q7n8cnj5a",
  "k57fptjnmsj5bb6zh4h3ezg3c18cmt2w", "k571tmbq7c4x5sv7r76bn7tzq18cmhsr",
  "k5779qt860rnk51whzgfcbmja18cn6w8", "k577aqp6ch5ny3tds43c7v74d58cnkv3",
  "k57bf39y3ayzt57tsyb1bf85yn8cn5p4", "k57cbpnt1ajvmqkqd7ws3gfppx8cnyfj",
  "k577rj657tdzqdpmhb822r452n8cmqem", "k5785kwkhjk20gsa5qmcr0at0x8cnsrb",
  "k573jq3c2frwat3zc6s6ce6mt98cm2cz", "k57evd49yjwtfvf0fwekzvm0xn8cn0hx",
  "k574pge158vaa4xeteyts0sn5d8cmcxk", "k574kqa8s3pet5bfc4q178xses8cm20y",
  "k575w8dnb5wd4j2a6f01db40dn8cm353", "k574k61sg371ky5ckcdsg6qn7s8cng8w",
  "k573zyce8exdwr0zwqx51c8ge98cn0re", "k5728j2qbsak8z324km6ae2s518cncx6",
  "k576vcgbwd52ee6e68yeexkt2d8cnqas", "k570ebkc4vdfnrrk1qrjz5jdvs8cn056",
  "k57ac64c1rmdqzqrpjar24xzs18cndps", "k574hfm0gznavzjc6exv6fnk718cneb7",
  "k576wk5b1es6xhqzdaxp7ffjfx8cm30h", "k570j5g4ykjp5xstmbfb7tswgs8cmw6z",
  "k57d1byfxfeb768hp1fwdx5fnx8cn6nt", "k5707qb65w7xw07h5ckv6rpbex8cnza1",
  "k57dkqwmhvfa3ryb68y0dsbvss8cnap4", "k575jp2bfz5b3px2t6sbq1b02s8cnb8n",
  "k57401x0885ky2cbapc440628n8cmfm6", "k576eakc79fwtf0jje1cfapzz58cm470",
  "k574vtdt9bv422trwxn3ta3kad8cmmdh", "k5796n49vnc9a320se0t9sw6dn8cmm85",
  "k572cn1yf93wwqm0mh1787fmh98cm6sv", "k579dfpwkwgqq33fevbhs4m6898cmagw",
  "k57c0647pcza5gwm927s6sp1wh8cnfsm", "k572pq511m3hwq00tdzqq4fv0h8cm56v",
  "k5731t76d0bzx86295v58kvejn8cmgtt", "k57ek39vnx5rpk0rsb29gbgpzn8cm0g8",
  "k57bc82z403fh0r9xdgq5k88998cnfbn", "k57ahkvks8q9qcd9dzxfepajw58cnh7k",
  "k5752c03bmccrecvv3mzfq4g7x8cnzf0", "k573090g8892a8d49zn3xrfq8n8cmdwf",
  "k5724styss4bqpbght5hesp0en8cnk8m", "k57fd4b9v26hf8agfhz46gddrs8cmkyh",
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

function parseMarkdownExport(source) {
  const count = Number.parseInt(source.match(/^Reviewed notes: (\d+) of \d+$/m)?.[1] ?? "", 10);
  const notes = source.split(/^## /m).slice(1).map((block) => {
    const match = (label) => block.match(new RegExp(`^- ${label}: (.+)$`, "m"))?.[1] ?? null;
    return {
      replicationId: match("Replication ID"),
      slug: match("Slug"),
      note: block.match(/^Reviewer note:\n([\s\S]*)$/m)?.[1].trim() ?? "",
    };
  });
  if (count !== EXPECTED_CUMULATIVE_NOTES || notes.length !== EXPECTED_CUMULATIVE_NOTES) {
    throw new Error(`Expected ${EXPECTED_CUMULATIVE_NOTES} cumulative notes; parsed ${notes.length}.`);
  }
  if (notes.some((note) => !note.replicationId || !note.slug || !note.note)) {
    throw new Error("The Markdown export contains an incomplete note block.");
  }
  return notes;
}

function assertCumulativeExport(baseDocument, markdownNotes) {
  if (baseDocument.notes?.length !== EXPECTED_BASE_NOTES) {
    throw new Error(`Expected the ${EXPECTED_BASE_NOTES}-note base JSON export.`);
  }
  const currentById = new Map(markdownNotes.map((note) => [note.replicationId, note]));
  for (const note of baseDocument.notes) {
    const current = currentById.get(note.replicationId);
    if (!current || current.slug !== note.slug || current.note !== note.note) {
      throw new Error(`${note.slug}: a previously reviewed note changed in the cumulative export.`);
    }
  }
  const baseIds = new Set(baseDocument.notes.map((note) => note.replicationId));
  const added = markdownNotes.filter((note) => !baseIds.has(note.replicationId));
  const addedIds = new Set(added.map((note) => note.replicationId));
  if (added.length !== EXPECTED_ADDED_NOTES || addedIds.size !== REQUIRED_NEW_NOTE_IDS.size) {
    throw new Error(`Expected ${EXPECTED_ADDED_NOTES} new unique notes; found ${added.length}.`);
  }
  if ([...REQUIRED_NEW_NOTE_IDS].some((id) => !addedIds.has(id))) {
    throw new Error("The cumulative export's new-note identity set is not the reviewed v3 set.");
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

function buildPlan({ addedNotes, liveRows, effectSlugs }) {
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
    const key = artistKey(row.artist);
    const removals = ARTIST_REMOVALS.get(key);
    if (!removals) continue;
    const current = effectsById.get(row._id) ?? [];
    if (!current.some((effect) => removals.has(effect))) continue;
    const next = current.filter((effect) => !removals.has(effect));
    if (next.length === 0) {
      throw new Error(`${row.slug}: artist-wide removal would leave no subjective effect.`);
    }
    effectsById.set(row._id, next);
    const sourceIds = ARTIST_RULE_SOURCE_IDS.get(key) ?? [];
    sourceNoteIdsByRow.set(row._id, [
      ...new Set([...(sourceNoteIdsByRow.get(row._id) ?? []), ...sourceIds]),
    ]);
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

  for (const entry of PLAYLISTS) {
    if (!REQUIRED_NEW_NOTE_IDS.has(entry.sourceNoteId)) {
      throw new Error(`${entry.substanceSlug}: playlist source note is not part of this batch.`);
    }
    for (const slug of entry.addSlugs) {
      if (!liveRows.some((row) => row.slug === slug)) {
        throw new Error(`${entry.substanceSlug}: playlist replication is missing: ${slug}`);
      }
    }
  }
  return { updates, playlists: PLAYLISTS };
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
  if (!command.targetUrl) throw new Error("Set TARGET_POSTGRES_URL or pass --target.");

  const baseInputPath = path.resolve(flagValue("--base-input") ?? DEFAULT_BASE_INPUT);
  const inputPath = path.resolve(flagValue("--input") ?? DEFAULT_INPUT);
  const ledgerPath = path.resolve(flagValue("--ledger") ?? DEFAULT_LEDGER);
  const planPath = path.resolve(flagValue("--plan") ?? DEFAULT_PLAN);
  const baseInputBytes = fs.readFileSync(baseInputPath);
  const inputBytes = fs.readFileSync(inputPath);
  const baseDocument = JSON.parse(baseInputBytes);
  const markdownNotes = parseMarkdownExport(inputBytes.toString("utf8"));
  const addedNotes = assertCumulativeExport(baseDocument, markdownNotes);

  const client = createDataClient({ target: command.targetUrl }).client;
  const [liveRows, effects] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.subjectiveEffects.getAll, {}),
  ]);
  const sourceSha256 = sha256(inputBytes);
  const baseSourceSha256 = sha256(baseInputBytes);
  const frozenPlan = !command.dryRun && fs.existsSync(planPath)
    ? JSON.parse(fs.readFileSync(planPath, "utf8"))
    : null;
  if (!command.dryRun && !frozenPlan) {
    throw new Error(`Write requires the reviewed dry-run plan at ${planPath}.`);
  }
  if (
    frozenPlan
    && (frozenPlan.sourceSha256 !== sourceSha256 || frozenPlan.baseSourceSha256 !== baseSourceSha256)
  ) {
    throw new Error("Frozen plan source hashes do not match the current editorial inputs.");
  }
  if (frozenPlan && frozenPlan.summary?.target !== command.deploymentFingerprint) {
    throw new Error("Frozen plan target does not match the requested deployment.");
  }
  const plan = frozenPlan?.plan ?? buildPlan({
    addedNotes,
    liveRows,
    effectSlugs: new Set(effects.map((effect) => effect.slug)),
  });
  const payloadDigest = digest(plan);
  if (frozenPlan && frozenPlan.payloadDigest !== payloadDigest) {
    throw new Error("Frozen plan payload digest is invalid.");
  }

  const directNoteIds = new Set([...ROW_DIRECTIVES.keys()]);
  const summary = {
    mode: command.dryRun ? "dry-run" : "write",
    target: command.deploymentFingerprint,
    sourceSha256,
    baseSourceSha256,
    payloadDigest,
    liveRows: liveRows.length,
    cumulativeNoteCount: markdownNotes.length,
    newNoteCount: addedNotes.length,
    priorDeletedNoteTargets: baseDocument.notes.filter(
      (note) => !liveRows.some((row) => row._id === note.replicationId),
    ).length,
    updates: plan.updates.length,
    directUpdates: plan.updates.filter((entry) => directNoteIds.has(entry.id)).length,
    artistWideAdditionalUpdates: plan.updates.filter((entry) => !directNoteIds.has(entry.id)).length,
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
      sourceSha256,
      baseSourceSha256,
      payloadDigest,
      summary,
      plan,
    });
    console.log(JSON.stringify({ planPath, playlists: plan.playlists }, null, 2));
    return;
  }

  assertProductionWriteAllowed(command);
  if (!process.argv.includes("--confirm-editorial-review-v3")) {
    throw new Error("Write requires --confirm-editorial-review-v3.");
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
  if (previousLedger && previousLedger.target !== command.deploymentFingerprint) {
    throw new Error("Existing ledger belongs to a different deployment.");
  }
  const ledger = previousLedger ?? {
    schemaVersion: 1,
    payloadDigest,
    sourceSha256,
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

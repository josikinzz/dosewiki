#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";

export const TARGET = "https://glad-minnow-656.convex.cloud";
export const OUTPUT_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/current-library-taxonomy.json";

const MEDIA_ROOT = "/Users/josie/Documents/Dose Wiki Media Review";
const PATHS = {
  existing: `${MEDIA_ROOT}/Data/artist-replication-tags.json`,
  channelReview: `${MEDIA_ROOT}/Data/Channel Candidates 2026-08-23/channel-review-final.json`,
  channelPlan: `${MEDIA_ROOT}/Data/Channel Candidates 2026-08-23/channel-production-plan.json`,
  channelLedger: `${MEDIA_ROOT}/Data/Channel Candidates 2026-08-23/channel-production-ledger.json`,
  feetPlan: `${MEDIA_ROOT}/Data/Dillan Review/feetman-stas-production-upload-plan.json`,
  feetLedger: `${MEDIA_ROOT}/Data/Dillan Review/feetman-stas-production-upload-ledger.json`,
};

const DRUG_RULES = [
  ["5-meo-dmt", "5-MeO-DMT", "psychedelics", /\b5[- ]?meo[- ]?dmt\b/giu],
  ["4-ho-met", "4-HO-MET", "psychedelics", /\b4[- ]?ho[- ]?met\b|\bhomet\b/giu],
  ["3-meo-pcp", "3-MeO-PCP", "dissociatives", /\b3[- ]?meo[- ]?pcp\b/giu],
  ["ald-52", "ALD-52", "psychedelics", /\bald[- ]?52\b/giu],
  ["eth-lad", "ETH-LAD", "psychedelics", /\beth[- ]?lad\b/giu],
  ["1p-lsd", "1P-LSD", "psychedelics", /\b1p[- ]?lsd\b/giu],
  ["2c-b", "2C-B", "psychedelics", /\b2c[- ]?b\b/giu],
  ["metocin", "Metocin", "psychedelics", /\bmetocin\b/giu],
  ["mescaline", "Mescaline", "psychedelics", /\bmescaline\b|\bpeyote\b/giu],
  ["lsd", "LSD", "psychedelics", /\blsd\b|\bacid\b|\blucy\b/giu],
  ["lsa", "LSA", "psychedelics", /\blsa\b/giu],
  ["changa", "Changa", "psychedelics", /\bchanga\b/giu],
  ["ayahuasca", "Ayahuasca", "psychedelics", /\bayahuasca\b|\byage\b/giu],
  ["dmt", "DMT", "psychedelics", /\bdmt\b|\bdimethyltryptamine\b|\bdimitri\b/giu],
  [
    "psilocybin-mushrooms",
    "Psilocybin mushrooms",
    "psychedelics",
    /\bpsilocybin\b|\bpsilocybe\b|\bmagic mush(?:room|rooms|ie|ies)\b|\bshrooms?\b|\bmushies\b|\bheroic dose mushrooms?\b|\bhigh[- ]dose mushroom\b/giu,
  ],
  ["dxm", "DXM", "dissociatives", /\bdxm\b|\bdextromethorphan\b/giu],
  ["ketamine", "Ketamine", "dissociatives", /\bketamine\b|\bketa\b/giu],
  ["methoxetamine", "Methoxetamine", "dissociatives", /\bmxe\b|\bmethoxetamine\b/giu],
  ["nitrous-oxide", "Nitrous oxide", "dissociatives", /\bnitrous(?: oxide)?\b|\bn2[0o]\b/giu],
  ["pcp", "PCP", "dissociatives", /\bpcp\b/giu],
  ["diphenhydramine", "Diphenhydramine", "deliriants", /\bdiphenhydramine\b|\bdph\b|\bbenadryl\b/giu],
  ["dimenhydrinate", "Dimenhydrinate", "deliriants", /\bdimenhydrinate\b|\bdramamine\b/giu],
  ["datura", "Datura", "deliriants", /\bdatura\b/giu],
  ["brugmansia", "Brugmansia", "deliriants", /\bbrugmansia\b/giu],
  ["scopolamine", "Scopolamine", "deliriants", /\bscopolamine\b/giu],
  ["benzydamine", "Benzydamine", "deliriants", /\bbenzydamine\b/giu],
  ["salvia", "Salvia", "other", /\bsalvia(?: divinorum)?\b/giu],
  ["amanita", "Amanita", "other", /\bamanita\b/giu],
  ["cannabis", "Cannabis", "other", /\bcannabis\b|\bweed\b/giu],
  ["zolpidem", "Zolpidem", "other", /\bzolpidem\b|\bambien\b/giu],
];

const CLASS_RULES = [
  ["psychedelics", /\bpsychedelics?\b/iu],
  ["dissociatives", /\bdissociatives?\b/iu],
  ["deliriants", /\bdeliriants?\b|\bdelirium\b/iu],
];

const FIGURE_ARTISTS = new Set([
  "john archibald wheeler",
  "john tenniel",
  "bill wadman",
  "capture-life-with-lens.tumblr.com",
  "various artists",
]);
const OTHER_PRACTICE_ARTISTS = new Set([
  "shipibo-conibo people",
  "zdzisław beksiński",
  "h. r. giger",
  "david hockney",
  "bev doolittle",
  "octavio ocampo",
  "m. c. escher",
  "salvador dali",
  ...FIGURE_ARTISTS,
]);
const NEW_REPLICATORS = new Set([
  "feetman100",
  "chelsea morgan",
  "stas constantine",
  "stasconstantine",
  "josie",
  "josikins",
]);
const NEW_TRADITIONAL = new Set([
  "larry carlson",
  "sunterry art",
  "uon",
]);
const PLACEHOLDER_ARTISTS = new Set([
  "unknown",
  "unknown artist",
  "anonymous",
  "various artists",
  "midjourney",
]);
const ARTIST_ALIASES = new Map([
  ["salviadroid", "salviadroid"],
  ["sunterry art", "sunterry"],
  ["stasconstantine", "stas constantine"],
  ["josie", "josie kins"],
  ["josikins", "josie kins"],
  ["oleg shupliak", "oleg shuplyak"],
  ["crypto geometry", "crypto geometry"],
  ["k visuals", "k visuals"],
]);

const DARK_ARTISTS = new Set(["zdzisław beksiński", "h. r. giger"]);
const OPTICAL_ARTISTS = new Set([
  "david hockney",
  "bev doolittle",
  "octavio ocampo",
  "oleg shupliak",
  "oleg shuplyak",
  "m. c. escher",
]);
const VISIONARY_THEME_ARTISTS = new Set([
  "luke brown",
  "sunterry art",
  "salviadroid",
  "larry carlson",
]);
const GENERATIVE_THEME_ARTISTS = new Set(["uon", "ben ridgway"]);
const STRONG_REPLICATION_PRACTICES = new Set([
  "symmetric vision",
  "chelsea morgan",
  "phosform",
  "loka",
  "josie kins",
  "josie",
  "josikins",
  "cold wasabi",
  "bearfromvoid",
  "stas constantine",
  "stasconstantine",
  "oracle emissary",
  "feetman100",
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Text(readFileSync(path));
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

export function detectTitleDrugs(title) {
  const candidates = [];
  for (const [slug, name, drugClass, pattern] of DRUG_RULES) {
    pattern.lastIndex = 0;
    for (const match of title.matchAll(pattern)) {
      candidates.push({
        slug,
        name,
        class: drugClass,
        matched_title_text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const accepted = [];
  for (const candidate of candidates) {
    if (accepted.some((item) => candidate.start >= item.start && candidate.end <= item.end)) continue;
    accepted.push(candidate);
  }
  return accepted
    .sort((a, b) => a.start - b.start)
    .map(({ start: _start, end: _end, ...drug }) => drug);
}

export function detectTitleClassMentions(title) {
  return CLASS_RULES.flatMap(([drugClass, pattern]) => {
    const match = title.match(pattern);
    return match ? [{ class: drugClass, matched_title_text: match[0] }] : [];
  });
}

function explicitMode(title) {
  if (/\bmixed\b|\boev\b.*\bcev\b|\bcev\b.*\boev\b/iu.test(title)) return "mixed";
  if (/\bclosed[- ]?eye\b|\bcev(?:s|'s)?\b/iu.test(title)) return "closed-eye";
  if (/\bopen[- ]?eye\b|\boev(?:s|'s)?\b/iu.test(title)) return "open-eye";
  return null;
}

export function inferViewingMode({ title, rationale = "", effects = [] }) {
  const explicit = explicitMode(title);
  if (explicit) {
    return {
      mode: explicit,
      confidence: "high",
      reviewRequired: false,
      rationale: `The title explicitly identifies ${explicit} viewing content.`,
      basis: "explicit-title-mode",
    };
  }

  const text = `${title} ${rationale} ${effects.join(" ")}`.toLowerCase();
  const openSignals = [
    /external/, /room/, /bedroom/, /park/, /forest/, /tree/, /wall/, /ceiling/,
    /street/, /road/, /screen/, /source image/, /webcam/, /spider/, /shadow people/,
    /drifting/, /environmental/, /pareidolia/, /tracer/, /colour enhancement/,
  ];
  const closedSignals = [
    /internal/, /hyperspace/, /closed eye/, /geometry/, /tunnel/, /void/,
    /mandala/, /autonomous entity/, /dream/, /hypnagog/, /cev/,
  ];
  const open = openSignals.filter((pattern) => pattern.test(text)).length;
  const closed = closedSignals.filter((pattern) => pattern.test(text)).length;
  const mode = open > 0 && closed > 0 ? "mixed" : open > 0 ? "open-eye" : closed > 0 ? "closed-eye" : "uncertain";
  return {
    mode,
    confidence: mode === "uncertain" ? "low" : "medium",
    reviewRequired: true,
    rationale:
      mode === "uncertain"
        ? "The reviewed item verdict does not establish whether an external-world substrate remains."
        : `The reviewed rationale and effect tags contain ${mode} substrate signals; this inference remains queued for a dedicated mode review.`,
    basis: "review-rationale-mode-inference",
  };
}

export function figureContentTags(row) {
  const text = `${row.title} ${row.effect_slug ?? ""}`.toLowerCase();
  if (/alice|white rabbit/.test(text)) return ["historical-illustration"];
  if (/ecg|eeg|rhythm strip|heart rate|spike-and-wave/.test(text)) return ["medical-trace"];
  if (/runny nose|watery eye|pupil|eye movement|nystagmus|bloat/.test(text)) return ["clinical-photo"];
  if (/vertebral|abdomen|vasoconstr|bristol|column/.test(text)) return ["medical-illustration-render"];
  if (/dissociative hole/.test(text)) return ["teaching-slide"];
  if (/out.of.body/.test(text)) return ["stock-composite"];
  if (/worm through time/.test(text)) return ["conceptual-illustration"];
  return ["diagram-chart"];
}

function indexExactEvidence(channelReview, channelPlan, channelLedger, feetPlan, feetLedger) {
  const channelReviewById = new Map(channelReview.items.map((item) => [item.youtubeId, item]));
  const channelByProductionId = new Map();
  for (const [id, ledger] of Object.entries(channelLedger.items ?? {})) {
    const review = channelReviewById.get(id);
    if ((ledger.status === "verified" || ledger.status === "inserted") && ledger.productionId && review?.verdict === "replication") {
      channelByProductionId.set(ledger.productionId, review);
    }
  }
  for (const entry of channelPlan.buckets?.existing ?? []) {
    const review = channelReviewById.get(entry.id);
    if (entry.productionId && review?.verdict === "replication") {
      channelByProductionId.set(entry.productionId, review);
    }
  }
  const feetEntryById = new Map(feetPlan.entries.map((item) => [item.id, item]));
  const feetByProductionId = new Map();
  for (const [id, ledger] of Object.entries(feetLedger.items ?? {})) {
    const entry = feetEntryById.get(id);
    if (ledger.status === "verified" && ledger.productionId && entry?.review?.verdict === "replication") {
      feetByProductionId.set(ledger.productionId, entry);
    }
  }
  return { channelByProductionId, feetByProductionId };
}

function classifyArtist(name, rows, existingArtistByKey, exactReplicationIds) {
  const key = normalize(name);
  if (OTHER_PRACTICE_ARTISTS.has(key) || rows.every((row) => row.role === "figure")) {
    return {
      primaryType: "other",
      artistTypeTags: [],
      confidence: "high",
      rationale: "The credited practice is explanatory, cultural, surreal, or perceptual art rather than replication or traditional psychedelic art.",
      reviewRequired: false,
    };
  }
  if (NEW_REPLICATORS.has(key)) {
    return {
      primaryType: "replicator",
      artistTypeTags: ["replicator"],
      confidence: "high",
      rationale: "Multiple exact item reviews document an intentional practice of recreating named subjective effects.",
      reviewRequired: false,
    };
  }
  if (NEW_TRADITIONAL.has(key)) {
    return {
      primaryType: "traditional-psychedelic-artist",
      artistTypeTags: ["traditional-psychedelic-artist"],
      confidence: "medium",
      rationale: "The credited corpus is primarily standalone visionary, geometric, or psychedelic artwork rather than explicit simulations.",
      reviewRequired: false,
    };
  }
  const aliasKey = ARTIST_ALIASES.get(key) ?? key;
  const existing = existingArtistByKey.get(aliasKey);
  if (existing) {
    return {
      primaryType: existing.primaryType,
      artistTypeTags: existing.artistTypeTags ?? [],
      confidence: existing.confidence,
      rationale: existing.rationale,
      reviewRequired: existing.reviewRequired === true,
    };
  }
  if (PLACEHOLDER_ARTISTS.has(key)) {
    return {
      primaryType: "uncertain",
      artistTypeTags: [],
      confidence: "high",
      rationale: "This credit is a placeholder, generator, or non-identity and cannot support an artist-practice classification.",
      reviewRequired: true,
    };
  }
  const exactCount = rows.filter((row) => exactReplicationIds.has(row._id)).length;
  const explicitTitleCount = rows.filter((row) => /\breplication\b|\bsimulation\b/iu.test(row.title)).length;
  if (exactCount > 0 && exactCount + explicitTitleCount >= Math.ceil(rows.length / 2)) {
    return {
      primaryType: "replicator",
      artistTypeTags: ["replicator"],
      confidence: "medium",
      rationale: "At least half of the credited corpus has exact replication reviews or explicitly identifies itself as a replication or simulation.",
      reviewRequired: true,
    };
  }
  return {
    primaryType: "uncertain",
    artistTypeTags: [],
    confidence: "low",
    rationale: "The local corpus does not establish a stable replication or traditional psychedelic art practice without guessing.",
    reviewRequired: true,
  };
}

function contentFamily(row, hadExistingStatus, status) {
  const artist = normalize(row.artist);
  if (row.role === "figure" || status === "not-replication") {
    return {
      family: "explanatory-figure",
      tags: figureContentTags(row),
      confidence: "high",
      reviewRequired: false,
      rationale: "The asset explains a concept or bodily effect rather than depicting a subjective experience.",
    };
  }
  if (hadExistingStatus || status === "replication") {
    return {
      family: "experiential-replication",
      tags: ["subjective-effect-recreation"],
      confidence: "high",
      reviewRequired: false,
      rationale: "An exact item-level review identifies this work as a subjective-effect replication.",
    };
  }
  if (artist === "shipibo-conibo people") {
    return { family: "traditional-cultural-art", tags: ["indigenous-geometric", "textile"], confidence: "high", reviewRequired: false, rationale: "The work is a Shipibo-Conibo geometric textile or design tradition." };
  }
  if (DARK_ARTISTS.has(artist)) {
    return { family: "dark-surrealism", tags: ["oneiric", "horror-surrealism"], confidence: "high", reviewRequired: false, rationale: "The credited work belongs to the audited Beksiński/Giger dark-surrealist cluster." };
  }
  if (OPTICAL_ARTISTS.has(artist)) {
    return { family: "optical-perceptual-art", tags: ["optical-illusion"], confidence: "high", reviewRequired: false, rationale: "The work is a pre-existing optical, perceptual, or photographic artwork rather than an item-reviewed replication." };
  }
  if (VISIONARY_THEME_ARTISTS.has(artist)) {
    return { family: "visionary-psychedelic-art", tags: ["visionary-art"], confidence: "medium", reviewRequired: false, rationale: "The audited artist cluster is standalone visionary or entheogenic art without item-level replication evidence." };
  }
  if (GENERATIVE_THEME_ARTISTS.has(artist)) {
    return { family: "generative-abstract-art", tags: ["generative-geometry"], confidence: "medium", reviewRequired: false, rationale: "The audited cluster is abstract or generative geometry without item-level replication evidence." };
  }
  if (artist === "midjourney") {
    return { family: "effect-illustration", tags: ["ai-generated"], confidence: "high", reviewRequired: false, rationale: "The asset is credited as AI-generated effect imagery." };
  }
  if (STRONG_REPLICATION_PRACTICES.has(artist) || /\breplication\b|\bsimulation\b/iu.test(row.title)) {
    return { family: "experiential-replication", tags: ["replication-practice-candidate"], confidence: "medium", reviewRequired: true, rationale: "The title or audited artist practice strongly suggests a replication, but this item lacks an exact review." };
  }
  return { family: "uncertain", tags: [], confidence: "low", reviewRequired: true, rationale: "No exact item review or specific audited content-family rule applies." };
}

function buildRow(row, context) {
  const existingMedia = row.source_catalog_id
    ? context.existingMediaById.get(row.source_catalog_id)
    : null;
  const existingDetail = row.source_catalog_id
    ? context.existingDetailById.get(row.source_catalog_id)
    : null;
  const channel = context.channelByProductionId.get(row._id);
  const feet = context.feetByProductionId.get(row._id);
  const hadExistingStatus = Boolean(row.replication_status);

  let status;
  let statusConfidence;
  let statusReviewRequired;
  let statusRationale;
  let decisionBasis;
  let mode = row.viewing_mode;
  let modeConfidence = row.viewing_mode_confidence;
  let modeReviewRequired = row.viewing_mode_review_required;
  let modeRationale = existingDetail?.viewingModeRationale;

  if (hadExistingStatus) {
    status = row.replication_status;
    statusConfidence = row.replication_status_confidence ?? existingMedia?.confidence ?? "medium";
    statusReviewRequired = row.replication_status_review_required === true;
    statusRationale = existingMedia?.rationale ?? "Preserved from the verified v1 taxonomy campaign.";
    decisionBasis = "existing-taxonomy";
  } else if (channel) {
    status = "replication";
    statusConfidence = channel.confidence;
    statusReviewRequired = channel.reviewRequired === true;
    statusRationale = channel.rationale;
    decisionBasis = "channel-final-review";
    mode = channel.viewingMode;
    modeConfidence = channel.confidence;
    modeReviewRequired = channel.reviewRequired === true;
    modeRationale = channel.rationale;
  } else if (feet) {
    status = "replication";
    statusConfidence = feet.review.confidence;
    statusReviewRequired = feet.review.reviewRequired === true;
    statusRationale = feet.review.rationale;
    decisionBasis = "dillan-distributed-frame-review";
    const inferred = inferViewingMode({
      title: row.title,
      rationale: feet.review.rationale,
      effects: [feet.proposedRow.effect_slug, ...(feet.proposedRow.effect_tags ?? [])].filter(Boolean),
    });
    mode = inferred.mode;
    modeConfidence = inferred.confidence;
    modeReviewRequired = inferred.reviewRequired;
    modeRationale = inferred.rationale;
  } else if (row.role === "figure") {
    status = "not-replication";
    statusConfidence = "high";
    statusReviewRequired = false;
    statusRationale = "The stored media role is explicitly figure: an explanatory, clinical, diagrammatic, or stock support asset.";
    decisionBasis = "explicit-figure-role";
  } else {
    status = "unreviewed";
    statusConfidence = "low";
    statusReviewRequired = true;
    statusRationale = "No exact item-level campaign evidence establishes whether this work intentionally recreates a subjective effect.";
    decisionBasis = "unresolved-item-review";
  }

  if (status !== "replication") {
    mode = undefined;
    modeConfidence = undefined;
    modeReviewRequired = undefined;
    modeRationale = undefined;
  } else if (!mode) {
    mode = "uncertain";
    modeConfidence = "low";
    modeReviewRequired = true;
    modeRationale = "The confirmed replication lacks enough substrate evidence for an open-eye or closed-eye decision.";
  }

  const family = contentFamily(row, hadExistingStatus, status);
  const titleDrugs = detectTitleDrugs(row.title);
  const titleClassMentions = detectTitleClassMentions(row.title);
  const drugClasses = unique([
    ...titleDrugs.map((drug) => drug.class),
    ...titleClassMentions.map((mention) => mention.class),
  ]);
  const viewingModeTags =
    mode === "mixed" ? ["open-eye", "closed-eye"] : mode === "open-eye" || mode === "closed-eye" ? [mode] : [];

  return {
    productionId: row._id,
    taxonomyRecordKey: row.source_catalog_id
      ? `catalog:${row.source_catalog_id}`
      : channel
        ? `youtube:${channel.youtubeId}`
        : feet
          ? `youtube:${feet.id}`
          : `convex:${row._id}`,
    ...(row.source_catalog_id ? { sourceCatalogId: row.source_catalog_id } : {}),
    expected: {
      slug: row.slug,
      title: row.title,
      artist: row.artist,
      type: row.type,
      storageId: row.storage_id,
      taxonomySourceDigest: row.taxonomy_source_digest ?? null,
    },
    replicationStatus: status,
    replicationStatusConfidence: statusConfidence,
    replicationStatusReviewRequired: statusReviewRequired,
    replicationStatusRationale: statusRationale,
    ...(mode
      ? {
          viewingMode: mode,
          viewingModeTags,
          viewingModeConfidence: modeConfidence,
          viewingModeReviewRequired: modeReviewRequired === true,
          viewingModeRationale: modeRationale,
        }
      : {}),
    titleDrugs,
    titleClassMentions,
    drugClasses,
    contentFamily: family.family,
    contentTags: family.tags,
    contentFamilyConfidence: family.confidence,
    contentFamilyReviewRequired: family.reviewRequired,
    contentFamilyRationale: family.rationale,
    taxonomyReviewRequired:
      statusReviewRequired || modeReviewRequired === true || family.reviewRequired,
    decisionBasis,
  };
}

function countsBy(rows, key) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row[key]))]
      .sort()
      .map((value) => [value, rows.filter((row) => row[key] === value).length]),
  );
}

export async function buildManifest(client = new ConvexHttpClient(TARGET)) {
  const [rows, existing, channelReview, channelPlan, channelLedger, feetPlan, feetLedger] = await Promise.all([
    client.query(api.replications.getAll, {}),
    Promise.resolve(readJson(PATHS.existing)),
    Promise.resolve(readJson(PATHS.channelReview)),
    Promise.resolve(readJson(PATHS.channelPlan)),
    Promise.resolve(readJson(PATHS.channelLedger)),
    Promise.resolve(readJson(PATHS.feetPlan)),
    Promise.resolve(readJson(PATHS.feetLedger)),
  ]);
  rows.sort((a, b) => a._id.localeCompare(b._id));
  const snapshotShape = rows.map((row) => ({
    id: row._id,
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    type: row.type,
    storageId: row.storage_id,
    role: row.role ?? "replication",
    effectSlug: row.effect_slug ?? null,
    taxonomySourceDigest: row.taxonomy_source_digest ?? null,
  }));
  const snapshotDigest = sha256Text(JSON.stringify(snapshotShape));
  const existingMediaById = new Map(existing.mediaClassification.map((item) => [item.id, item]));
  const existingDetailById = new Map(existing.replications.map((item) => [item.id, item]));
  const existingArtistByKey = new Map(existing.artists.map((item) => [normalize(item.artist), item]));
  const { channelByProductionId, feetByProductionId } = indexExactEvidence(
    channelReview,
    channelPlan,
    channelLedger,
    feetPlan,
    feetLedger,
  );
  const exactReplicationIds = new Set([
    ...channelByProductionId.keys(),
    ...feetByProductionId.keys(),
  ]);

  const rowsByArtist = new Map();
  for (const row of rows) {
    const key = normalize(row.artist);
    const bucket = rowsByArtist.get(key) ?? [];
    bucket.push(row);
    rowsByArtist.set(key, bucket);
  }
  const artists = [...rowsByArtist]
    .map(([key, artistRows]) => {
      const displayName = artistRows
        .map((row) => row.artist)
        .sort(
          (a, b) =>
            artistRows.filter((row) => row.artist === b).length -
              artistRows.filter((row) => row.artist === a).length ||
            a.localeCompare(b),
        )[0];
      return {
        key,
        displayName,
        ...classifyArtist(displayName, artistRows, existingArtistByKey, exactReplicationIds),
        replicationCount: artistRows.length,
        classificationReviewCount: 1,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const taxonomyRows = rows.map((row) =>
    buildRow(row, {
      existingMediaById,
      existingDetailById,
      channelByProductionId,
      feetByProductionId,
    }),
  );
  const confirmed = taxonomyRows.filter((row) => row.replicationStatus === "replication");

  return {
    schemaVersion: 2,
    operation: "classify-current-replication-library",
    generatedAt: new Date().toISOString(),
    target: TARGET,
    snapshotDigest,
    sources: Object.fromEntries(
      Object.entries(PATHS).map(([key, path]) => [key, { path, sha256: sha256File(path) }]),
    ),
    policy: {
      precedence: [
        "existing-taxonomy",
        "exact-item-review",
        "explicit-figure-role",
        "title-only-drug-extraction",
        "artist-practice-content-family-only",
        "unresolved-item-review",
      ],
      statusRule: "Artist practice and effect assignment never determine item replication status. Rows without exact evidence remain unreviewed.",
      galleryRule: "Only explicit not-replication rows are excluded. Unreviewed, unclear, and absent statuses remain visible by default.",
      drugRule: "Drug and class tags derive only from explicit title text; longest non-contained drug matches win.",
    },
    summary: {
      rows: taxonomyRows.length,
      artists: artists.length,
      replicationStatus: countsBy(taxonomyRows, "replicationStatus"),
      viewingMode: countsBy(confirmed, "viewingMode"),
      contentFamily: countsBy(taxonomyRows, "contentFamily"),
      taxonomyReviewRequired: taxonomyRows.filter((row) => row.taxonomyReviewRequired).length,
      titleDrugTagged: taxonomyRows.filter((row) => row.titleDrugs.length > 0).length,
      drugClassCounts: Object.fromEntries(
        ["psychedelics", "dissociatives", "deliriants", "other"].map((drugClass) => [
          drugClass,
          taxonomyRows.filter((row) => row.drugClasses.includes(drugClass)).length,
        ]),
      ),
      artistPrimaryType: countsBy(artists, "primaryType"),
    },
    artists,
    rows: taxonomyRows,
  };
}

async function main() {
  const manifest = await buildManifest();
  if (manifest.summary.rows !== 1119) {
    throw new Error(`Expected 1,119 live rows, found ${manifest.summary.rows}.`);
  }
  const expectedStatuses = { replication: 735, "not-replication": 27, unreviewed: 357 };
  if (
    Object.entries(expectedStatuses).some(
      ([status, count]) => manifest.summary.replicationStatus[status] !== count,
    )
  ) {
    throw new Error(`Unexpected status counts: ${JSON.stringify(manifest.summary.replicationStatus)}.`);
  }
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ output: OUTPUT_PATH, snapshotDigest: manifest.snapshotDigest, summary: manifest.summary }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

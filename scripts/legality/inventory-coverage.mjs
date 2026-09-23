#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { substanceVisibility } from "../../src/schema/substance/substanceVisibilityPolicy.ts";

const SCHEMA_VERSION = "dosewiki_legality_snapshot_inventory_v1";
const EVIDENCE_LABEL = "historical_snapshot_not_current_production_evidence";
const VISIBILITIES = ["public", "low_priority", "hidden"];
const CLASSIFICATIONS = ["cited_existing", "uncited_existing", "empty_short_existing", "absent", "excluded"];
const USAGE = "node scripts/legality/inventory-coverage.mjs --snapshot=<full-article-array.json> --roster=<country-roster.json> --out-dir=<campaign-dir> [--removals=<removal-records.json>] [--known-ambiguous-refs=<json>]";
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const jurisdictionKey = (value) => value.normalize("NFC").trim().toLowerCase();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

// Keep this identical to audit-subsection-citations.mjs: hashes cover the full
// JSON value, not just reader text, with sorted object keys and ordered arrays.
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hash(value) {
  return sha256(stableJson(value));
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a nonempty string.`);
  return value;
}

function requireSlug(value, label) {
  requireString(value, label);
  if (value === "." || value === ".." || /[/\\\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} cannot safely name packets/<slug>.json: ${JSON.stringify(value)}.`);
  }
  return value;
}

function parseFlags(argv) {
  const flags = new Map();
  for (const arg of argv) {
    const match = /^--(snapshot|roster|out-dir|removals|known-ambiguous-refs)=(.+)$/s.exec(arg);
    if (!match || flags.has(match[1])) throw new Error(`Unknown, empty, or duplicate argument: ${arg}.\n${USAGE}`);
    flags.set(match[1], match[2]);
  }
  for (const required of ["snapshot", "roster", "out-dir"]) {
    if (!flags.has(required)) throw new Error(`--${required} is required.\n${USAGE}`);
  }
  return flags;
}

// JSON.parse alone silently overwrites duplicate object keys. Scan the already
// syntax-checked JSON as well so duplicate raw country keys cannot disappear.
function rejectDuplicateKeys(text, label) {
  let offset = 0;
  const whitespace = () => { while (/\s/.test(text[offset] ?? "") && offset < text.length) offset++; };
  function stringToken() {
    const start = offset++;
    while (text[offset] !== '"') {
      if (text[offset] === "\\") offset++;
      offset++;
    }
    offset++;
    return JSON.parse(text.slice(start, offset));
  }
  function value(path) {
    whitespace();
    if (text[offset] === '"') { stringToken(); return; }
    if (text[offset] === "{" || text[offset] === "[") {
      const object = text[offset++] === "{";
      const end = object ? "}" : "]";
      const keys = new Set();
      let index = 0;
      whitespace();
      while (text[offset] !== end) {
        let child = `${path}[${index++}]`;
        if (object) {
          const key = stringToken();
          if (keys.has(key)) throw new Error(`${label}: duplicate JSON key ${JSON.stringify(key)} at ${path}.`);
          keys.add(key);
          child = `${path}[${JSON.stringify(key)}]`;
          whitespace();
          offset++; // Colon; JSON.parse already checked syntax.
        }
        value(child);
        whitespace();
        if (text[offset] !== ",") break;
        offset++;
        whitespace();
      }
      offset++;
      return;
    }
    const start = offset;
    while (offset < text.length && !/[\s,\]}]/.test(text[offset])) offset++;
    const token = text.slice(start, offset);
    if (token !== "null" && token !== "true" && token !== "false" && !Number.isFinite(Number(token))) {
      throw new Error(`${label}: non-finite JSON number at ${path}.`);
    }
  }
  value("$");
}

function readInput(path, label) {
  const bytes = readFileSync(path);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let value;
  try {
    value = JSON.parse(text);
    rejectDuplicateKeys(text, label);
  } catch (error) {
    throw new Error(`${label} is invalid: ${error.message}`);
  }
  return { bytes, value, sha256: sha256(bytes) };
}

function validateRoster(roster) {
  if (!isRecord(roster) || !Array.isArray(roster.countries) || !Array.isArray(roster.exclusions) || !isRecord(roster.source)) {
    throw new Error("Roster must be an object with countries[], exclusions[], and source{}.");
  }
  if (!(typeof roster.version === "string" && roster.version.trim()) && !(typeof roster.version === "number" && Number.isFinite(roster.version))) {
    throw new Error("Roster version must be a nonempty string or finite number.");
  }
  const labels = new Map();
  const register = (label, entry) => {
    requireString(label, "Roster jurisdiction name/alias");
    const key = jurisdictionKey(label);
    if (labels.has(key)) throw new Error(`Ambiguous or duplicate roster name/alias: ${JSON.stringify(label)}.`);
    labels.set(key, entry);
  };
  for (const country of roster.countries) {
    if (!isRecord(country)) throw new Error("Each roster country must be an object.");
    requireString(country.name, "Roster country name");
    if (own(country, "aliases") && (!Array.isArray(country.aliases) || !country.aliases.every((alias) => typeof alias === "string" && alias.trim()))) {
      throw new Error(`Invalid aliases for ${country.name}.`);
    }
    const entry = { country: country.name, excluded: false };
    register(country.name, entry);
    for (const alias of country.aliases ?? []) register(alias, entry);
  }
  for (const exclusion of roster.exclusions) {
    if (!isRecord(exclusion)) throw new Error("Each roster exclusion must be an object with a name and reason.");
    requireString(exclusion.name, "Exclusion name");
    requireString(exclusion.reason, `Exclusion reason for ${exclusion.name}`);
    if (own(exclusion, "aliases")) throw new Error("Exclusion aliases are unsupported; list every excluded label with an explicit reason.");
    register(exclusion.name, { country: exclusion.name, excluded: true, reason: exclusion.reason });
  }
  return { labels, countries: roster.countries.map((country) => country.name).sort(compare) };
}

function resolveJurisdiction(label, labels, context) {
  requireString(label, context);
  const result = labels.get(jurisdictionKey(label));
  if (!result) throw new Error(`${context}: unknown jurisdiction ${JSON.stringify(label)}; add it to the roster or explicit exclusions.`);
  return result;
}

function rawPresence(article) {
  const state = (value, key) => !own(value, key) ? "missing" : value[key] === null ? "null" : "present";
  return {
    legality: state(article, "legality"),
    countries: isRecord(article.legality) ? state(article.legality, "countries") : "missing",
    references: state(article, "references"),
  };
}

function referenceMetadata(article, knownAmbiguousIds) {
  if (article.references != null && !Array.isArray(article.references)) {
    throw new Error(`${article.slug}: references must be an array, null, or absent; object maps are not a documented repository reference shape.`);
  }
  const references = article.references ?? [];
  const ids = new Set();
  const duplicateIds = new Set();
  const unaddressableIndexes = [];
  references.forEach((reference, index) => {
    // apply-citations.mjs resolves stored references[].id. Legacy source_citations
    // are discovery metadata, not marker targets; do not invent converted IDs.
    if (!isRecord(reference) || typeof reference.id !== "string" || !reference.id.trim()) {
      unaddressableIndexes.push(index);
      return;
    }
    if (ids.has(reference.id)) duplicateIds.add(reference.id);
    ids.add(reference.id);
  });
  const unacknowledgedIds = [...duplicateIds].filter((id) => !knownAmbiguousIds?.has(id));
  if (unacknowledgedIds.length) throw new Error(`${article.slug}: ambiguous duplicate reference IDs: ${unacknowledgedIds.sort(compare).join(", ")}.`);
  for (const id of duplicateIds) ids.delete(id);
  return {
    ids,
    ambiguousIds: duplicateIds,
    metadata: {
      shape: rawPresence(article).references === "missing" ? "absent" : article.references === null ? "null" : "array",
      count: references.length,
      resolvableIds: [...ids].sort(compare),
      ambiguousIds: [...duplicateIds].sort(compare),
      unaddressableIndexes,
      contentHash: own(article, "references") ? hash(article.references) : null,
      resolutionPolicy: "exact stored references[].id only; no generated IDs or citation entailment assertion",
    },
  };
}

function inspectEntry(value, referenceIds, ambiguousIds) {
  const markerIds = new Set();
  let markerCount = 0;
  function textLength(item) {
    if (typeof item === "string") {
      for (const match of item.matchAll(/\[cite:([^\]]+)\]/g)) {
        markerIds.add(match[1]);
        markerCount++;
      }
      return item.replace(/\[cite:[^\]]+\]/g, "").replace(/\s+/g, " ").trim().length;
    }
    if (Array.isArray(item)) return item.reduce((total, child) => total + textLength(child), 0);
    if (isRecord(item)) return Object.values(item).reduce((total, child) => total + textLength(child), 0);
    return 0;
  }
  const substantiveChars = textLength(value);
  const sortedIds = [...markerIds].sort(compare);
  const resolvedMarkerIds = sortedIds.filter((id) => referenceIds.has(id));
  const danglingMarkerIds = sortedIds.filter((id) => !referenceIds.has(id));
  const ambiguousMarkerIds = sortedIds.filter((id) => ambiguousIds.has(id));
  return {
    substantiveChars,
    markerCount,
    markerIds: sortedIds,
    resolvedMarkerIds,
    danglingMarkerIds,
    ambiguousMarkerIds,
    classification: ambiguousMarkerIds.length ? "uncited_existing" : resolvedMarkerIds.length ? "cited_existing" : substantiveChars >= 40 ? "uncited_existing" : "empty_short_existing",
  };
}

function countRows(rows) {
  const classifications = Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, 0]));
  const stages = { preservation: 0, ready: 0 };
  for (const row of rows) {
    classifications[row.classification]++;
    stages[row.stage]++;
  }
  return { total: rows.length, classifications, stages };
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const snapshot = readInput(flags.get("snapshot"), "Snapshot");
  const rosterInput = readInput(flags.get("roster"), "Roster");
  const removalInput = flags.has("removals") ? readInput(flags.get("removals"), "Removals") : null;
  const ambiguousInput = flags.has("known-ambiguous-refs") ? readInput(flags.get("known-ambiguous-refs"), "Known ambiguous references") : null;
  const knownAmbiguousRefs = new Map();
  if (ambiguousInput && !isRecord(ambiguousInput.value)) throw new Error("Known ambiguous references must be a JSON object mapping slugs to reference ID arrays.");
  for (const [slug, ids] of Object.entries(ambiguousInput?.value ?? {})) {
    requireSlug(slug, "Known ambiguous reference slug");
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && id.trim()) || new Set(ids).size !== ids.length) {
      throw new Error(`${slug}: known ambiguous reference IDs must be a unique array of nonempty strings.`);
    }
    knownAmbiguousRefs.set(slug, new Set(ids));
  }
  if (!Array.isArray(snapshot.value)) throw new Error("Snapshot must be a full JSON article array, not an audit, envelope, or JSONL file.");
  const roster = rosterInput.value;
  const { labels, countries } = validateRoster(roster);
  if (removalInput && !Array.isArray(removalInput.value)) throw new Error("Removals must be a JSON array of {slug,country,reason,...} records.");
  const articles = [...snapshot.value];
  const slugs = new Set();
  const packetNames = new Set();
  for (const article of articles) {
    if (!isRecord(article)) throw new Error("Every snapshot article must be an object.");
    requireSlug(article.slug, "Article slug");
    if (slugs.has(article.slug)) throw new Error(`Duplicate article slug: ${article.slug}.`);
    slugs.add(article.slug);
    const packetName = article.slug.normalize("NFC").toLowerCase();
    if (packetNames.has(packetName)) throw new Error(`Packet filename collision on case-insensitive filesystems: ${article.slug}.`);
    packetNames.add(packetName);
    if (article.legality != null && !isRecord(article.legality)) throw new Error(`${article.slug}: legality must be an object, null, or absent.`);
    if (isRecord(article.legality) && own(article.legality, "countries") && !isRecord(article.legality.countries)) {
      throw new Error(`${article.slug}: legality.countries must be a country map when present (not null, an array, or a scalar).`);
    }
    if (article.index_categories != null && (!Array.isArray(article.index_categories) || !article.index_categories.every((value) => typeof value === "string"))) {
      throw new Error(`${article.slug}: index_categories must be a string array, null, or absent.`);
    }
    if (article.priority != null && typeof article.priority !== "string") throw new Error(`${article.slug}: priority must be a string, null, or absent.`);
  }
  articles.sort((left, right) => compare(left.slug, right.slug));
  const removals = (removalInput?.value ?? []).map((record) => {
    if (!isRecord(record)) throw new Error("Each removal must be an object.");
    requireSlug(record.slug, "Removal slug");
    requireString(record.reason, `Removal reason for ${record.slug}`);
    const jurisdiction = resolveJurisdiction(record.country, labels, `Removal for ${record.slug}`);
    return { slug: record.slug, country: jurisdiction.country, excluded: jurisdiction.excluded, record };
  }).sort((left, right) => compare(left.slug, right.slug) || compare(left.country, right.country) || compare(stableJson(left.record), stableJson(right.record)));
  const removalHistory = new Map();
  const pairKey = (slug, country) => JSON.stringify([slug, country]);
  for (const removal of removals) {
    const key = pairKey(removal.slug, removal.country);
    if (!removalHistory.has(key)) removalHistory.set(key, []);
    removalHistory.get(key).push(removal.record);
  }
  const provenance = {
    evidenceLabel: EVIDENCE_LABEL,
    productionVerified: false,
    productionWrites: "closed",
    scope: "all supplied articles, all visibility classes, every canonical roster country",
    snapshotSha256: snapshot.sha256,
    rosterSha256: rosterInput.sha256,
    rosterVersion: roster.version,
    rosterSource: roster.source,
    removalsSha256: removalInput?.sha256 ?? null,
    knownAmbiguousRefsSha256: ambiguousInput?.sha256 ?? null,
    completeness: "full-array input required; completeness against live substanceIndex is not verified offline",
  };
  const inventory = [];
  const rows = [];
  const excludedEntries = [];
  const files = new Map();
  files.set("snapshot.json", snapshot.bytes);
  files.set("roster.json", rosterInput.bytes);
  if (removalInput) files.set("removals.json", removalInput.bytes);
  if (ambiguousInput) files.set("known-ambiguous-refs.json", ambiguousInput.bytes);
  for (const article of articles) {
    const { slug } = article;
    const visibility = substanceVisibility({ indexCategories: article.index_categories, priority: article.priority });
    const articleHash = hash(article);
    const presence = rawPresence(article);
    const identity = {
      slug,
      title: article.title ?? null,
      names: {
        title: article.title ?? null,
        synonyms: article.identification?.alternative_names ?? [],
      },
      identification: article.identification ?? null,
    };
    const { ids, ambiguousIds, metadata: references } = referenceMetadata(article, knownAmbiguousRefs.get(slug));
    const entries = new Map();
    for (const [rawCountry, value] of Object.entries(article.legality?.countries ?? {})) {
      const jurisdiction = resolveJurisdiction(rawCountry, labels, `${slug}.legality.countries`);
      if (entries.has(jurisdiction.country)) {
        throw new Error(`${slug}: duplicate country pair through aliases ${JSON.stringify(entries.get(jurisdiction.country).rawCountry)} and ${JSON.stringify(rawCountry)}.`);
      }
      entries.set(jurisdiction.country, { rawCountry, value, jurisdiction });
    }
    function rowFor(country, entry) {
      const history = removalHistory.get(pairKey(slug, country)) ?? [];
      const inspected = entry ? inspectEntry(entry.value, ids, ambiguousIds) : {
        substantiveChars: 0, markerCount: 0, markerIds: [], resolvedMarkerIds: [], danglingMarkerIds: [], ambiguousMarkerIds: [], classification: "absent",
      };
      const classification = entry?.jurisdiction.excluded ? "excluded" : inspected.classification;
      return {
        slug,
        country,
        rawCountry: entry?.rawCountry ?? null,
        visibility,
        rosterVersion: roster.version,
        articleHash,
        baselinePresence: Boolean(entry),
        baselineHash: entry ? hash(entry.value) : null,
        value: entry ? entry.value : null,
        ...inspected,
        classification,
        exclusionReason: entry?.jurisdiction.reason ?? null,
        stage: classification === "cited_existing" || classification === "excluded" ? "preservation" : "ready",
        workerIds: [],
        artifactIds: [],
        searches: [],
        verdicts: [],
        priorRemovals: history,
        blockers: [
          "historical_snapshot_requires_live_reconciliation",
          "production_writes_closed",
          ...(history.length ? ["prior_removal_requires_review"] : []),
          ...(inspected.danglingMarkerIds.length ? ["dangling_citation_markers"] : []),
          ...(inspected.ambiguousMarkerIds.length ? ["ambiguous_reference_id"] : []),
        ],
        finalDisposition: null,
      };
    }
    const articleRows = countries.map((country) => rowFor(country, entries.get(country)));
    const articleExcluded = [...entries.entries()].filter(([, entry]) => entry.jurisdiction.excluded)
      .sort(([left], [right]) => compare(left, right)).map(([country, entry]) => rowFor(country, entry));
    rows.push(...articleRows);
    excludedEntries.push(...articleExcluded);
    const summary = {
      slug,
      identity,
      visibility,
      rawVisibility: { indexCategories: article.index_categories ?? null, priority: article.priority ?? null },
      rawPresence: presence,
      articleHash,
      legalityHash: own(article, "legality") ? hash(article.legality) : null,
      countriesHash: isRecord(article.legality) && own(article.legality, "countries") ? hash(article.legality.countries) : null,
      rawCountryKeys: [...entries.values()].map((entry) => entry.rawCountry).sort(compare),
      canonicalExistingCountries: [...entries.keys()].filter((country) => !entries.get(country).jurisdiction.excluded).sort(compare),
      countryEntryCount: entries.size,
      excludedEntryCount: articleExcluded.length,
      references,
      coverage: countRows(articleRows),
      packet: `packets/${slug}.json`,
    };
    inventory.push(summary);
    files.set(summary.packet, jsonBytes({
      schemaVersion: SCHEMA_VERSION,
      provenance,
      ...summary,
      article,
      baseline: { countries: articleRows, excludedEntries: articleExcluded },
    }));
  }
  const expectedPairs = articles.length * countries.length;
  const uniquePairs = new Set(rows.map((row) => pairKey(row.slug, row.country))).size;
  const rawEntryCount = inventory.reduce((total, article) => total + article.countryEntryCount, 0);
  const presentPairs = rows.filter((row) => row.baselinePresence).length;
  if (rows.length !== expectedPairs || uniquePairs !== expectedPairs || presentPairs + excludedEntries.length !== rawEntryCount) {
    throw new Error("Inventory invariants failed: duplicate or unaccounted article-country pairs or raw entries.");
  }
  const totals = {
    articles: articles.length,
    canonicalCountries: countries.length,
    pairs: countRows(rows),
    excludedEntries: countRows(excludedEntries),
    rawCountryEntries: rawEntryCount,
    noLegalityArticles: inventory.filter((article) => article.rawPresence.legality !== "present").length,
    zeroCountryEntryArticles: inventory.filter((article) => article.countryEntryCount === 0).length,
    removalRecords: removals.length,
    byVisibility: Object.fromEntries(VISIBILITIES.map((visibility) => [visibility, {
      articles: inventory.filter((article) => article.visibility === visibility).length,
      pairs: countRows(rows.filter((row) => row.visibility === visibility)),
      excludedEntries: countRows(excludedEntries.filter((row) => row.visibility === visibility)),
    }])),
    byCountry: Object.fromEntries(countries.map((country) => [country, {
      ...countRows(rows.filter((row) => row.country === country)),
      byVisibility: Object.fromEntries(VISIBILITIES.map((visibility) => [visibility, countRows(rows.filter((row) => row.country === country && row.visibility === visibility))])),
    }])),
    byExcludedJurisdiction: Object.fromEntries([...roster.exclusions].sort((left, right) => compare(left.name, right.name)).map((exclusion) => [exclusion.name, countRows(excludedEntries.filter((row) => row.country === exclusion.name))])),
    invariants: {
      expectedPairs,
      actualPairs: rows.length,
      uniquePairs,
      duplicatePairs: rows.length - uniquePairs,
      unaccountedPairs: expectedPairs - uniquePairs,
      presentPairs,
      absentPairs: rows.length - presentPairs,
      accountedRawEntries: presentPairs + excludedEntries.length,
      unaccountedRawEntries: rawEntryCount - presentPairs - excludedEntries.length,
    },
  };
  files.set("inventory.json", jsonBytes({ schemaVersion: SCHEMA_VERSION, provenance, totals, articles: inventory }));
  files.set("coverage.json", jsonBytes({
    schemaVersion: SCHEMA_VERSION,
    provenance,
    viabilityFloorChars: 40,
    substantiveTextPolicy: "recursive string values, citation markers stripped, whitespace collapsed and trimmed per string",
    totals,
    rows,
    exclusions: {
      definitions: [...roster.exclusions].sort((left, right) => compare(left.name, right.name)),
      entries: excludedEntries,
      policy: "Only observed excluded entries have article records; excluded labels are not missing-country pairs.",
    },
    removalHistory: removals,
    unmatchedRemovalHistory: removals.filter((removal) => !slugs.has(removal.slug) || (removal.excluded && !excludedEntries.some((row) => row.slug === removal.slug && row.country === removal.country))),
  }));
  const checksums = () => [...files.entries()].sort(([left], [right]) => compare(left, right))
    .map(([path, bytes]) => ({ path, sha256: sha256(bytes), bytes: bytes.length }));
  files.set("manifest.json", jsonBytes({
    schemaVersion: SCHEMA_VERSION,
    provenance,
    hashAlgorithm: "SHA256; source/output hashes use exact bytes; article/entry hashes use audit stableJson",
    totals,
    outputs: checksums(),
    checksumScope: "All payload outputs. checksums.json additionally covers this manifest; a checksum file cannot include its own byte hash.",
  }));
  files.set("checksums.json", jsonBytes({ algorithm: "sha256", scope: "Every output except checksums.json itself", outputs: checksums() }));

  // Validate all input and compute all artifacts before touching the output tree.
  // Existing differing artifacts and symlinks are refused, not overwritten.
  const outputDir = resolve(flags.get("out-dir"));
  const pending = [];
  for (const [relative, bytes] of files) {
    const path = resolve(outputDir, relative);
    let ancestor = path;
    while (true) {
      let stat;
      try { stat = lstatSync(ancestor); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (stat?.isSymbolicLink()) throw new Error(`Refusing symlink output path: ${ancestor}.`);
      if (stat && ancestor !== path && !stat.isDirectory()) throw new Error(`Output parent is not a directory: ${ancestor}.`);
      if (ancestor === outputDir) break;
      const parent = dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    if (existsSync(path)) {
      if (!lstatSync(path).isFile() || !readFileSync(path).equals(bytes)) throw new Error(`Refusing to replace a different existing artifact: ${path}. Use a new campaign directory.`);
    } else {
      pending.push({ path, bytes });
    }
  }
  for (const { path, bytes } of pending) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: "wx" });
  }
  console.log(`Offline legality inventory: ${outputDir}`);
  console.log(JSON.stringify({ articles: articles.length, pairs: rows.length, excludedEntries: excludedEntries.length, evidenceLabel: EVIDENCE_LABEL }));
}

try {
  main();
} catch (error) {
  console.error(`Legality inventory failed: ${error.message}`);
  process.exitCode = 1;
}

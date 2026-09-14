import path from "path";
import { fileURLToPath } from "url";

const NAME_MAP = {
  "2c-t-x": "2C-T-x compounds",
  "2c-x": "2C-x compounds",
  "5-meo-xxt": "5-MeO-xxT tryptamines",
  dox: "DOx compounds",
  nbomes: "NBOMe compounds",
  amphetamines: "Amphetamines",
  opioids: "Opioids",
  benzodiazepines: "Benzodiazepines",
  mushrooms: "Psilocybin mushrooms",
  ssris: "SSRIs",
  maois: "MAOIs",
  "ghb/gbl": "GHB/GBL",
  mxe: "MXE",
  amt: "AMT",
  pcp: "PCP",
  lsd: "LSD",
  mdma: "MDMA",
  dmt: "DMT",
  dextromethorphan: "DXM",
  dxm: "DXM",
  ketamine: "Ketamine",
  alcohol: "Alcohol",
  cannabis: "Cannabis",
  cocaine: "Cocaine",
  caffeine: "Caffeine",
  lithium: "Lithium",
  tramadol: "Tramadol",
  nitrous: "Nitrous oxide",
  mephedrone: "Mephedrone",
  mescaline: "Mescaline",
  diphenhydramine: "Diphenhydramine",
  pregabalin: "Pregabalin",
  stimulants: "Stimulants",
  depressants: "Depressants",
  dissociatives: "Dissociatives",
  psychedelics: "Psychedelics",
  "25x-nbome": "NBOMe compounds",
  "25x-nbome & 25x-nboh": "NBOMe compounds",
  "25i-nbome": "NBOMe compounds",
  nbome: "NBOMe compounds",
  nboh: "NBOMe compounds",
};

const STATUS_MAP = {
  Dangerous: "dangerous",
  Unsafe: "unsafe",
  Caution: "caution",
};

const SEVERITIES = ["dangerous", "unsafe", "caution"];

export function resolveInteractionDataPaths(scriptUrl) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(scriptUrl)), "..", "..");
  return {
    repoRoot,
    articlesPath: path.join(repoRoot, "src/data/SubstanceIndex.json"),
    combosPath: path.join(repoRoot, "src/data/tripsit-combos.json"),
    parsedPath: path.join(repoRoot, "src/data/parsed-sources.json"),
  };
}

function formatInteractionName(name) { const trimmed = name.trim();
const lower = trimmed.toLowerCase();
return NAME_MAP[lower] || trimmed.charAt(0).toUpperCase() + trimmed.slice(1); }

function mapTripSitStatus(status) { return STATUS_MAP[status]; }

function deduplicateInteractions(names) { const seen = new Map();
for (const name of names) {
  const formatted = formatInteractionName(name);
  const key = formatted.toLowerCase();
  if (!seen.has(key)) seen.set(key, formatted);
}
return Array.from(seen.values()).sort(); }

function sortByName(left, right) {
  const leftName = left.replace(/\s*\(.*$/, "").toLowerCase();
  const rightName = right.replace(/\s*\(.*$/, "").toLowerCase();
  return leftName.localeCompare(rightName);
}

export function normalizeTripSitInteractions(comboEntries) {
  const interactions = { dangerous: [], unsafe: [], caution: [] };
  let lowRiskSkipped = 0;

  for (const [target, info] of Object.entries(comboEntries)) {
    const severity = mapTripSitStatus(info.status);
    if (!severity) {
      lowRiskSkipped++;
      continue;
    }
    const name = formatInteractionName(target);
    const note = info.note?.trim();
    interactions[severity].push(note ? `${name} (${note})` : name);
  }

  for (const severity of SEVERITIES) interactions[severity].sort(sortByName);
  return { interactions, lowRiskSkipped };
}

export function normalizeParsedInteractions(records) {
  const valid = records.filter((record) => SEVERITIES.includes(record.severity));
  const interactions = Object.fromEntries(SEVERITIES.map((severity) => [
    severity,
    deduplicateInteractions(
      valid.filter((record) => record.severity === severity).map((record) => record.substance),
    ),
  ]));

  return {
    interactions,
    sources: [...new Set(valid.map((record) => record.source))],
    validCount: valid.length,
  };
}

#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { findLeftoverLatin, findRepeatedPunctuation, looksTranslatable } from "./validate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CJK = /[\u3400-\u9FFF\uF900-\uFAFF]/;

const isTermCandidate = (value) =>
  typeof value === "string" &&
  value.length >= 3 &&
  value.length <= 64 &&
  value.split(/\s+/).length <= 6 &&
  !/[.!?;:]$/.test(value.trim()) &&
  /[A-Za-z]/.test(value);

function collectPairs(source, target, onValue) {
  if (Array.isArray(source)) {
    source.forEach((item, index) => collectPairs(item, target?.[index], onValue));
    return;
  }
  if (source && typeof source === "object") {
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target && typeof target === "object" ? target[key] : undefined;
      if (typeof sourceValue === "string") {
        if (typeof targetValue === "string") onValue(sourceValue, targetValue);
      } else {
        collectPairs(sourceValue, targetValue, onValue);
      }
    }
  }
}

const CONNECTIVES = new Set(["of", "the", "a", "an", "and", "in", "to", "for"]);
const canonical = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word && !CONNECTIVES.has(word))
    .sort()
    .join(" ");

export function buildTermIndex(corpora) {
  const renderings = new Map();
  const prose = [];
  for (const { label, source, target } of corpora) {
    collectPairs(source, target, (src, tgt) => {
      if (src.split(/\s+/).length > 8) {
        if (looksTranslatable(src) && tgt !== src) prose.push({ label, source: src, target: tgt });
        return;
      }
      if (!isTermCandidate(src)) return;
      if (!CJK.test(tgt) || tgt === src) return;
      if (!renderings.has(src)) renderings.set(src, new Map());
      const forms = renderings.get(src);
      const seen = forms.get(tgt) ?? { count: 0, corpora: new Set() };
      seen.count += 1;
      seen.corpora.add(label);
      forms.set(tgt, seen);
    });
  }
  const terms = new Map();
  for (const [src, forms] of renderings) {
    const key = canonical(src);
    const ranked = [...forms].sort((a, b) => b[1].count - a[1].count);
    const existing = terms.get(key);
    const merged = existing ?? { source: src, pinned: ranked[0][0], occurrences: 0, surfaces: new Set(), variants: new Map() };
    merged.surfaces.add(src);
    for (const [form, meta] of ranked) {
      const seen = merged.variants.get(form) ?? { count: 0, corpora: new Set() };
      seen.count += meta.count;
      for (const corpus of meta.corpora) seen.corpora.add(corpus);
      merged.variants.set(form, seen);
      merged.occurrences += meta.count;
    }
    terms.set(key, merged);
  }
  for (const term of terms.values()) {
    const ranked = [...term.variants].sort((a, b) => b[1].count - a[1].count);
    term.pinned = ranked[0][0];
    term.variants = ranked.map(([form, meta]) => ({ form, count: meta.count, corpora: [...meta.corpora] }));
    term.source = [...term.surfaces].sort((a, b) => b.length - a.length)[0];
  }
  return { terms, prose };
}

export function findCollisions(terms) {
  const byRendering = new Map();
  for (const term of terms.values()) {
    if (!byRendering.has(term.pinned)) byRendering.set(term.pinned, []);
    byRendering.get(term.pinned).push(term);
  }
  return [...byRendering]
    .filter(([, group]) => new Set(group.map((term) => canonical(term.source))).size > 1)
    .map(([rendering, group]) => ({
      rendering,
      sources: group.map((term) => term.source).sort(),
      occurrences: group.reduce((total, term) => total + term.occurrences, 0),
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

export function findDrift(terms) {
  return [...terms.values()]
    .filter((term) => term.variants.length > 1)
    .map((term) => ({
      source: term.source,
      variants: term.variants,
      corpora: [...new Set(term.variants.flatMap((variant) => variant.corpora))],
    }))
    .sort((a, b) => b.variants.length - a.variants.length);
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findUnpinned(terms, prose, { excludedSenses = {}, minMentions = 3 } = {}) {
  const indexed = [...terms.values()].map((term) => ({
    term,
    pattern: new RegExp(`\\b${escapeRegExp(term.source)}\\b`, "i"),
  }));
  const longerContaining = new Map();
  for (const { term } of indexed) {
    const lowered = term.source.toLowerCase();
    longerContaining.set(
      term.source,
      indexed
        .filter(({ term: other }) => {
          if (other === term || other.source.length <= term.source.length) return false;
          return new RegExp(`\\b${escapeRegExp(lowered)}\\b`, "i").test(other.source);
        })
        .map(({ pattern }) => pattern),
    );
  }

  const findings = [];
  for (const { term, pattern } of indexed) {
    if (term.source.length < 5) continue;
    const excluded = (excludedSenses[term.source] ?? []).map((sense) => sense.toLowerCase());
    const shadows = longerContaining.get(term.source) ?? [];
    let mentions = 0;
    const missing = [];
    for (const segment of prose) {
      if (!pattern.test(segment.source)) continue;
      if (shadows.some((shadow) => shadow.test(segment.source))) continue;
      const lowered = segment.source.toLowerCase();
      if (excluded.some((sense) => lowered.includes(sense))) continue;
      mentions += 1;
      if (!segment.target.includes(term.pinned)) missing.push(segment);
    }
    if (mentions < minMentions || missing.length === 0) continue;
    findings.push({
      source: term.source,
      pinned: term.pinned,
      mentions,
      missing: missing.length,
      rate: missing.length / mentions,
      samples: missing.slice(0, 2).map((segment) => segment.source.slice(0, 160)),
    });
  }
  return findings.sort((a, b) => b.missing - a.missing);
}

export function findGlossaryDisagreements(terms, glossary) {
  const byKey = new Map([...terms.values()].map((term) => [canonical(term.source), term]));
  return Object.entries(glossary)
    .flatMap(([source, approved]) => {
      const term = byKey.get(canonical(source));
      if (!term || term.pinned === approved) return [];
      return [{ source, approved, pinned: term.pinned, occurrences: term.occurrences }];
    })
    .sort((a, b) => b.occurrences - a.occurrences);
}

export function findOutputDefects(prose, { glossary = {} } = {}) {
  const repeatedPunctuation = [];
  const leftoverLatin = [];
  for (const segment of prose) {
    const runs = findRepeatedPunctuation(segment.source, segment.target);
    if (runs.length > 0) repeatedPunctuation.push({ label: segment.label, runs, source: segment.source.slice(0, 160), target: segment.target.slice(0, 160) });
    if (!CJK.test(segment.target)) continue;
    const words = findLeftoverLatin({ source: segment.source, target: segment.target, glossary });
    if (words.length > 0) leftoverLatin.push({ label: segment.label, words, source: segment.source.slice(0, 160), target: segment.target.slice(0, 160) });
  }
  return { repeatedPunctuation, leftoverLatin };
}

export function reviewSheet(terms) {
  return [...terms.values()]
    .sort((a, b) => b.occurrences - a.occurrences)
    .map((term) => [term.source, term.pinned, term.occurrences, term.variants.length].join("\t"));
}

function loadPair(spec) {
  const [sourcePath, targetPath] = spec.split(":");
  if (!sourcePath || !targetPath) throw new Error(`--pair needs <source.json>:<translated.json>, got "${spec}"`);
  for (const file of [sourcePath, targetPath]) {
    if (!existsSync(file)) throw new Error(`No such file: ${file}`);
  }
  return {
    label: path.basename(sourcePath, ".json"),
    source: JSON.parse(readFileSync(sourcePath, "utf8")),
    target: JSON.parse(readFileSync(targetPath, "utf8")),
  };
}

function discoverPairs(locale) {
  const localeDir = path.join(repoRoot, "notes-and-plans/exports/translation", locale);
  if (!existsSync(localeDir)) return [];

  return readdirSync(localeDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = path.join(localeDir, entry.name);
      const sourcePath = path.join(dir, "source-export.json");
      if (!existsSync(sourcePath)) return [];
      const target = readdirSync(dir).find((file) => file.endsWith(`.${locale}.json`));
      if (!target) return [];
      return [{
        label: entry.name,
        source: JSON.parse(readFileSync(sourcePath, "utf8")),
        target: JSON.parse(readFileSync(path.join(dir, target), "utf8")),
      }];
    });
}

async function main() {
  const { values } = parseArgs({
    options: {
      all: { type: "boolean", default: false },
      locale: { type: "string", default: "zh-Hans" },
      pair: { type: "string", multiple: true, default: [] },
      senses: { type: "string" },
      terms: { type: "string" },
      glossary: { type: "boolean", default: false },
      out: { type: "string" },
      "max-rows": { type: "string", default: "25" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help || (values.pair.length === 0 && !values.all)) {
    console.log(`Usage: node scripts/translation/glossary-audit.mjs --pair <source.json>:<translated.json> [--pair ...]

  --all     Audit every corpus this locale has produced, discovered under
            notes-and-plans/exports/translation/<locale>/. Exits non-zero on a
            collision or on drift.
  --locale  Locale for --all. Defaults to zh-Hans.
  --pair    Repeatable. Source export and its translated twin, colon separated.
            Pass every corpus at once: cross-corpus drift is the finding that
            only appears when they are audited together.
  --senses  JSON file mapping a term to source phrases that use a different
            sense, e.g. {"Depression": ["respiratory depression"]}.
  --terms   JSON array of source terms. Restricts the prose scan to curated
            terminology. Display labels whose grammatical form legitimately
            varies in a sentence, such as legal statuses, belong outside it.
  --glossary
            Read the approved glossary for --locale from Postgres
            (DATA_BACKEND=postgres): scope the prose scan to its terms and
            report DISAGREE, terms whose approved rendering differs from the
            corpus pin. Combines with --terms.
  --out     Write the full report as JSON, plus a .tsv review sheet beside it.`);
    process.exit(values.help ? 0 : 1);
  }

  const corpora = values.all ? discoverPairs(values.locale) : values.pair.map(loadPair);
  if (corpora.length === 0) {
    console.error(`No corpus artifacts found for ${values.locale}. Run translate:locale first.`);
    process.exit(1);
  }
  const excludedSenses = values.senses ? JSON.parse(readFileSync(values.senses, "utf8")) : {};
  const glossary = values.glossary ? await loadApprovedGlossary(values.locale) : null;
  const { terms, prose } = buildTermIndex(corpora);
  const collisions = findCollisions(terms);
  const drift = findDrift(terms);
  const curated = [
    ...(values.terms ? JSON.parse(readFileSync(values.terms, "utf8")) : []),
    ...Object.keys(glossary ?? {}),
  ];
  const scoped = curated.length > 0
    ? new Map([...terms].filter(([, term]) => new Set(curated.map(canonical)).has(canonical(term.source))))
    : terms;
  const unpinned = findUnpinned(scoped, prose, { excludedSenses });
  const disagreements = glossary ? findGlossaryDisagreements(terms, glossary) : [];
  const output = findOutputDefects(prose, { glossary: glossary ?? {} });
  const maxRows = Number(values["max-rows"]);

  console.log(`Corpora   ${corpora.map((corpus) => corpus.label).join(", ")}`);
  console.log(`Terms     ${terms.size} pinned from standalone values`);
  console.log(`Prose     ${prose.length} aligned segments\n`);

  console.log(`COLLISION  ${collisions.length} target strings serve more than one source term`);
  for (const item of collisions.slice(0, maxRows)) {
    console.log(`  ${item.rendering}  <-  ${item.sources.join("  /  ")}`);
  }

  console.log(`\nDRIFT      ${drift.length} terms carry more than one rendering`);
  for (const item of drift.slice(0, maxRows)) {
    console.log(`  ${item.source}  ->  ${item.variants.map((v) => `${v.form} (${v.count}, ${v.corpora.join("+")})`).join("  |  ")}`);
  }

  console.log(`\nUNPINNED   ${unpinned.length} terms whose agreed rendering is absent from prose that mentions them`);
  for (const item of unpinned.slice(0, maxRows)) {
    console.log(`  ${item.source} (pinned ${item.pinned}) absent in ${item.missing}/${item.mentions}`);
    for (const sample of item.samples) console.log(`      e.g. ${sample}`);
  }

  console.log(`\nPUNCTUATION ${output.repeatedPunctuation.length} prose segments with doubled full-width punctuation (REPEATED_PUNCTUATION, blocking)`);
  for (const item of output.repeatedPunctuation.slice(0, maxRows)) console.log(`  ${item.runs.join(" ")}  ${item.target}`);
  console.log(`\nENGLISH    ${output.leftoverLatin.length} prose segments with leftover English words (LEFTOVER_LATIN, a review finding)`);
  for (const item of output.leftoverLatin.slice(0, maxRows)) console.log(`  ${item.words.join(", ")}  ${item.target}`);

  if (glossary) {
    console.log(`\nDISAGREE   ${disagreements.length} approved glossary terms the corpus pins differently (${Object.keys(glossary).length} approved terms read)`);
    for (const item of disagreements.slice(0, maxRows)) {
      console.log(`  ${item.source}  approved ${item.approved}  pinned ${item.pinned} (${item.occurrences})`);
    }
  }

  if (values.out) {
    const report = { generatedAt: new Date().toISOString(), corpora: corpora.map((c) => c.label), termCount: terms.size, collisions, drift, unpinned, disagreements, output };
    writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
    const sheetPath = values.out.replace(/\.json$/, "") + ".review.tsv";
    writeFileSync(sheetPath, `source\tpinned\toccurrences\tvariants\n${reviewSheet(terms).join("\n")}\n`);
    console.log(`\nReport       ${values.out}`);
    console.log(`Review sheet ${sheetPath}`);
  }

  process.exitCode = collisions.length > 0 || drift.length > 0 ? 1 : 0;
}

async function loadApprovedGlossary(locale) {
  const { loadGlossary } = await import("../../lib/translation/glossary.ts");
  return loadGlossary(locale);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } finally {
    if (process.env.DATA_BACKEND === "postgres" && process.env.POSTGRES_POOLED_URL) {
      const { getPostgresClient } = await import("../../lib/postgres/runtime/backend.ts");
      await getPostgresClient().end();
    }
  }
}

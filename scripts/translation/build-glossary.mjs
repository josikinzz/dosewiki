#!/usr/bin/env node
/**
 * Freeze one glossary for every corpus.
 *
 * A term's Chinese rendering is never guessed here. Each term is translated
 * once, alone, with the same model and the same gates the corpus runs use, and
 * the result is written to a file the runner then injects into every batch that
 * mentions the term. Alone is the point: a term standing on its own has no
 * sentence around it to bend it, so the rendering that comes back is the
 * rendering the term has, and the corpus is held to it afterwards.
 *
 * Terms come from the vocabularies the site already publishes: every effect
 * name in the effect index, every effect category, every psychoactive class,
 * the frequency scale those categories are labelled with, and the harm
 * reduction register seeded in the locale.
 *
 * Adding a term is editing the emitted JSON. No code changes.
 *
 * Usage:
 *   node scripts/translation/build-glossary.mjs [--locale zh-Hans] [--dry-run]
 *   node scripts/translation/build-glossary.mjs --merge   # keep existing renderings
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { Agent, setGlobalDispatcher } from "undici";

import { callOpenRouterChat } from "../lib/openrouter-sdk.mjs";
import { resolveLocale, glossaryPath, LOCALES } from "./locales.mjs";
import { validateSegment, isBlocking, parseModelJson } from "./validate.mjs";
import { EFFECT_CATEGORY_DEFINITIONS } from "../../src/data/effectCategoryDefinitions.ts";

setGlobalDispatcher(new Agent({ allowH2: false, connections: 64, headersTimeout: 300_000, bodyTimeout: 300_000 }));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EFFECT_INDEX_URL = "https://dose.wiki/open-data/EffectIndex.json";
const MODEL = "z-ai/glm-5.3-flash";

/**
 * The five terms the intensity scales label every effect with. They appear as
 * `[sup](common)[/sup]` inside scale rosters and as an ordered list in the
 * frequency article, so one rendering has to serve both or the two surfaces
 * stop agreeing.
 */
const FREQUENCY_TERMS = ["Rare", "Uncommon", "Common", "Frequent", "Near universal"];

async function collectTerms(locale) {
  const terms = new Map();
  // The seed register is already frozen by hand; re-rendering "Dissociative"
  // beside its lower-case twin would manufacture a collision out of casing.
  const seeded = new Set(Object.keys(LOCALES[locale.code]?.glossary ?? {}).map((term) => term.toLowerCase()));
  const add = (term, kind) => {
    const trimmed = String(term ?? "").trim();
    if (trimmed.length < 2) return;
    if (seeded.has(trimmed.toLowerCase())) return;
    if (terms.has(trimmed.toLowerCase())) return;
    terms.set(trimmed.toLowerCase(), { term: trimmed, kind });
  };

  const effects = await fetch(EFFECT_INDEX_URL, { headers: { accept: "application/json" } }).then((r) => r.json());
  for (const item of effects.items ?? []) add(item.name, "effect-name");

  for (const category of EFFECT_CATEGORY_DEFINITIONS) add(category.name, "effect-category");

  const psychoactive = JSON.parse(
    await readFile(path.join(repoRoot, "src/data/indexes/psychoactiveIndexManual.json"), "utf8"),
  );
  for (const category of psychoactive.categories ?? []) add(category.label, "psychoactive-class");

  for (const term of FREQUENCY_TERMS) add(term, "frequency");

  // The closed sets. A legal status, a dose tier, a duration stage, a harm
  // level and a chemical class each have exactly one right rendering, and each
  // one appears both as a registry label and inside substance prose. Left
  // unfrozen they drift between the two, which is the drift the audit kept
  // finding: the layout registry saying one thing and the article saying
  // another about the same badge.
  const registryPath = path.join(repoRoot, "notes-and-plans/exports/translation/registry/Layout.json");
  if (existsSync(registryPath)) {
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    for (const item of registry.items ?? []) {
      if (item.kind === "enum-value" && item.machine?.enum !== "route") add(item.label, `enum:${item.machine?.enum ?? "unknown"}`);
      if (item.kind === "chemical-class") add(item.label, "chemical-class");
    }
  }

  return [...terms.values()].sort((a, b) => a.term.localeCompare(b.term));
}

const SYSTEM = `You are compiling a Simplified Chinese (zh-Hans) terminology list for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

Each input is a term as it appears on the site: an effect name, an effect category, a drug class, or a frequency label. Give the Simplified Chinese term a mainland-China reader in this field would use.

Rules:
1. Return the term only. No explanation, no parenthetical gloss, no English echo.
2. Simplified characters only. Never a Traditional form.
3. Keep Latin-script proper nouns and chemical names in Latin script.
4. Prefer the standard mainland clinical or scientific term where one exists.
5. Two different English terms must not receive the same Chinese term. If two inputs are near-synonyms, render the distinction the English draws.
6. Numbers and units are copied exactly.`;

async function translateBatch({ entries, locale, apiKey }) {
  const payload = Object.fromEntries(entries.map((entry, index) => [`t${index}`, entry.term]));
  const userMessage = [
    `Translate each term into ${locale.label}.`,
    "",
    "Input JSON:",
    JSON.stringify(payload, null, 1),
    "",
    "Return ONLY a JSON object with the same keys and translated values.",
  ].join("\n");

  // A batch that comes back unparsable loses forty terms at once, and a
  // partially frozen glossary is worse than a slow one.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await callOpenRouterChat({
        apiKey,
        appTitle: "dose.wiki glossary freeze",
        model: MODEL,
        systemPrompt: SYSTEM,
        userMessage,
        temperature: 0,
        maxTokens: 8192,
        reasoningEffort: "low",
        excludeReasoning: true,
      });
      const parsed = parseModelJson(response.content);
      if (parsed.ok) {
        return entries.map((entry, index) => ({ entry, target: parsed.value[`t${index}`] ?? null }));
      }
    } catch (error) {
      if (attempt === 4) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** (attempt - 1)));
  }

  return entries.map((entry) => ({ entry, target: null }));
}

function chunk(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/**
 * A second pass over the terms that landed on one Chinese string. The model
 * sees every colliding term at once, so it can move the one that should move
 * rather than inventing a synonym for both. A seeded term is shown but never
 * changed: the register was fixed by hand and the new term is the one that has
 * to give way.
 */
async function resolveCollisions({ collisions, locale, apiKey, results, seedGlossary }) {
  const resolved = new Map();

  for (const [target, sources] of collisions) {
    const movable = sources.filter((term) => results.has(term) && !(term in seedGlossary));
    if (movable.length === 0) continue;

    const response = await callOpenRouterChat({
      apiKey,
      appTitle: "dose.wiki glossary collision",
      model: MODEL,
      systemPrompt: SYSTEM,
      userMessage: [
        `These English terms all received the same ${locale.label} rendering "${target}", which loses a distinction the English makes:`,
        "",
        sources.map((term) => `- ${term}`).join("\n"),
        "",
        `Give each of these terms a distinct rendering: ${movable.join(", ")}.`,
        sources.length > movable.length
          ? `Leave "${sources.filter((term) => !movable.includes(term)).join('", "')}" as "${target}"; that rendering is fixed.`
          : `One of them may keep "${target}".`,
        "",
        "Return ONLY a JSON object mapping each English term to its rendering.",
      ].join("\n"),
      temperature: 0,
      maxTokens: 2048,
      reasoningEffort: "low",
      excludeReasoning: true,
    });

    const parsed = parseModelJson(response.content);
    if (!parsed.ok) continue;

    for (const term of movable) {
      const candidate = parsed.value[term];
      if (typeof candidate !== "string" || candidate.trim().length === 0) continue;
      const evaluation = validateSegment({ source: term, target: candidate, locale });
      if (isBlocking(evaluation.defects)) continue;
      resolved.set(term, candidate.trim());
    }
  }

  return resolved;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      locale: { type: "string", default: "zh-Hans" },
      "dry-run": { type: "boolean", default: false },
      merge: { type: "boolean", default: false },
    },
  });

  const locale = resolveLocale(values.locale);
  const terms = await collectTerms(locale);
  const outPath = glossaryPath(locale.code);

  const byKind = terms.reduce((acc, entry) => ({ ...acc, [entry.kind]: (acc[entry.kind] ?? 0) + 1 }), {});
  console.log(`Terms         ${terms.length} (${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`Output        ${path.relative(repoRoot, outPath)}`);

  if (values["dry-run"]) {
    console.log("\nDry run: no model calls made.");
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const existing = values.merge && existsSync(outPath) ? JSON.parse(await readFile(outPath, "utf8")) : { terms: {} };
  const pending = terms.filter((entry) => !existing.terms?.[entry.term]);
  console.log(`Pending       ${pending.length} terms in ${chunk(pending, 40).length} batches`);

  const results = new Map(Object.entries(existing.terms ?? {}).map(([term, record]) => [term, record]));
  const rejected = [];

  const batches = chunk(pending, 40);
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(16, batches.length) }, async () => {
      while (batches.length > 0) {
        const batch = batches.shift();
        if (!batch) break;
        const translated = await translateBatch({ entries: batch, locale, apiKey });
        for (const { entry, target } of translated) {
          const evaluation =
            typeof target === "string" ? validateSegment({ source: entry.term, target, locale }) : { defects: ["EMPTY_OUTPUT"] };
          if (typeof target !== "string" || isBlocking(evaluation.defects)) {
            rejected.push({ term: entry.term, target, defects: evaluation.defects });
            continue;
          }
          results.set(entry.term, { target: target.trim(), kind: entry.kind });
        }
        done += batch.length;
        process.stdout.write(`  ${done}/${pending.length} terms\n`);
      }
    }),
  );

  // Two English terms sharing one Chinese term is the collision the audit
  // exists to catch. Reporting it and stopping would hand a reviewer a puzzle
  // the model can answer, so a clash goes back to the model with both terms in
  // front of it and a demand for the distinction the English draws. What
  // survives a second pass is a genuine homonym, and that is a reviewer's call.
  // The raw register, not the resolved locale: `resolveLocale` folds this very
  // file back in, and comparing the file against itself is a collision per term.
  const seedGlossary = LOCALES[locale.code]?.glossary ?? {};
  const collisionsIn = (renderings) => {
    const byTarget = new Map();
    for (const [term, target] of renderings) {
      if (!byTarget.has(target)) byTarget.set(target, []);
      byTarget.get(target).push(term);
    }
    return [...byTarget.entries()].filter(([, sources]) => sources.length > 1);
  };

  const allRenderings = () => [
    ...Object.entries(seedGlossary).map(([term, target]) => [term, target]),
    ...[...results].map(([term, record]) => [term, record.target]),
  ];

  let collisions = collisionsIn(allRenderings());
  if (collisions.length > 0) {
    console.log(`Resolving     ${collisions.length} collisions`);
    const resolved = await resolveCollisions({ collisions, locale, apiKey, results, seedGlossary });
    for (const [term, target] of resolved) {
      const record = results.get(term);
      if (record) results.set(term, { ...record, target, resolvedFromCollision: true });
    }
    collisions = collisionsIn(allRenderings());
  }

  const document = {
    locale: locale.code,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    note: "Each rendering was produced by translating the term alone. Edit a value here to overrule the model; the runner and the validator both read this file.",
    counts: {
      terms: results.size,
      rejected: rejected.length,
      collisions: collisions.length,
    },
    collisions: collisions.map(([target, sources]) => ({ target, sources })),
    rejected,
    terms: Object.fromEntries([...results.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`);

  console.log(`\nFrozen        ${results.size} terms`);
  console.log(`  rejected    ${rejected.length}`);
  console.log(`  collisions  ${collisions.length}`);
  for (const [target, sources] of collisions.slice(0, 10)) {
    console.error(`  collision: ${sources.join(" / ")} -> ${target}`);
  }
  if (collisions.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});

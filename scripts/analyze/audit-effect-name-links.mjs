#!/usr/bin/env node
/**
 * Joins every subjective-effect chip name on every substance article against the
 * live effect inventory, and reports the ones that resolve to nothing.
 *
 * This is the check that was missing: nothing in the repo compared article effect
 * names with the effect table, so `/effects/[effectSlug]` (which sets
 * `dynamicParams = false`) answered 404 for 27% of chips without ever failing a
 * build. Terminology drift was therefore invisible.
 *
 * Read-only. Never writes to Postgres.
 *
 * Usage:
 *   node --env-file=.env.local scripts/analyze/audit-effect-name-links.mjs
 *   node --env-file=.env.local scripts/analyze/audit-effect-name-links.mjs --json out.json
 *   node --env-file=.env.local scripts/analyze/audit-effect-name-links.mjs --strict
 *
 * `--strict` exits non-zero when any chip resolves to nothing, so CI can hold the
 * line once the backlog is at zero.
 */

import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { writeFileSync } from "node:fs";
import { api } from "../../lib/postgres/runtime/api.ts";
import { effectNameAliasTables } from "../../src/data/effectNameAliases.ts";
import { EFFECT_CATEGORY_DEFINITIONS } from "../../src/data/effectCategoryDefinitions.ts";

const SENSES = ["visual", "auditory", "tactile", "olfactory", "gustatory", "multisensory"];

const slugify = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
    jsonPath: argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null,
  };
}

/** Mirrors `resolveEffectNameAlias`, then the renderer's own slug derivation. */
function resolve(nameSlug, location, effectSlugs, categorySlugs) {
  const { global: globals, locationScoped, unlinked } = effectNameAliasTables;

  if (unlinked.has(nameSlug)) {
    return { kind: "unlinked" };
  }

  const target = locationScoped[location]?.[nameSlug] ?? globals[nameSlug];

  if (target) {
    if (target.startsWith("category:")) {
      const slug = target.slice("category:".length);
      return categorySlugs.has(slug)
        ? { kind: "alias-category", href: `/effects/category/${slug}` }
        : { kind: "broken", href: `/effects/category/${slug}`, why: "unknown category" };
    }
    return effectSlugs.has(target)
      ? { kind: "alias", href: `/effects/${target}` }
      : { kind: "broken", href: `/effects/${target}`, why: "alias target missing" };
  }

  if (Object.values(locationScoped).some((map) => nameSlug in map)) {
    return { kind: "unlinked" };
  }

  return effectSlugs.has(nameSlug)
    ? { kind: "direct", href: `/effects/${nameSlug}` }
    : { kind: "broken", href: `/effects/${nameSlug}`, why: "no such effect" };
}

async function main() {
  const { strict, jsonPath } = parseArgs(process.argv.slice(2));
  const url =
    process.env.SOURCE_POSTGRES_URL ||
    process.env.POSTGRES_POOLED_URL ||
    process.env.POSTGRES_DIRECT_URL;

  if (!url) {
    console.error("❌ Set SOURCE_POSTGRES_URL or POSTGRES_POOLED_URL (read-only).");
    process.exit(1);
  }

  const client = createDataClient({ target: url }).client;
  const [effects, substances] = await Promise.all([
    client.query(api.subjectiveEffects.getAll, {}),
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
  ]);

  const effectSlugs = new Set(effects.map((effect) => effect.slug));
  const categorySlugs = new Set(EFFECT_CATEGORY_DEFINITIONS.map((entry) => entry.slug));

  const tally = new Map();
  let occurrences = 0;

  const visit = (article, location, category) => {
    for (const [subcategory, data] of Object.entries(category ?? {})) {
      for (const entry of data?.effects ?? []) {
        const nameSlug = slugify(entry?.name);
        if (!nameSlug) continue;

        occurrences += 1;
        const result = resolve(nameSlug, location, effectSlugs, categorySlugs);
        const key = `${result.kind}|${nameSlug}|${location}`;
        const row = tally.get(key) ?? {
          ...result,
          nameSlug,
          location,
          displayName: entry.name,
          subcategories: new Set(),
          articles: [],
          count: 0,
        };
        row.count += 1;
        row.subcategories.add(subcategory);
        if (row.articles.length < 12) row.articles.push(article.slug);
        tally.set(key, row);
      }
    }
  };

  for (const article of substances) {
    const se = article.subjective_effects;
    if (!se) continue;
    visit(article, "cognitive", se.cognitive);
    visit(article, "physical", se.physical);
    for (const sense of SENSES) visit(article, `sensory.${sense}`, se.sensory?.[sense]?.subcategories);
  }

  const rows = [...tally.values()].map((row) => ({
    ...row,
    subcategories: [...row.subcategories],
  }));
  const by = (kind) => rows.filter((row) => row.kind === kind);
  const sum = (list) => list.reduce((total, row) => total + row.count, 0);
  const broken = by("broken").sort((a, b) => b.count - a.count);

  console.log(`Deployment: ${postgresFingerprintFromUrl(url)}`);
  console.log(`Articles: ${substances.length}   Effects: ${effectSlugs.size}`);
  console.log(`Chip occurrences: ${occurrences}\n`);
  for (const kind of ["direct", "alias", "alias-category", "unlinked", "broken"]) {
    const list = by(kind);
    console.log(`  ${kind.padEnd(15)} ${String(list.length).padStart(4)} names  ${String(sum(list)).padStart(5)} occurrences`);
  }

  if (broken.length) {
    console.log(`\n❌ ${broken.length} names / ${sum(broken)} occurrences resolve to nothing:\n`);
    for (const row of broken) {
      console.log(
        `  ${String(row.count).padStart(4)}  ${row.nameSlug.padEnd(46)} [${row.location}] ${row.why}  e.g. ${row.articles.slice(0, 5).join(", ")}`,
      );
    }
    console.log("\nEach needs an entry in src/data/effectNameAliases.ts — either a target or the unlinked set.");
  } else {
    console.log("\n✅ Every effect chip resolves to a real page or is deliberately unlinked.");
  }

  // Reverse direction: the effect page's Related Substances list is built by
  // joining article effect names back to effect slugs, so it has to agree with
  // the outbound link or a page under-lists the substances that cause it.
  const reverse = new Map();
  for (const row of rows) {
    if (row.kind === "unlinked" || row.kind === "alias-category" || row.kind === "broken") continue;
    const slug = row.href.slice("/effects/".length);
    for (const article of row.articles) (reverse.get(slug) ?? reverse.set(slug, new Set()).get(slug)).add(article);
  }
  const listed = [...reverse.keys()].filter((slug) => effectSlugs.has(slug));
  console.log(`\nReverse join: ${listed.length} of ${effectSlugs.size} effect pages have at least one related substance.`);

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify({ deployment: url, occurrences, rows }, null, 2));
    console.log(`\nWrote ${jsonPath}`);
  }

  if (strict && broken.length) process.exit(1);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});

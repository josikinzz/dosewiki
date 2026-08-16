#!/usr/bin/env node
/**
 * Restrict the deliriant-only replications to deliriant articles.
 *
 * A handful of corpus rows depict a *deliriant* experience specifically — the
 * external-hallucination works, and Stas Constantine's DPH renditions — yet the
 * per-substance Replication Showcase is derived from effect names alone, so
 * every article whose visual effects include "external hallucination",
 * "internal hallucination", "environmental cubism" or "autonomous entity" shows
 * them. On an LSD or psilocybin article that is a false claim about the
 * substance, so each pairing is suppressed on the substance's side.
 *
 * This is a one-off bulk editorial write, not a standing rule. It writes into
 * the same `substanceGalleries.removed_slugs` field the Replication Studio's
 * association panel edits, so every exclusion it makes stays visible there and
 * an editor can undo any single one. It does not cover future uploads; re-run it
 * after adding another deliriant-only work.
 *
 * Dry run by default. Nothing is written without `--write` plus the standard
 * write confirmations.
 *
 * Usage:
 *   node scripts/replications/restrict-deliriant-only-replications.mjs
 *   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
 *     node scripts/replications/restrict-deliriant-only-replications.mjs --write \
 *       --confirm-write=restrict-deliriant-only-replications \
 *       --expected-deployment=glad-minnow-656
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { getAllSubstanceDocuments } from "../lib/convex-pagination.mjs";
import { isPublishableReplication } from "../../src/types/replications.ts";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

/**
 * `src/data/substanceReplicationGallery.ts` is written for the Convex bundler
 * and Vite, both of which resolve its extensionless relative imports; Node's
 * ESM resolver does not. Appending `.ts` to a relative specifier that has no
 * recognised extension is exactly the resolution those bundlers apply, and it
 * is the only way to run the *shared* matcher here rather than a second copy of
 * it that could drift from what the article renders. The hook is inert under
 * Vitest (Vite resolves the graph itself) and inert for every specifier Node
 * can already resolve.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Not a TypeScript module; fall through to the real resolver's error.
      }
    }
    return nextResolve(specifier, context);
  },
});

const { visualEffectNamesOf, resolveVisualEffectSlugs } = await import(
  "../../src/data/substanceReplicationGallery.ts"
);

const OPERATION = "restrict-deliriant-only-replications";

/** `setReplicationExclusions` rejects a larger submitted set (see the mutation). */
const MAX_EXCLUSIONS_PER_SAVE = 250;

/** Public `getBySubstance` reads that may be in flight at once. */
const GALLERY_READ_CONCURRENCY = 12;

/**
 * The substances that keep the deliriant-only replications.
 *
 * An explicit slug list, never a `psychoactive_class` match, for two reasons the
 * corpus makes concrete. 230 of 577 substances leave `psychoactive_class` blank,
 * so a class match would silently strip a blank-class deliriant of the very
 * works that depict it — the failure would look like correct filtering. And
 * free-text class strings do not separate deliriants from anything else: datura
 * and scopolamine are tropane alkaloids, and so is cocaine, whose
 * `"Alkaloid (tropane)"` is the collision `convex/schema.ts` already documents
 * as the reason the warning-banner system opts in per slug rather than by class.
 *
 * Six slugs, chosen by pharmacology rather than by string: the antimuscarinics
 * (datura, scopolamine, the antihistamine deliriants dimenhydrinate and
 * diphenhydramine, nutmeg's anticholinergic delirium) plus benzydamine.
 */
export const DELIRIANT_SUBSTANCE_SLUGS = Object.freeze([
  "benzydamine",
  "datura",
  "dimenhydrinate",
  "diphenhydramine",
  "nutmeg",
  "scopolamine",
]);

/** The effect that only a deliriant produces in the sense the corpus depicts. */
export const DELIRIANT_EFFECT_SLUG = "external-hallucination";

/** The artist whose whole body of work here is DPH renditions. */
export const DELIRIANT_ARTIST_KEY = "stasconstantine";

/**
 * An artist credit reduced to its identity: lowercased, every non-alphanumeric
 * character dropped. The corpus stores this one artist under two spellings
 * (`"StasConstantine"` and `"Stas Constantine"`), and a credit is the same
 * person either way.
 */
export function artistIdentityKey(artist) {
  return typeof artist === "string" ? artist.toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
}

/**
 * The corpus rows this operation restricts: the external-hallucination works
 * (by owning `effect_slug` or by tag, the same two ways the showcase matches)
 * and everything credited to Stas Constantine under either spelling.
 *
 * Only publishable rows can be targets. A figure or an audio row never reaches
 * a showcase at all, so excluding it would write a suppression for something
 * that was never shown — `setReplicationExclusions` refuses those anyway.
 */
export function selectTargetReplications(rows) {
  return (rows ?? []).filter((row) => {
    if (!row || typeof row.slug !== "string" || !row.slug) return false;
    if (!isPublishableReplication(row)) return false;
    if (row.effect_slug === DELIRIANT_EFFECT_SLUG) return true;
    if (Array.isArray(row.effect_tags) && row.effect_tags.includes(DELIRIANT_EFFECT_SLUG)) {
      return true;
    }
    return artistIdentityKey(row.artist) === DELIRIANT_ARTIST_KEY;
  });
}

/**
 * Which substances each target replication should be suppressed on.
 *
 * Per target: every substance whose resolved visual-effect slugs match the row
 * — its owning `effect_slug`, or any of its `effect_tags`, which is the rule
 * `matchSubstanceGalleryReplications` applies — minus the deliriants, unioned
 * with every substance already listing the row in `removed_slugs`.
 *
 * The union is the point. `setReplicationExclusions` replaces the full set, so a
 * submitted set that omits an existing exclusion *clears* it:
 * `deliriant-replication-compilation-various-artists` is already excluded from
 * `lsd`, and a deliriant article could carry an editor's exclusion too. Omitting
 * either would silently undo an editorial decision. Carrying them forward also
 * makes a second run a no-op, which is what "already excluded" reports.
 *
 * Pure. `substances` are `{ slug, subjective_effects }` articles;
 * `existingBySubstance` is a `Map` from substance slug to that substance's
 * stored `{ curated_slugs, removed_slugs }`.
 */
export function planExclusions({ targets, substances, existingBySubstance }) {
  const deliriants = new Set(DELIRIANT_SUBSTANCE_SLUGS);
  const existing = existingBySubstance ?? new Map();

  // Each substance's derived effect-slug set, resolved once: the article's own
  // visual-effect names through the same alias resolution its chips use.
  const derived = (substances ?? [])
    .filter((substance) => typeof substance?.slug === "string" && substance.slug)
    .map((substance) => ({
      slug: substance.slug,
      effectSlugs: new Set(
        resolveVisualEffectSlugs(visualEffectNamesOf(substance.subjective_effects)).slugs,
      ),
    }));

  const plans = (targets ?? []).map((target) => {
    const tags = Array.isArray(target.effect_tags) ? target.effect_tags : [];

    const matched = derived
      .filter(
        ({ effectSlugs }) =>
          (target.effect_slug ? effectSlugs.has(target.effect_slug) : false) ||
          tags.some((tag) => effectSlugs.has(tag)),
      )
      .map(({ slug }) => slug);

    const deliriantMatches = matched.filter((slug) => deliriants.has(slug));
    const eligible = matched.filter((slug) => !deliriants.has(slug));

    // Every substance already suppressing this row, matched or not, deliriant or
    // not: these are stored editorial decisions and the submitted set is the
    // whole truth, so they are carried forward verbatim.
    const alreadyExcluded = [...existing.entries()]
      .filter(([, row]) => (row?.removed_slugs ?? []).includes(target.slug))
      .map(([slug]) => slug);

    const already = new Set(alreadyExcluded);
    const excludedSubstanceSlugs = [...new Set([...eligible, ...alreadyExcluded])].sort();
    const newlyExcluded = excludedSubstanceSlugs.filter((slug) => !already.has(slug));

    // What `droppedCuratedPositions` will report, derived from the same stored
    // rows: a substance newly suppressing a row it had pinned loses the pin,
    // because the two lists may never overlap.
    const droppedCuratedPositions = newlyExcluded
      .map((slug) => {
        const position = (existing.get(slug)?.curated_slugs ?? []).indexOf(target.slug) + 1;
        return position > 0 ? { substance_slug: slug, position } : null;
      })
      .filter((entry) => entry !== null);

    return {
      slug: target.slug,
      artist: typeof target.artist === "string" ? target.artist : "",
      effectSlug: target.effect_slug ?? "",
      matchedSubstanceSlugs: matched,
      deliriantSubstanceSlugs: deliriantMatches,
      excludedSubstanceSlugs,
      newlyExcluded,
      alreadyExcluded: excludedSubstanceSlugs.filter((slug) => already.has(slug)),
      droppedCuratedPositions,
    };
  });

  return plans;
}

/**
 * Every substance the mutation can address, keyed the way it keys them.
 *
 * `uniqueSubstanceBySlug` treats a duplicated slug as not found rather than
 * letting two articles fight over one gallery, so a duplicate is unwritable and
 * counting it would overstate the plan.
 */
function addressableSubstances(articles) {
  const counts = new Map();
  for (const article of articles) {
    const slug = typeof article?.slug === "string" ? article.slug : "";
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const duplicated = [...counts.entries()].filter(([, count]) => count > 1).map(([slug]) => slug);
  const unslugged = articles.filter((article) => !article?.slug).length;
  const substances = articles.filter(
    (article) => article?.slug && counts.get(article.slug) === 1,
  );
  return { substances, duplicated, unslugged };
}

/**
 * The stored curation delta for every substance.
 *
 * There is no bulk read of `substanceGalleries` and no index from a suppressed
 * slug back to its substances, so the public per-substance read is fanned out
 * over the corpus. Public and read-only, so a dry run needs no credential.
 */
async function readGalleryDeltas(client, substanceSlugs) {
  const deltas = new Map();
  let next = 0;

  async function worker() {
    while (next < substanceSlugs.length) {
      const slug = substanceSlugs[next];
      next += 1;
      const row = await client.query(api.substanceGalleries.getBySubstance, {
        substance_slug: slug,
      });
      if (!row) continue;
      deltas.set(slug, {
        curated_slugs: row.curated_slugs ?? [],
        removed_slugs: row.removed_slugs ?? [],
      });
    }
  }

  const workers = Math.min(GALLERY_READ_CONCURRENCY, substanceSlugs.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return deltas;
}

function padded(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function padStart(value, width) {
  const text = String(value);
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

function printPlan(plans) {
  const columns = [
    ["replication", 52],
    ["artist", 20],
    ["effect", 24],
    ["excluded", 9],
    ["new", 5],
    ["already", 8],
    ["deliriants kept", 15],
  ];
  const header = columns
    .map(([label, width], index) => (index < 3 ? padded(label, width) : padStart(label, width)))
    .join(" ");
  console.log(`\n${header}`);
  console.log("-".repeat(header.length));

  for (const plan of plans) {
    console.log(
      [
        padded(plan.slug, 52),
        padded(plan.artist, 20),
        padded(plan.effectSlug, 24),
        padStart(plan.excludedSubstanceSlugs.length, 9),
        padStart(plan.newlyExcluded.length, 5),
        padStart(plan.alreadyExcluded.length, 8),
        padStart(plan.deliriantSubstanceSlugs.length, 15),
      ].join(" "),
    );
  }
}

async function restrictDeliriantOnlyReplications() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const readUrl =
    command.targetUrl ??
    process.env.CONVEX_URL ??
    process.env.VITE_CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!readUrl) {
    throw new Error(
      "No Convex URL to read from. Set TARGET_CONVEX_URL (or VITE_CONVEX_URL for a dry run).",
    );
  }

  const client = new ConvexHttpClient(readUrl);

  const [articles, replications] = await Promise.all([
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    client.query(api.replications.getAll, {}),
  ]);

  const { substances, duplicated, unslugged } = addressableSubstances(articles);
  const existingBySubstance = await readGalleryDeltas(
    client,
    substances.map((substance) => substance.slug),
  );

  const targets = selectTargetReplications(replications);
  if (targets.length === 0) {
    throw new Error(
      "No deliriant-only replications matched; the corpus read or the target rule is wrong.",
    );
  }

  const plans = planExclusions({ targets, substances, existingBySubstance });

  console.log(`\nReading from: ${readUrl}`);
  console.log(`Substances: ${substances.length} addressable of ${articles.length}`);
  if (duplicated.length > 0) {
    console.log(`  Duplicated slugs, unwritable and excluded: ${duplicated.join(", ")}`);
  }
  if (unslugged > 0) {
    console.log(`  Articles with no stored slug, excluded: ${unslugged}`);
  }
  console.log(`Replications: ${replications.length} (${targets.length} deliriant-only)`);
  console.log(`Stored curation rows: ${existingBySubstance.size}`);
  console.log(`Deliriants that keep these works: ${DELIRIANT_SUBSTANCE_SLUGS.join(", ")}`);

  printPlan(plans);

  const totalPairs = plans.reduce((sum, plan) => sum + plan.excludedSubstanceSlugs.length, 0);
  const totalNew = plans.reduce((sum, plan) => sum + plan.newlyExcluded.length, 0);
  const totalAlready = plans.reduce((sum, plan) => sum + plan.alreadyExcluded.length, 0);
  console.log(
    `\nTotals: ${plans.length} replications, ${totalPairs} (replication, substance) exclusions — ${totalNew} new, ${totalAlready} already stored.`,
  );

  const predictedDrops = plans.flatMap((plan) =>
    plan.droppedCuratedPositions.map((drop) => ({ replication: plan.slug, ...drop })),
  );
  if (predictedDrops.length === 0) {
    console.log("Curated positions this would drop: none.");
  } else {
    console.log(`Curated positions this would drop: ${predictedDrops.length}`);
    for (const drop of predictedDrops) {
      console.log(`  ${drop.replication} was pinned #${drop.position} on ${drop.substance_slug}`);
    }
  }

  const oversized = plans.filter(
    (plan) => plan.excludedSubstanceSlugs.length > MAX_EXCLUSIONS_PER_SAVE,
  );
  if (oversized.length > 0) {
    throw new Error(
      `These replications exceed the ${MAX_EXCLUSIONS_PER_SAVE}-substance per-save maximum and would be rejected: ${oversized
        .map((plan) => `${plan.slug} (${plan.excludedSubstanceSlugs.length})`)
        .join(", ")}`,
    );
  }

  if (totalNew === 0) {
    console.log("\nNothing new to exclude; the restriction is already in place.");
  }

  if (command.dryRun) {
    console.log(
      `\nDry run; ${plans.length} mutation call(s) would submit ${totalPairs} exclusion(s).`,
    );
    return;
  }

  assertProductionWriteAllowed(command);
  const credential = requireProductionWriteCredential("editorArticleWrite");

  console.log("");
  let updatedTotal = 0;
  const droppedCuratedPositions = [];
  for (const plan of plans) {
    const result = await client.mutation(api.substanceGalleries.setReplicationExclusions, {
      apiKey: credential.token,
      replicationSlug: plan.slug,
      excludedSubstanceSlugs: plan.excludedSubstanceSlugs,
      updatedBy: `${OPERATION}@dosewiki.internal`,
    });
    updatedTotal += result.updated.length;
    for (const drop of result.droppedCuratedPositions) {
      droppedCuratedPositions.push({ replication: plan.slug, ...drop });
    }
    console.log(
      `  ${plan.slug}: submitted ${plan.excludedSubstanceSlugs.length}, changed ${result.updated.length}`,
    );
  }

  console.log("\nRestriction complete.");
  console.log(`  Substance rows changed: ${updatedTotal}`);
  if (droppedCuratedPositions.length === 0) {
    console.log("  Curated positions dropped: none");
  } else {
    console.log(`  Curated positions dropped: ${droppedCuratedPositions.length}`);
    for (const drop of droppedCuratedPositions) {
      console.log(
        `    ${drop.replication} lost pin #${drop.position} on ${drop.substance_slug} — re-pin it there if it belonged`,
      );
    }
  }
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  restrictDeliriantOnlyReplications().catch((error) => {
    console.error(`\nFailed to restrict the deliriant-only replications: ${error.message}`);
    process.exit(1);
  });
}

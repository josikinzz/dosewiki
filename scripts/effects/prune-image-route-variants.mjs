#!/usr/bin/env node
/**
 * Drop the redundant and mis-packed variants from `imageRoutes`.
 *
 * Two article embeds carry per-drug-class image variants packed as
 * `class:url:title:artist:caption,...`. Nothing read the attribute until the
 * renderer started selecting a variant by drug class, which exposed two
 * problems in the stored payload:
 *
 *  1. The `psychedelic` variant duplicates the embed's own attributes, so it
 *     is dead weight on the surface that already renders them.
 *  2. `autonomous-entity`'s `psychedelic` variant is mis-packed: its title and
 *     artist fields hold "Parabollic vehicle of conception" and
 *     "Namaste (Trifoliata Mystica)" — two artwork titles, no artist. Selecting
 *     it would print an artwork title as the byline.
 *
 * The `deliriant` variants are correct and are the reason the attribute exists
 * at all (HatMan by Sverrirorz; Deliriant CEV's by Stas Constantine, both
 * verified to serve). Keeping only those makes the surviving payload exactly
 * the data the renderer consumes.
 *
 *   node scripts/effects/prune-image-route-variants.mjs --target=<url>
 *   node scripts/effects/prune-image-route-variants.mjs --target=<url> \
 *     --write --confirm-write=prune-image-route-variants \
 *     --expected-deployment=<host>/<database>
 */
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const operation = "prune-image-route-variants";
const command = createProductionWriteCommand({ operation });
if (!command.targetUrl) throw new Error("Pass an explicit --target for dry runs and writes.");
printProductionWriteCommand(command);

const KEPT_VARIANTS = ["deliriant"];
const fields = ["long_summary_raw", "long_summary_ast"];

/** The pruned attribute value, or null when nothing changes. */
function prune(value) {
  const kept = value
    .split(",")
    .filter((entry) => KEPT_VARIANTS.includes(entry.trim().split(":")[0].toLowerCase()));
  const next = kept.join(",");
  return next && next !== value ? next : null;
}

/**
 * The caption and title these two embeds never carried as attributes: the
 * text lived only inside the `psychedelic` variant this script drops, so it
 * moves onto the embed itself, where every non-deliriant surface reads it.
 * Titles come from the corpus rows the embeds now point at, not from the
 * mis-packed variant fields.
 */
const DEFAULT_CAPTIONS = {
  "autonomous-entity": {
    title: "Namaste (Trifoliata Mystica)",
    caption: "This replication serves as an image example of a psychedelic autonomous entity.",
  },
  "internal-hallucination": {
    title: "Parabolic vehicle of conception",
    caption:
      "This image serves as an example of visionary art that attempts to accurately portray and replicate the experience of psychedelic level 5 geometry combined with level 3 internal hallucinations.",
  },
};

let hits = 0;
function pruneTree(value, counter, slug) {
  if (typeof value === "string") {
    return value.replace(
      /(\[captioned-image\b[^\]]*?\bimageRoutes=")([^"]*)(")/g,
      (match, head, routes, tail) => {
        const next = prune(routes);
        if (!next) return match;
        counter.hits += 1;
        return `${head}${next}${tail}`;
      },
    );
  }
  if (Array.isArray(value)) return value.map((item) => pruneTree(item, counter, slug));
  if (!value || typeof value !== "object") return value;

  const next = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, pruneTree(item, counter, slug)]),
  );
  if (typeof value.properties?.imageRoutes === "string") {
    const pruned = prune(value.properties.imageRoutes);
    const hoisted = DEFAULT_CAPTIONS[slug];
    const needsCaption = hoisted && !value.properties.caption;
    if (pruned || needsCaption) {
      counter.hits += 1;
      next.properties = {
        ...next.properties,
        ...(pruned ? { imageRoutes: pruned } : {}),
        ...(needsCaption ? hoisted : {}),
      };
    }
  }
  return next;
}

const client = createDataClient({ target: command.targetUrl }).client;
const effects = await client.query(api.subjectiveEffects.getAll, {});

const plans = [];
for (const effect of effects) {
  const changes = [];
  for (const field of fields) {
    const current = effect[field];
    if (current === undefined || current === null) continue;
    if (!JSON.stringify(current).includes("imageRoutes")) continue;
    const counter = { hits: 0 };
    const value = pruneTree(current, counter, effect.slug);
    if (counter.hits === 0) continue;
    hits += counter.hits;
    changes.push({ field, expected: current, value });
  }
  if (changes.length > 0) plans.push({ slug: effect.slug, changes });
}

console.log(`Embeds pruned: ${hits} across ${plans.length} articles`);
for (const plan of plans) {
  console.log(`  ${plan.slug} (${plan.changes.map(({ field }) => field).join(", ")})`);
  for (const change of plan.changes) {
    const routes = JSON.stringify(change.value).match(/imageRoutes[^,]*/)?.[0];
    console.log(`    kept: ${routes?.slice(0, 160)}`);
  }
}

if (command.dryRun) {
  console.log("\nDry run complete. Re-run with the write and confirmation flags to apply.");
  process.exit(0);
}

assertProductionWriteAllowed(command);
const credential = requireProductionWriteCredential("replicationMaintenance");

for (const plan of plans) {
  await client.mutation(api.subjectiveEffects.repairLegacyMedia, {
    apiKey: credential.token,
    slug: plan.slug,
    changes: plan.changes,
    clearSocialMediaImage: false,
  });
  console.log(`PRUNED ${plan.slug} (${plan.changes.map(({ field }) => field).join(", ")})`);
}

// Post-write verification: only kept variants survive, and each one's media
// still serves.
let failures = 0;
for (const plan of plans) {
  const effect = await client.query(api.subjectiveEffects.getBySlug, { slug: plan.slug });
  const serialized = JSON.stringify(plan.changes.map(({ field }) => effect?.[field] ?? null));
  const routes = [...serialized.matchAll(/imageRoutes\\?":\\?"([^"\\]*)/g)].map(([, value]) => value);
  const remaining = [...serialized.matchAll(/([a-z][a-z0-9-]*):https?:/g)].map(([, key]) => key);
  const unexpected = remaining.filter((key) => !KEPT_VARIANTS.includes(key));
  const urls = [...serialized.matchAll(/(https?:\/\/[^\s:"\\]+)(?=:[^/])/g)].map(([, url]) => url);
  let served = true;
  for (const url of urls) {
    const response = await fetch(url, { headers: { range: "bytes=0-1023" } });
    if (!response.ok) served = false;
  }
  if (unexpected.length > 0 || routes.length === 0 || !served) {
    failures += 1;
    console.error(
      `VERIFY FAILED ${plan.slug}: unexpectedVariants=${unexpected.join(",") || "none"} ` +
      `routesPresent=${routes.length} mediaServes=${served}`,
    );
  } else {
    console.log(`VERIFIED ${plan.slug}: kept ${remaining.join(", ")}; ${urls.length} media URL(s) serve`);
  }
}
if (failures > 0) throw new Error(`${failures} post-write verification(s) failed.`);

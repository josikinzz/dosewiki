#!/usr/bin/env node
/**
 * Repoint the Effect Index article embeds at the recovered R2 objects.
 *
 * `publish-recovered-article-media.mjs` puts the bytes in the media bucket and
 * writes `recovery/batch3/published.json`. This script is the second half: it
 * rewrites the dead `pub-879bfd45...r2.dev` image URLs and the missing
 * `/audio/...` sources inside `effectIndexArticles` bodies to those objects.
 *
 * Why this is a separate command from the existing repair script: the media
 * repair of 2026-07-28 (`repair-legacy-article-media.mjs`) only ever walked
 * `subjectiveEffects` media fields, so it never touched
 * `effectIndexArticles.body_raw` and `body_ast`, which is exactly where these
 * eight references live. Rather than widen a script whose recovery-manifest
 * contract is about a different table, this one does the narrow job with an
 * explicit, auditable mapping.
 *
 * Nothing is stripped. An asset with no recovered object keeps its dead
 * reference, which is the owner's standing instruction: a placeholder stays
 * until the bytes are found.
 *
 * Both fields move together. `body_ast` is what the page renders when present
 * (`EffectIndexArticlePage`: `article.body_ast ?? article.body_raw`), so
 * rewriting only the raw markup would change nothing a reader sees.
 *
 *   node scripts/effects/repoint-recovered-article-embeds.mjs --target-url=<url>
 *   node scripts/effects/repoint-recovered-article-embeds.mjs --target-url=<url> --apply ...
 */
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const operation = "repoint-recovered-article-embeds";
const command = createProductionWriteCommand({ operation });
if (!command.targetUrl) throw new Error("Pass an explicit --target-url for dry runs and writes.");
printProductionWriteCommand(command);

const published = JSON.parse(readFileSync("recovery/batch3/published.json", "utf8"));
const urlByAsset = new Map(published.objects.map((object) => [object.asset, object.url]));

/**
 * The reference each recovered asset replaces, exactly as it appears in the
 * stored body. Taken from the audit, not inferred: the article filenames and
 * the wiki filenames disagree (A084's asset is `Cg0ww.jpg` on the wiki), so a
 * name-matching rule would mis-map them.
 */
const REPOINTS = [
  { asset: "A084", slug: "lucid-dreaming", from: "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/are%20you%20dreaming.jpg" },
  { asset: "A085", slug: "lucid-dreaming", from: "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/Are_you_dreaming.gif" },
  { asset: "A086", slug: "meditation", from: "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/Meditation-poses.jpg" },
  { asset: "A087", slug: "meditation", from: "/audio/sam harris 9 minutes.ogg" },
  { asset: "A088", slug: "meditation", from: "/audio/sam harris 26 minutes.ogg" },
  { asset: "A089", slug: "meditation", from: "/audio/alan watts guided meditation.ogg" },
];

/**
 * The stored strings are not always the literal URL: the migration wrote some
 * of them percent-encoded and some decoded. Both spellings are replaced so a
 * body cannot keep a dead copy the pattern happened to miss.
 */
function spellings(reference) {
  const variants = new Set([reference]);
  try {
    variants.add(decodeURIComponent(reference));
  } catch {
    // A reference that is not valid percent-encoding is already literal.
  }
  variants.add(encodeURI(reference));
  return [...variants];
}

function replaceEverywhere(value, from, to) {
  if (typeof value === "string") {
    let next = value;
    for (const spelling of spellings(from)) next = next.split(spelling).join(to);
    return next;
  }
  if (Array.isArray(value)) return value.map((item) => replaceEverywhere(item, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceEverywhere(item, from, to)]),
    );
  }
  return value;
}

function countOccurrences(value, from) {
  const serialized = JSON.stringify(value ?? null);
  return spellings(from).reduce((total, spelling) => total + (serialized.split(JSON.stringify(spelling).slice(1, -1)).length - 1), 0);
}

const client = new ConvexHttpClient(command.targetUrl);
const articles = await client.query(api.effectIndexArticles.getAll, {});
const bySlug = new Map(articles.map((article) => [article.slug, article]));

const plans = [];
for (const slug of new Set(REPOINTS.map((repoint) => repoint.slug))) {
  const article = bySlug.get(slug);
  if (!article) throw new Error(`No article row for ${slug}`);

  let body_raw = article.body_raw;
  let body_ast = article.body_ast;
  const applied = [];
  const skipped = [];

  for (const repoint of REPOINTS.filter((item) => item.slug === slug)) {
    const url = urlByAsset.get(repoint.asset);
    const found = countOccurrences(article.body_raw, repoint.from) + countOccurrences(article.body_ast, repoint.from);

    if (!url) {
      skipped.push({ ...repoint, reason: "no recovered object; placeholder kept", found });
      continue;
    }
    if (found === 0) {
      skipped.push({ ...repoint, reason: "reference not present in the stored body", found });
      continue;
    }

    body_raw = replaceEverywhere(body_raw, repoint.from, url);
    body_ast = replaceEverywhere(body_ast, repoint.from, url);
    applied.push({ ...repoint, url, found });
  }

  const changed = body_raw !== article.body_raw || JSON.stringify(body_ast) !== JSON.stringify(article.body_ast);
  plans.push({ slug, article, body_raw, body_ast, applied, skipped, changed });
}

for (const plan of plans) {
  console.log(`\n${plan.slug}${plan.changed ? "" : " (no change)"}`);
  for (const item of plan.applied) console.log(`  ${item.asset} x${item.found}  ${item.from}\n         -> ${item.url}`);
  for (const item of plan.skipped) console.log(`  ${item.asset} SKIPPED: ${item.reason}`);
}

const remaining = plans.flatMap((plan) => plan.skipped);
console.log(`\nRows to write: ${plans.filter((plan) => plan.changed).length}`);
console.log(`References repointed: ${plans.reduce((total, plan) => total + plan.applied.length, 0)}`);
console.log(`Placeholders left in place: ${remaining.length}`);

if (command.dryRun) {
  console.log("\nDry run complete. Re-run with --apply and the confirmation flags to write.");
  process.exit(0);
}

assertProductionWriteAllowed(command);
const credential = requireProductionWriteCredential("replicationMaintenance");

for (const plan of plans) {
  if (!plan.changed) continue;
  await client.mutation(api.effectIndexArticles.upsertArticle, {
    apiKey: credential.token,
    slug: plan.slug,
    body_raw: plan.body_raw,
    ...(plan.body_ast === undefined ? {} : { body_ast: plan.body_ast }),
  });
  console.log(`REPOINTED ${plan.slug} (${plan.applied.length} references)`);
}

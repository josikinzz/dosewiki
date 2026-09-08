#!/usr/bin/env node
/**
 * Give the srcless article image embeds real media again.
 *
 * Effect Index wrote 15 `[captioned-image /]` embeds whose only locator was a
 * `gfycat="<id>"` attribute. Gfycat is gone, the renderer draws nothing
 * without a `src`, and readers see a caption for an invisible figure. This
 * script points each one at a replication the corpus actually serves.
 *
 * The picks are not derived here. Four review passes fetched every plausible
 * candidate, watched the frames, and recorded what they saw in
 * `notes-and-plans/reports/embed-picks-{a,b,c,d}.json`; several turned out to
 * be the original lost work recovered under a new slug (the
 * perspective-distortion row's `source_url` is literally the dead gfycat id).
 * This script's job is the mechanical, verifiable half: match each pick to the
 * one srcless embed in its field, and write it.
 *
 * Per embed it sets `src`, drops the dead `gfycat` attribute, and adopts the
 * corpus credit (`artist`, `artist_url`) so the byline resolves to the
 * artist's page. Both the raw markup and the parsed AST move together, because
 * the AST is what renders when present.
 *
 *   node scripts/effects/repoint-dead-gfycat-embeds.mjs --target-url=<url>
 *   node scripts/effects/repoint-dead-gfycat-embeds.mjs --target-url=<url> \
 *     --write --confirm-write=repoint-dead-gfycat-embeds \
 *     --expected-deployment=glad-minnow-656
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

const operation = "repoint-dead-gfycat-embeds";
const command = createProductionWriteCommand({ operation });
if (!command.targetUrl) throw new Error("Pass an explicit --target-url for dry runs and writes.");
printProductionWriteCommand(command);

const picks = ["a", "b", "c", "d"].flatMap((suffix) =>
  JSON.parse(
    readFileSync(`notes-and-plans/reports/embed-picks-${suffix}.json`, "utf8"),
  ).rows,
);

const withPick = picks.filter((row) => row.pick?.url);
if (withPick.length !== picks.length) {
  for (const row of picks.filter((item) => !item.pick?.url)) {
    console.log(`NO PICK ${row.article}/${row.field}: ${row.why ?? "unexplained"}`);
  }
}

const client = new ConvexHttpClient(command.targetUrl);
const effects = await client.query(api.subjectiveEffects.getAll, {});
const bySlug = new Map(effects.map((effect) => [effect.slug, effect]));

const attributePattern = /([a-z-]+)="([^"]*)"/g;
const embedPattern = /\[captioned-image\b([^\]]*?)\/\]/g;

function attributesOf(body) {
  const attributes = {};
  for (const [, key, value] of body.matchAll(attributePattern)) attributes[key] = value;
  return attributes;
}


/**
 * Whether this embed is the one a pick replaces. The caption is the identity:
 * it is verbatim in the review reports, unique within its field, and survives
 * the raw/AST split that the dead `gfycat` attribute does not (the AST copies
 * dropped or renamed it, and one AST embed even carries a cross-wired `src`
 * pointing at an unrelated illustration). The two embeds with no caption
 * attribute at all are identified by being the field's only srcless embed.
 */
function matchesPick(attributes, row) {
  if (row.caption) return attributes.caption === row.caption;
  return !attributes.src;
}

/** The replacement attributes: pick's media and credit in, dead locator out. */
function repointAttributes(attributes, pick) {
  const { gfycat: _dropped, ...kept } = attributes;
  return {
    ...kept,
    src: pick.url,
    artist: pick.artist,
    ...(pick.artist_url ? { artist_url: pick.artist_url } : {}),
  };
}

/** Rewrite matching embeds inside raw markup. */
function repointRaw(value, row, counter) {
  return value.replace(embedPattern, (tag, body) => {
    const attributes = attributesOf(body);
    if (!matchesPick(attributes, row)) return tag;
    counter.hits += 1;
    const rendered = Object.entries(repointAttributes(attributes, row.pick))
      .map(([key, item]) => `${key}="${item}"`)
      .join(" ");
    return `[captioned-image ${rendered} /]`;
  });
}

/** Rewrite matching embeds in a raw string or a parsed AST alike. */
function repointAst(value, row, counter) {
  if (typeof value === "string") return repointRaw(value, row, counter);
  if (Array.isArray(value)) return value.map((item) => repointAst(item, row, counter));
  if (!value || typeof value !== "object") return value;

  const next = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, repointAst(item, row, counter)]),
  );
  if (value.name === "captioned-image" && matchesPick(value.properties ?? {}, row)) {
    counter.hits += 1;
    next.properties = repointAttributes(value.properties ?? {}, row.pick);
  }
  return next;
}

const plans = [];
for (const row of withPick) {
  const effect = bySlug.get(row.article);
  if (!effect) throw new Error(`No article row for ${row.article}`);

  const astField = row.field.replace(/_raw$/, "_ast");
  // Caption identity first. Two embeds carry no caption attribute at all
  // (their caption text lives inside an unrendered `imageRoutes` payload), so
  // for those the field's only srcless embed is the target.
  const attempts = [row, { ...row, caption: null }];
  let plan = null;

  for (const attempt of attempts) {
    const changes = [];
    let hits = 0;
    for (const field of [row.field, astField]) {
      const current = effect[field];
      if (current === undefined || current === null) continue;
      const counter = { hits: 0 };
      const value = repointAst(current, attempt, counter);
      if (counter.hits > 1) {
        throw new Error(`${row.article}.${field}: ${counter.hits} embeds matched one pick`);
      }
      hits += counter.hits;
      if (counter.hits === 1) changes.push({ field, expected: current, value });
    }
    if (hits > 0) {
      plan = { row, changes };
      break;
    }
  }

  if (!plan) throw new Error(`${row.article}.${row.field}: no embed matched this pick`);
  plans.push(plan);
}

// One article can own two of these embeds (drifting and transformations each
// carry the same asset in description and long summary). Those must be one
// mutation: each change carries the field's pre-write value, so two separate
// writes would race on nothing but would report a stale baseline.
const byArticle = new Map();
for (const plan of plans) {
  const existing = byArticle.get(plan.row.article) ?? { slug: plan.row.article, rows: [], changes: [] };
  existing.rows.push(plan.row);
  for (const change of plan.changes) {
    if (existing.changes.some((item) => item.field === change.field)) {
      throw new Error(`Two picks target ${plan.row.article}.${change.field}`);
    }
    existing.changes.push(change);
  }
  byArticle.set(plan.row.article, existing);
}

console.log(`Embeds to repoint: ${plans.length} across ${byArticle.size} articles`);
for (const { slug, rows, changes } of byArticle.values()) {
  console.log(`  ${slug} (${changes.map(({ field }) => field).join(", ")})`);
  for (const row of rows) {
    console.log(`    ${row.gfycat ?? "no locator"} -> ${row.pick.slug} [${row.pick.type}] by ${row.pick.artist}`);
    console.log(`      ${row.pick.url}`);
  }
}

if (command.dryRun) {
  console.log("\nDry run complete. Re-run with the write and confirmation flags to apply.");
  process.exit(0);
}

assertProductionWriteAllowed(command);
const credential = requireProductionWriteCredential("replicationMaintenance");

for (const { slug, changes } of byArticle.values()) {
  await client.mutation(api.subjectiveEffects.repairLegacyMedia, {
    apiKey: credential.token,
    slug,
    changes,
    clearSocialMediaImage: false,
  });
  console.log(`REPOINTED ${slug} (${changes.map(({ field }) => field).join(", ")})`);
}

// Post-write verification: the new media is present, no dead gfycat locator
// survives in the touched fields, and the media itself still serves.
let failures = 0;
for (const { slug, rows, changes } of byArticle.values()) {
  const effect = await client.query(api.subjectiveEffects.getBySlug, { slug });
  const serialized = JSON.stringify(changes.map(({ field }) => effect?.[field] ?? null));
  for (const row of rows) {
    const present = serialized.includes(row.pick.url);
    const staleLocator = row.gfycat ? serialized.includes(row.gfycat) : false;
    const response = await fetch(row.pick.url, { headers: { range: "bytes=0-1023" } });
    if (!present || staleLocator || !response.ok) {
      failures += 1;
      console.error(
        `VERIFY FAILED ${slug}: srcPresent=${present} gfycatGone=${!staleLocator} ` +
        `mediaServes=${response.status}`,
      );
    } else {
      console.log(`VERIFIED ${slug}: ${row.pick.slug} serves (${response.status})`);
    }
  }
}
if (failures > 0) throw new Error(`${failures} post-write verification(s) failed.`);

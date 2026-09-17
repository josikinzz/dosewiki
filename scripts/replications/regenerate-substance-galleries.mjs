#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Not a TypeScript module; use the native resolver's diagnostic.
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  GALLERY_CURATION_SLUG_CAP,
  isShowcaseEligible,
  matchSubstanceGalleryReplications,
  substanceGalleryTargetOf,
} = await import("../../src/data/substanceReplicationGallery.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OPERATION = "regenerate-substance-galleries";
const REPORT_PATH = path.join(
  ROOT,
  "tmp/replication-galleries/regeneration-latest.json",
);
const READ_CONCURRENCY = 12;
const AUDITED_DIRECT_ASSOCIATIONS = new Map([
  ["salvia", ["the-clockwork-suburb-salviadroid", "seers-portal-salviadroid"]],
]);

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableObject(entry)]),
  );
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableObject(value))).digest("hex");
}

function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}

function unique(values) {
  return [...new Set(values)];
}

function sameList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function existingOrder(slugs) {
  return new Map(slugs.map((slug, index) => [slug, index]));
}

/** Existing priority first within a media tier; newly inferred rows keep corpus order. */
function priorityOrder(matches, currentCurated) {
  const current = existingOrder(currentCurated);
  return [...matches].sort((left, right) => {
    const leftOrder = current.get(left.row.slug);
    const rightOrder = current.get(right.row.slug);
    if (leftOrder === undefined && rightOrder !== undefined) return 1;
    if (leftOrder !== undefined && rightOrder === undefined) return -1;
    if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
    return 0;
  });
}

function namedRow(row) {
  return { slug: row.slug, title: row.title, type: row.type, artist: row.artist };
}

/**
 * Build one clean-cutover plan. Stored priorities become the complete reviewed
 * exact-drug tier (videos, then images) plus the two audited Salvia direct
 * associations. General class and Visual Disconnection fallback rows remain
 * automatic and are therefore never frozen into a stored list. Existing
 * per-article exclusions survive only while their row remains eligible.
 */
export function planGalleryRegeneration({ replications, substances, galleriesBySubstance }) {
  const rowBySlug = new Map(replications.map((row) => [row.slug, row]));
  const duplicateArticleSlugs = substances
    .map((article) => article?.slug)
    .filter(Boolean)
    .filter((slug, index, all) => all.indexOf(slug) !== index);
  if (duplicateArticleSlugs.length > 0) {
    throw new Error(`Duplicated substance article slugs: ${unique(duplicateArticleSlugs).join(", ")}`);
  }

  const plans = [];
  for (const substance of substances) {
    const target = substanceGalleryTargetOf(substance);
    if (!target) continue;
    const current = galleriesBySubstance.get(target.slug) ?? null;
    const currentCurated = current?.curated_slugs ?? [];
    const currentRemoved = current?.removed_slugs ?? [];
    const automatic = matchSubstanceGalleryReplications(replications, target).matches;
    const specific = automatic.filter((match) => match.provenance.matchedVia === "specific_drug");
    const generalClass = automatic.filter((match) => match.provenance.matchedVia === "drug_class");
    const visualDisconnection = automatic.filter(
      (match) => match.provenance.matchedVia === "visual_disconnection",
    );
    const specificVideos = priorityOrder(
      specific.filter((match) => match.row.type === "video"),
      currentCurated,
    );
    const specificImages = priorityOrder(
      specific.filter((match) => match.row.type === "image"),
      currentCurated,
    );

    const auditedDirect = (AUDITED_DIRECT_ASSOCIATIONS.get(target.slug) ?? [])
      .map((slug) => rowBySlug.get(slug))
      .filter((row) => row && isShowcaseEligible(row));
    const currentImageOrder = existingOrder(currentCurated);
    const imageRows = unique([
      ...specificImages.map((match) => match.row.slug),
      ...auditedDirect.filter((row) => row.type === "image").map((row) => row.slug),
    ])
      .map((slug) => rowBySlug.get(slug))
      .filter(Boolean)
      .sort((left, right) => {
        const leftOrder = currentImageOrder.get(left.slug);
        const rightOrder = currentImageOrder.get(right.slug);
        if (leftOrder === undefined && rightOrder !== undefined) return 1;
        if (leftOrder !== undefined && rightOrder === undefined) return -1;
        if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
        return 0;
      });
    const directVideos = auditedDirect.filter((row) => row.type === "video").map((row) => row.slug);
    const curatedSlugs = unique([
      ...specificVideos.map((match) => match.row.slug),
      ...directVideos,
      ...imageRows.map((row) => row.slug),
    ]);
    if (curatedSlugs.length > GALLERY_CURATION_SLUG_CAP) {
      throw new Error(`${target.slug}: ${curatedSlugs.length} priorities exceed the ${GALLERY_CURATION_SLUG_CAP}-slug cap.`);
    }

    const removedSlugs = unique(
      currentRemoved.filter((slug) => {
        const row = rowBySlug.get(slug);
        return row ? isShowcaseEligible(row) : false;
      }),
    ).filter((slug) => !curatedSlugs.includes(slug));
    const changed = !sameList(curatedSlugs, currentCurated) || !sameList(removedSlugs, currentRemoved);
    if (!changed && !current && curatedSlugs.length === 0 && removedSlugs.length === 0) continue;

    const nextSet = new Set(curatedSlugs);
    const currentSet = new Set(currentCurated);
    plans.push({
      substance_slug: target.slug,
      substance_title: substance.title,
      psychoactive_classes: target.psychoactiveClasses,
      expected_updated_at: current?.updated_at ?? null,
      current: {
        curated_slugs: currentCurated,
        removed_slugs: currentRemoved,
      },
      next: { curated_slugs: curatedSlugs, removed_slugs: removedSlugs },
      automatic: {
        specific: specific.length,
        general_class: generalClass.length,
        visual_disconnection: visualDisconnection.length,
      },
      added_priorities: curatedSlugs.filter((slug) => !currentSet.has(slug)).map((slug) => namedRow(rowBySlug.get(slug))),
      dropped_priorities: currentCurated.filter((slug) => !nextSet.has(slug)).map((slug) => {
        const row = rowBySlug.get(slug);
        return row ? namedRow(row) : { slug, missing: true };
      }),
      dropped_exclusions: currentRemoved.filter((slug) => !removedSlugs.includes(slug)),
      changed,
    });
  }
  return plans.sort((left, right) => left.substance_slug.localeCompare(right.substance_slug));
}

async function readGalleries(client, substanceSlugs) {
  const result = new Map();
  let next = 0;
  async function worker() {
    while (next < substanceSlugs.length) {
      const slug = substanceSlugs[next];
      next += 1;
      const row = await client.query(api.substanceGalleries.getBySubstance, { substance_slug: slug });
      if (row) result.set(slug, row);
    }
  }
  await Promise.all(Array.from({ length: READ_CONCURRENCY }, () => worker()));
  return result;
}

function summarize(plans) {
  const changed = plans.filter((plan) => plan.changed);
  return {
    articles_considered: plans.length,
    articles_changed: changed.length,
    priorities_before: changed.reduce((sum, plan) => sum + plan.current.curated_slugs.length, 0),
    priorities_after: changed.reduce((sum, plan) => sum + plan.next.curated_slugs.length, 0),
    exclusions_before: changed.reduce((sum, plan) => sum + plan.current.removed_slugs.length, 0),
    exclusions_after: changed.reduce((sum, plan) => sum + plan.next.removed_slugs.length, 0),
    added_priorities: changed.reduce((sum, plan) => sum + plan.added_priorities.length, 0),
    dropped_priorities: changed.reduce((sum, plan) => sum + plan.dropped_priorities.length, 0),
    dropped_exclusions: changed.reduce((sum, plan) => sum + plan.dropped_exclusions.length, 0),
  };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION, startDir: ROOT });
  printProductionWriteCommand(command);
  if (!command.targetUrl) {
    throw new Error("Set TARGET_POSTGRES_URL explicitly for the regeneration audit.");
  }
  const client = createDataClient({ target: command.targetUrl }).client;
  const [replications, substances] = await Promise.all([
    client.query(api.replications.getAll, {}),
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
  ]);
  const galleriesBySubstance = await readGalleries(client, substances.map((article) => article.slug));
  const plans = planGalleryRegeneration({ replications, substances, galleriesBySubstance });
  const changed = plans.filter((plan) => plan.changed);
  const payload = changed.map((plan) => ({
    substance_slug: plan.substance_slug,
    curated_slugs: plan.next.curated_slugs,
    removed_slugs: plan.next.removed_slugs,
    expected_updated_at: plan.expected_updated_at,
  }));
  const payloadDigest = digest(payload);
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    target_deployment: command.deploymentFingerprint,
    payload_digest: payloadDigest,
    summary: summarize(plans),
    plans,
  };
  writeJsonAtomic(REPORT_PATH, report);
  console.log(JSON.stringify({ report: path.relative(ROOT, REPORT_PATH), payload_digest: payloadDigest, ...report.summary }, null, 2));
  if (command.dryRun) return;

  assertProductionWriteAllowed(command);
  const requestedDigest = process.argv.find((arg) => arg.startsWith("--digest="))?.slice("--digest=".length);
  if (!process.argv.includes("--confirm-gallery-regeneration") || requestedDigest !== payloadDigest) {
    throw new Error(`Write requires --confirm-gallery-regeneration --digest=${payloadDigest}`);
  }
  const credential = requireProductionWriteCredential("replicationMaintenance");
  for (const [index, plan] of changed.entries()) {
    process.stderr.write(`\rRegenerating gallery ${index + 1}/${changed.length}: ${plan.substance_slug}`);
    const result = await client.mutation(api.substanceGalleries.upsert, {
      apiKey: credential.token,
      substance_slug: plan.substance_slug,
      curated_slugs: plan.next.curated_slugs,
      removed_slugs: plan.next.removed_slugs,
      expectedUpdatedAt: plan.expected_updated_at,
      updatedBy: `${OPERATION}@dosewiki.internal`,
    });
    if (result.status !== "ok") throw new Error(`${plan.substance_slug}: gallery changed during regeneration.`);
    if (result.pruned_curated.length > 0 || result.pruned_removed.length > 0) {
      throw new Error(`${plan.substance_slug}: Postgres unexpectedly pruned the audited payload.`);
    }
  }
  process.stderr.write("\n");

  const verified = await readGalleries(client, changed.map((plan) => plan.substance_slug));
  const mismatches = changed.filter((plan) => {
    const row = verified.get(plan.substance_slug);
    return !row
      || !sameList(row.curated_slugs, plan.next.curated_slugs)
      || !sameList(row.removed_slugs, plan.next.removed_slugs);
  });
  if (mismatches.length > 0) {
    throw new Error(`Gallery verification failed: ${mismatches.map((plan) => plan.substance_slug).join(", ")}`);
  }
  const verification = { verified: changed.length, mismatches: [] };
  writeJsonAtomic(REPORT_PATH, {
    ...report,
    applied_at: new Date().toISOString(),
    verification,
  });
  console.log(JSON.stringify(verification, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}

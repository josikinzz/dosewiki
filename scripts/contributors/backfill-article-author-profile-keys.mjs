#!/usr/bin/env node
/**
 * Backfill `effectIndexArticles.authorProfileKeys` for the legacy Effect Index
 * import.
 *
 * The Mongo dump brought articles across with `authors` as raw 24-character
 * ObjectIds. Exactly one id appears across the whole corpus —
 * `60542430198361300fea3610` — and the dump's own `people` collection
 * (`kind: "person"`, imported into `effectIndexArchive`) maps it to Josie Kins.
 * Public bylines cannot read an opaque id, so they read `authorProfileKeys`;
 * this script gives every legacy row the one key that id resolves to.
 *
 * Writes go through `effectIndexArticles.upsertArticle`, whose update is a
 * patch: only `authorProfileKeys` is sent, so nothing else on the row moves.
 * A row that already carries `authorProfileKeys` is never touched — an editor's
 * attribution outranks this backfill.
 *
 * Dry run by default. Nothing is written without `--write` plus the standard
 * production-write confirmations.
 *
 * Usage:
 *   node scripts/contributors/backfill-article-author-profile-keys.mjs
 *   node scripts/contributors/backfill-article-author-profile-keys.mjs --limit=5
 *   TARGET_POSTGRES_URL=postgresql://<host>/<database> \
 *     node scripts/contributors/backfill-article-author-profile-keys.mjs --write \
 *       --confirm-write=backfill-article-author-profile-keys \
 *       --expected-deployment=<deployment>
 */

import { createDataClient, resolvePostgresSource, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

/** The single legacy author ObjectId carried by the imported articles. */
const LEGACY_AUTHOR_OBJECT_ID = "60542430198361300fea3610";

/** The contributor profile that ObjectId resolves to (`EFFECT_INDEX_FOUNDER_KEY`). */
const JOSIE_PROFILE_KEY = "JOSIE";

const OPERATION = "backfill-article-author-profile-keys";

function getFlag(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function needsBackfill(article) {
  const authors = Array.isArray(article.authors) ? article.authors : [];
  if (!authors.includes(LEGACY_AUTHOR_OBJECT_ID)) {
    return false;
  }

  const keys = Array.isArray(article.authorProfileKeys) ? article.authorProfileKeys : [];
  return keys.length === 0;
}

async function backfillAuthorProfileKeys() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;

  if (!readUrl) {
    throw new Error(
      "No Postgres URL to read from. Set TARGET_POSTGRES_URL (or POSTGRES_POOLED_URL for a dry run).",
    );
  }

  const client = createDataClient({ target: readUrl }).client;

  const profile = await client.query(api.contributorProfiles.getByKey, {
    key: JOSIE_PROFILE_KEY,
  });
  if (!profile) {
    throw new Error(
      `Contributor profile "${JOSIE_PROFILE_KEY}" does not exist on this deployment; ` +
        "backfilling would point bylines at a page that is not there.",
    );
  }

  const articles = await client.query(api.effectIndexArticles.getAll, {});
  const legacy = articles.filter(
    (article) =>
      Array.isArray(article.authors) && article.authors.includes(LEGACY_AUTHOR_OBJECT_ID),
  );
  let pending = articles.filter(needsBackfill);

  const limitFlag = getFlag("limit");
  if (limitFlag) {
    const limit = Number.parseInt(limitFlag, 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error(`--limit must be a positive integer, got "${limitFlag}".`);
    }
    pending = pending.slice(0, limit);
  }

  console.log(`\nReading from: ${postgresFingerprintFromUrl(readUrl)}`);
  console.log(`Articles readable (drafts excluded): ${articles.length}`);
  console.log(`Carrying the legacy author id ${LEGACY_AUTHOR_OBJECT_ID}: ${legacy.length}`);
  console.log(`Already carrying authorProfileKeys: ${legacy.length - pending.length}`);
  console.log(
    `To backfill with ["${JOSIE_PROFILE_KEY}"] (${profile.displayName ?? JOSIE_PROFILE_KEY}): ${pending.length}`,
  );
  pending.forEach((article) => console.log(`  · ${article.slug}`));

  if (pending.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  if (command.dryRun) {
    console.log("\nDry run; no article was written.");
    return;
  }

  assertProductionWriteAllowed(command);
  const credential = requireProductionWriteCredential("editorArticleWrite");

  let updated = 0;
  const failures = [];

  for (const article of pending) {
    try {
      const baseline = await client.query(api.effectIndexArticles.getForEditor, { apiKey: credential.token, slug: article.slug });
      if (!baseline || baseline.authorProfileKeys?.length) throw new Error("Writing attribution changed after this backfill was planned.");
      await client.mutation(api.effectIndexArticles.upsertArticle, {
        apiKey: credential.token,
        slug: article.slug,
        expectedRevision: baseline.baseRevision,
        operationId: crypto.randomUUID(),
        authorProfileKeys: [JOSIE_PROFILE_KEY],
      });
      updated += 1;
      console.log(`  ↻ ${article.slug}`);
    } catch (error) {
      failures.push({ slug: article.slug, message: error.message });
      console.log(`  ! ${article.slug} — ${error.message}`);
    }
  }

  console.log("\nBackfill complete.");
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed:  ${failures.length}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

backfillAuthorProfileKeys().catch((error) => {
  console.error(`\nFailed to backfill author profile keys: ${error.message}`);
  process.exit(1);
});

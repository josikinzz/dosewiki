#!/usr/bin/env node
/**
 * Repair Effect Index article bodies that carry `[markdown text="…"]` blobs.
 *
 * The legacy import folded whole sections of an article — the duration list,
 * every per-level effect roundup, the experience-report list — into the `text`
 * attribute of a single `markdown` VCode node. VCode attributes cannot contain
 * `]` (`RAW_VCODE_TAG_PATTERN` in `src/features/effects/vcode/normalize.ts`
 * stops at the first one), so a blob holding `[int-link …]` markup never parses:
 * the reader sees `[markdown text="* [int-link to=…` as literal prose. `dxm` is
 * the only row in the corpus in that state.
 *
 * The repair rewrites each blob into the markup the working intensity-scale
 * articles use (`dissociative-intensity-scale`, `dmt`): `[ul]` for the duration
 * and report lists, and `[columns]`/`[panel title icon]`/`[ul]` for each
 * `#### Category` effect roundup, which is what renders as `EffectListPanel`.
 * Effect labels, links, and frequencies are carried across verbatim.
 *
 * `body_ast` is cleared to `null` because the stored AST is the mis-parse of
 * the same blob; the public reader re-parses `body_raw` whenever the AST is
 * absent (`normalizeVCodeContent`).
 *
 * Dry run by default. `--print=<slug>` writes the repaired body to stdout.
 * `--slug=<slug>` limits inspection and writes to one article.
 *
 * Usage:
 *   node scripts/articles/repair-markdown-shortcode-bodies.mjs
 *   node scripts/articles/repair-markdown-shortcode-bodies.mjs --print=dxm
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *     node scripts/articles/repair-markdown-shortcode-bodies.mjs --write \
 *       --confirm-write=repair-markdown-shortcode-bodies \
 *       --expected-deployment=localhost/dosewiki
 */

import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { repairMarkdownShortcodeBody } from "./markdownShortcodeRepair.mjs";

const OPERATION = "repair-markdown-shortcode-bodies";

function getFlag(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function repairBodies() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const readUrl =
    command.targetUrl ??
    process.env.POSTGRES_DIRECT_URL ??
    process.env.POSTGRES_POOLED_URL ??
    process.env.POSTGRES_POOLED_URL;

  if (!readUrl) {
    throw new Error(
      "No Postgres URL to read from. Set TARGET_POSTGRES_URL (or POSTGRES_DIRECT_URL for a dry run).",
    );
  }

  const client = createDataClient({ target: readUrl }).client;
  const articles = await client.query(api.effectIndexArticles.getAll, {});
  const slug = getFlag("slug");
  if (slug && !articles.some((article) => article.slug === slug)) {
    throw new Error(`No readable article named "${slug}".`);
  }
  const affected = articles.filter((article) =>
    (!slug || article.slug === slug) && (article.body_raw ?? "").includes('markdown text="'),
  );

  console.log(`\nReading from: ${postgresFingerprintFromUrl(readUrl)}`);
  console.log(`Articles readable: ${articles.length}`);
  console.log(`Carrying markdown shortcode blobs: ${affected.length}`);

  const repairs = affected.map((article) => {
    const { body, blobs, panels } = repairMarkdownShortcodeBody(article.body_raw);
    return { article, body, blobs, panels };
  });

  for (const repair of repairs) {
    console.log(
      `  · ${repair.article.slug}: ${repair.blobs} blob(s) → ${repair.panels} effect panel(s)`,
    );
  }

  const printSlug = getFlag("print");
  if (printSlug) {
    const found = repairs.find((repair) => repair.article.slug === printSlug);
    if (!found) {
      throw new Error(`No repairable article named "${printSlug}".`);
    }
    console.log(`\n----- ${printSlug} -----\n${found.body}`);
  }

  if (repairs.length === 0) {
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

  for (const repair of repairs) {
    try {
      const baseline = await client.query(api.effectIndexArticles.getForEditor, { apiKey: credential.token, slug: repair.article.slug });
      if (!baseline || baseline.body_raw !== repair.article.body_raw) throw new Error("Writing source changed after this repair was planned.");
      await client.mutation(api.effectIndexArticles.upsertArticle, {
        apiKey: credential.token,
        slug: repair.article.slug,
        expectedRevision: baseline.baseRevision,
        operationId: crypto.randomUUID(),
        body_raw: repair.body,
      });
      updated += 1;
      console.log(`  ↻ ${repair.article.slug}`);
    } catch (error) {
      failures.push({ slug: repair.article.slug, message: error.message });
      console.log(`  ! ${repair.article.slug} — ${error.message}`);
    }
  }

  console.log("\nRepair complete.");
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed:  ${failures.length}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

repairBodies().catch((error) => {
  console.error(`\nFailed to repair article bodies: ${error.message}`);
  process.exit(1);
});

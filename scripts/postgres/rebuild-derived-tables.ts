/**
 * Rebuild derived tables on an explicitly selected Postgres target.
 * Drives owned backfill mutations through `PostgresClient`, paging each until
 * `isDone`. Operator writes obey the same write-freeze guard as application
 * writes; this command never bypasses a frozen target.
 *
 *   bun scripts/postgres/rebuild-derived-tables.ts --target <url> [--allow-remote]
 */
import { makeFunctionReference } from "../../lib/postgres/runtime/api";
import { PostgresClient } from "../../lib/postgres/runtime/client";
import { guardTarget, resolveTarget } from "./targetGuard";

type Page = { processed?: number; inserted?: number; removed?: number; cursor: string | null; isDone: boolean };

const publicReadIndexes = makeFunctionReference<"mutation", { name: "gallery" | "history" | "reviews"; cursor?: string; limit?: number }, Page>("publicReadIndexes:backfill");
const tripReportIndex = makeFunctionReference<"mutation", { cursor?: string; limit?: number }, Page>("tripReports:backfillSubstanceIndex");
const proposalTargets = makeFunctionReference<"mutation", { cursor?: string | null }, Page>("articleLifecycle:backfillArticleProposalTargets");

async function drain(label: string, step: (cursor: string | undefined) => Promise<Page>): Promise<void> {
  let cursor: string | undefined;
  let pages = 0;
  const totals = { processed: 0, inserted: 0, removed: 0 };
  const started = performance.now();
  for (;;) {
    const page = await step(cursor);
    pages += 1;
    totals.processed += page.processed ?? 0;
    totals.inserted += page.inserted ?? 0;
    totals.removed += page.removed ?? 0;
    if (page.isDone) break;
    if (!page.cursor || page.cursor === cursor) throw new Error(`${label}: cursor did not advance after page ${pages}`);
    cursor = page.cursor;
    if (pages > 10_000) throw new Error(`${label}: exceeded 10,000 pages`);
  }
  console.log(`${label.padEnd(36)} pages=${pages} processed=${totals.processed} inserted=${totals.inserted} removed=${totals.removed} ${Math.round(performance.now() - started)}ms`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  const client = PostgresClient.fromUrl(target);
  try {
    for (const name of ["gallery", "history", "reviews"] as const) {
      await drain(`publicReadIndexes:backfill ${name}`, (cursor) => client.mutation(publicReadIndexes, { name, cursor, limit: 50 }));
    }
    await drain("tripReports:backfillSubstanceIndex", (cursor) => client.mutation(tripReportIndex, { cursor, limit: 50 }));
    await drain("articleLifecycle:backfillArticleProposalTargets", (cursor) => client.mutation(proposalTargets, { cursor: cursor ?? null }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

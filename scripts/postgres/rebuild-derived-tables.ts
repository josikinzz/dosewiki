/**
 * Rebuild derived tables on an explicitly selected Postgres target.
 * Drives owned backfill mutations through `PostgresClient`, paging each until
 * `isDone`. Runs through the production write command: without `--write` it
 * prints the backfill plan and opens no connection. A write needs
 * DATA_BACKEND=postgres, an explicit `--target` or TARGET_POSTGRES_URL,
 * `--confirm-write=postgres-rebuild-derived`, and the expected
 * `<host>/<database>` fingerprint; non-loopback hosts also need
 * `--allow-remote` and POSTGRES_IMPORT_CONFIRM. `DATA_WRITES_FROZEN=1` refuses
 * before any connection, and the runtime freeze still guards every mutation.
 *
 *   bun scripts/postgres/rebuild-derived-tables.ts --target <url>
 *   bun scripts/postgres/rebuild-derived-tables.ts --target <url> --write \
 *     --confirm-write=postgres-rebuild-derived --expected-deployment=<host/database> [--allow-remote]
 */
import { makeFunctionReference } from "../../lib/postgres/runtime/api";
import { PostgresClient } from "../../lib/postgres/runtime/client";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze";
import { assertProductionWriteAllowed, createProductionWriteCommand, executeProductionWrite } from "../lib/production-write-command.mjs";
import { assertTargetMatchesConfirmedDeployment, guardTarget, resolveTarget } from "./targetGuard";

const OPERATION = "postgres-rebuild-derived";
const PUBLIC_READ_INDEXES = ["gallery", "history", "reviews"] as const;
const PLAN = [
  ...PUBLIC_READ_INDEXES.map((name) => `publicReadIndexes:backfill ${name}`),
  "tripReports:backfillSubstanceIndex",
  "articleLifecycle:backfillArticleProposalTargets",
];

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
  const command = createProductionWriteCommand({ operation: OPERATION, argv, loadsEnvLocal: false });
  if (!command.writeRequested) {
    console.log(`Plan only: no connection opened and nothing written. Operation ${OPERATION}.`);
    console.log(`Target deployment: ${command.deploymentFingerprint ? `${command.deploymentFingerprint} (${command.targetSource})` : "none; pass --target or set TARGET_POSTGRES_URL"}`);
    for (const step of PLAN) console.log(`  ${step}`);
    console.log(`To write, repeat with: --write --confirm-write=${OPERATION} --expected-deployment=${command.deploymentFingerprint ?? "<host/database>"}`);
    return;
  }
  assertDataWritesNotFrozen(OPERATION);
  const target = resolveTarget(argv);
  assertProductionWriteAllowed(command);
  assertTargetMatchesConfirmedDeployment(target, command.deploymentFingerprint);
  guardTarget(target, argv.includes("--allow-remote"));
  await executeProductionWrite(command, async () => {
    const client = PostgresClient.fromUrl(target);
    try {
      for (const name of PUBLIC_READ_INDEXES) {
        await drain(`publicReadIndexes:backfill ${name}`, (cursor) => client.mutation(publicReadIndexes, { name, cursor, limit: 50 }));
      }
      await drain("tripReports:backfillSubstanceIndex", (cursor) => client.mutation(tripReportIndex, { cursor, limit: 50 }));
      await drain("articleLifecycle:backfillArticleProposalTargets", (cursor) => client.mutation(proposalTargets, { cursor: cursor ?? null }));
    } finally {
      await client.end();
    }
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

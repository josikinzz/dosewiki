/**
 * `GET /api/cron/publication-delivery`: claim due Postgres outbox rows, deliver
 * the signed publication signal to each public origin, and record receipts.
 * `vercel.json` schedules it on the editor project, which holds the publication
 * targets and write credential. The middleware exempts this exact GET from
 * the editor session gate because Vercel presents `CRON_SECRET`, not a cookie.
 */
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { NextResponse } from "next/server";
import type { Doc, Id } from "@server/postgres/runtime/dataModel";
import { getServerDataWriteCapability, type ServerDataWriteClient } from "@server/data/serverWriteCapability";
import { authorizeCronRequest } from "@server/http/cronAuthorization";
import { dispatchPublicationSignal, type PublicationReceipt } from "@server/next/publicationDispatch";
import { isPublicationTarget } from "@server/next/publicationWire";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { LIVE_LOCALE_CODES } from "@server/next/localeHostPolicy";
import { enqueueTranslationJobs } from "@server/translation/segmentStore";

/** The same by-name references `server/publicationDelivery.ts` uses for its internal mutations. */
const claimDue = makeFunctionReference<"mutation", Record<string, never>, Doc<"publicCachePublications">[]>("publicationRecovery:claimDue");
const recordDelivery = makeFunctionReference<"mutation", {
  id: Id<"publicCachePublications">; generation: number; complete: boolean; receipts: PublicationReceipt[];
}, void>("publicationRecovery:recordDelivery");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Matches the action: six outbox rows in flight at once. */
const DELIVERY_CONCURRENCY = 6;

export type PublicationDeliveryRun = {
  claimed: number;
  completed: number;
  retried: number;
  /** Rows whose stored target is not a known publication identity; left retryable. */
  skipped: number;
};

export async function GET(request: Request) {
  const decision = authorizeCronRequest(request.headers.get("authorization"), {
    CRON_SECRET: process.env.CRON_SECRET,
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status });
  }

  getDataBackend();

  const capability = getServerDataWriteCapability();
  if (capability.ok === false) {
    return NextResponse.json({ error: capability.failure.message }, { status: 503 });
  }

  const run = await reconcilePublications(capability.capability.client);
  return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
}

async function reconcilePublications(client: ServerDataWriteClient): Promise<PublicationDeliveryRun> {
  const rows = await client.mutationAsService(claimDue, {});
  const run: PublicationDeliveryRun = { claimed: rows.length, completed: 0, retried: 0, skipped: 0 };
  for (let start = 0; start < rows.length; start += DELIVERY_CONCURRENCY) {
    await Promise.all(rows.slice(start, start + DELIVERY_CONCURRENCY).map(async (row) => {
      if (!isPublicationTarget(row.target)) {
        run.skipped += 1;
        return;
      }
      const target = row.target;
      const jobSlug = target.kind === "article"
        ? target.slug
        : target.kind === "contributor" ? `profile/${target.slug}`
        : target.kind === "effect" || target.kind === "report" || target.kind === "library" || target.kind === "replication"
          ? `${target.kind}/${target.slug}` : null;
      if (jobSlug) {
        try {
          await enqueueTranslationJobs(LIVE_LOCALE_CODES, [jobSlug], { id: row._id, generation: row.generation });
        } catch (error) {
          await client.mutationAsService(recordDelivery, {
            id: row._id, generation: row.generation, complete: false,
            receipts: [{ target: "translation-queue-failure", status: "unreachable", attempts: 1,
              detail: error instanceof Error ? error.message : "Translation enqueue failed" }],
          });
          run.retried += 1;
          return;
        }
      }
      const revisions = row.target.kind === "article" && row.revision !== undefined
        ? [{ slug: row.target.slug, revision: row.revision }] : [];
      const receipts = await dispatchPublicationSignal([row.target], "manual", { ...process.env, NODE_ENV: "production" }, revisions);
      const complete = receipts.length > 0 && receipts.every((receipt) =>
        receipt.status === "accepted" && (revisions.length === 0 || receipt.verification === "verified"));
      await client.mutationAsService(recordDelivery, { id: row._id, generation: row.generation, complete, receipts });
      if (complete) run.completed += 1;
      else run.retried += 1;
    }));
  }
  return run;
}

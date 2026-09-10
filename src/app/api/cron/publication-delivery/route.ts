/**
 * `GET /api/cron/publication-delivery`: the Vercel cron that replaces
 * `convex/crons.ts` ("recover public cache publications", every minute) once
 * persistence moves to Postgres (ticket 19). It runs the body of the
 * `publicationDelivery.reconcile` Convex action in this process: claim due
 * outbox rows, deliver the signed publication signal to every public origin,
 * and record each receipt through the same two internal mutations.
 *
 * Until cutover the Convex cron still owns recovery, so on the Convex backend
 * the route answers 204 and does nothing. `vercel.json` schedules it on the
 * editor project, the only deployment that holds `PUBLIC_CACHE_PUBLISH_TARGETS`
 * and the write credential; `src/middleware.ts` exempts this exact GET from the
 * editor session gate because Vercel presents `CRON_SECRET`, not a cookie.
 */
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { getServerConvexWriteCapability, type ServerConvexWriteClient } from "@server/convex/serverWriteCapability";
import { authorizeCronRequest } from "@server/http/cronAuthorization";
import { dispatchPublicationSignal, type PublicationReceipt } from "@server/next/publicationDispatch";
import { isPublicationTarget } from "@server/next/publicationWire";
import { getDataBackend } from "@server/postgres/runtime/backend";

/** The same by-name references `convex/publicationDelivery.ts` uses for its internal mutations. */
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

  if (getDataBackend() !== "postgres") {
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
        "x-publication-delivery": "idle; the Convex cron owns publication recovery while DATA_BACKEND is not postgres",
      },
    });
  }

  const capability = getServerConvexWriteCapability();
  if (capability.ok === false) {
    return NextResponse.json({ error: capability.failure.message }, { status: 503 });
  }

  const run = await reconcilePublications(capability.capability.client);
  return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
}

async function reconcilePublications(client: ServerConvexWriteClient): Promise<PublicationDeliveryRun> {
  const rows = await client.mutationAsService(claimDue, {});
  const run: PublicationDeliveryRun = { claimed: rows.length, completed: 0, retried: 0, skipped: 0 };
  for (let start = 0; start < rows.length; start += DELIVERY_CONCURRENCY) {
    await Promise.all(rows.slice(start, start + DELIVERY_CONCURRENCY).map(async (row) => {
      if (!isPublicationTarget(row.target)) {
        run.skipped += 1;
        return;
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

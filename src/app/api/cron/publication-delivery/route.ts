/**
 * `GET /api/cron/publication-delivery`: drive the publication outbox
 * (`lib/next/publicationOutbox.ts`) with its production adapters. It claims due
 * rows, delivers the signed publication signal to each public origin, and
 * records receipts. Editorial writes and translation completion both land here.
 * `vercel.json` schedules it on the editor project, which holds the publication
 * targets and write credential. The middleware exempts this exact GET from
 * the editor session gate because Vercel presents `CRON_SECRET`, not a cookie.
 */
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { NextResponse } from "next/server";
import type { Id } from "@server/postgres/runtime/dataModel";
import { getServerDataWriteCapability, type ServerDataWriteClient } from "@server/data/serverWriteCapability";
import { cronRoute } from "@server/http/cronAuthorization";
import { dispatchPublicationSignal, type PublicationReceipt } from "@server/next/publicationDispatch";
import { deliverDuePublications, type PublicationDeliveryRun, type PublicationOutboxRow } from "@server/next/publicationOutbox";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { LIVE_LOCALE_CODES } from "@server/next/localeHostPolicy";
import { enqueueTranslationJobs } from "@server/translation/segmentStore";

/** By-name references to the store mutations in `server/publicationRecovery.ts`. */
const claimDue = makeFunctionReference<"mutation", Record<string, never>, PublicationOutboxRow[]>("publicationRecovery:claimDue");
const recordDelivery = makeFunctionReference<"mutation", {
  id: Id<"publicCachePublications">; generation: number; complete: boolean; receipts: PublicationReceipt[]; permanent?: boolean;
}, void>("publicationRecovery:recordDelivery");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = cronRoute(async function GET() {
  getDataBackend();

  const capability = getServerDataWriteCapability();
  if (capability.ok === false) {
    return NextResponse.json({ error: capability.failure.message }, { status: 503 });
  }

  const run = await reconcilePublications(capability.capability.client);
  return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
});

/** The production adapters: runtime mutations as the store, the signed signal as the transport. */
function reconcilePublications(client: ServerDataWriteClient): Promise<PublicationDeliveryRun> {
  return deliverDuePublications({
    store: {
      claimDue: () => client.mutationAsService(claimDue, {}),
      recordDelivery: async (report) => {
        await client.mutationAsService(recordDelivery, { ...report, id: report.id as Id<"publicCachePublications"> });
      },
    },
    transport: {
      dispatch: (targets, revisions) => dispatchPublicationSignal(targets, "manual", { ...process.env, NODE_ENV: "production" }, revisions),
    },
    translations: {
      enqueue: (jobSlug, row) => enqueueTranslationJobs(LIVE_LOCALE_CODES, [jobSlug], { publication: { id: row._id, generation: row.generation } }),
    },
  });
}

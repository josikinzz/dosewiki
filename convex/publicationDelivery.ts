"use node";

import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { dispatchPublicationSignal, type PublicationReceipt } from "../lib/next/publicationDispatch";
import { isPublicationTarget } from "../lib/next/publicationWire";

const claimDue = makeFunctionReference<"mutation", Record<string, never>, Doc<"publicCachePublications">[]>("publicationRecovery:claimDue");
const recordDelivery = makeFunctionReference<"mutation", {
  id: Id<"publicCachePublications">; generation: number; complete: boolean; receipts: PublicationReceipt[];
}, void>("publicationRecovery:recordDelivery");

/** Recovery shares the editor's allowlisted signed dispatcher. Only Convex holds
 * the durable queue; public projects receive no mutation credential. */
export const reconcile = internalAction({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.runMutation(claimDue, {});
    for (let start = 0; start < rows.length; start += 6) {
      await Promise.all(rows.slice(start, start + 6).map(async (row) => {
        if (!isPublicationTarget(row.target)) return; // Refuse unknown identities; leave the lease retryable.
        const revisions = row.target.kind === "article" && row.revision !== undefined
          ? [{ slug: row.target.slug, revision: row.revision }] : [];
        const receipts = await dispatchPublicationSignal([row.target], "manual", { ...process.env, NODE_ENV: "production" }, revisions);
        const complete = receipts.length > 0 && receipts.every((receipt) =>
          receipt.status === "accepted" && (revisions.length === 0 || receipt.verification === "verified"));
        await ctx.runMutation(recordDelivery, { id: row._id, generation: row.generation, complete, receipts });
      }));
    }
  },
});

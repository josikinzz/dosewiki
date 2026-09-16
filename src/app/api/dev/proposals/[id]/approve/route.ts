/**
 * Approve one change proposal and apply it to production in the same Postgres
 * mutation. Admin only. The mutation is compare-and-swap on every target's
 * base hash: `applied` comes back with the public paths to revalidate,
 * `changes_requested` with the conflict when production moved under the
 * proposal, and nothing was written in that case.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import type { Id } from "@server/postgres/runtime/dataModel";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { revalidateSavedPaths } from "../../../../save-article/revalidateSavedPaths";
import { proposalIdOf } from "../../proposalRouteId";

export const runtime = "nodejs";

export const POST = protectedRouteOperation({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to approve a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to approve the proposal right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const proposalId = proposalIdOf(request) as Id<"changeProposals">;

    const result = await dataWrite.client.mutation(api.changeProposalReview.approveAndApply, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      proposalId,
    });

    if (result.status === "applied") {
      await revalidateSavedPaths(result.revalidatePaths, "proposal-apply");
      return NextResponse.json({ ok: true, status: result.status, revalidatedPaths: result.revalidatePaths });
    }
    return NextResponse.json({ ok: true, status: result.status, conflictReason: result.conflictReason });
  },
});

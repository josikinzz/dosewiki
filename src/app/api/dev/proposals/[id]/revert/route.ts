/**
 * Revert one applied change proposal: production is written back to the
 * snapshot the apply captured, provided every target still hashes to what the
 * apply left behind. Admin only. A `REVERT_CONFLICT` refusal means something
 * else changed those rows since; edit them directly instead.
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
  unexpectedErrorLabel: "Failed to revert a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to revert the proposal right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const proposalId = proposalIdOf(request) as Id<"changeProposals">;

    const result = await dataWrite.client.mutation(api.changeProposalReview.revert, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      proposalId,
    });

    await revalidateSavedPaths(result.revalidatePaths, "proposal-revert");
    return NextResponse.json({ ok: true, status: result.status, revalidatedPaths: result.revalidatePaths });
  },
});

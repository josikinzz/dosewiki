/**
 * Revert one applied change proposal: production is written back to the
 * snapshot the apply captured, provided every target still hashes to what the
 * apply left behind. Admin only. A `REVERT_CONFLICT` refusal means something
 * else changed those rows since; edit them directly instead.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { revalidateSavedPaths } from "../../../../save-to-convex/revalidateSavedPaths";
import { proposalIdOf } from "../../proposalRouteId";

export const runtime = "nodejs";

export const POST = protectedRouteOperation({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to revert a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to revert the proposal right now.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }
    const proposalId = proposalIdOf(request) as Id<"changeProposals">;

    const result = await convexWrite.client.mutation(api.changeProposalReview.revert, {
      apiKey: convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey,
      actorEmail,
      proposalId,
    });

    revalidateSavedPaths(result.revalidatePaths, "proposal-revert");
    return NextResponse.json({ ok: true, status: result.status, revalidatedPaths: result.revalidatePaths });
  },
});

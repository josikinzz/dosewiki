/**
 * Open-queue size for the `/dev` rail badge.
 *
 * Its own endpoint because the shell fetches every badge on each `/dev`
 * visit; the queue list is only fetched when the Queue tab is open.
 *
 *   GET /api/dev/proposals/count -> { submitted }
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to count open change proposals via Next route:",
  unexpectedErrorMessage: "Unable to count open proposals right now.",
  operation: async ({ actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const { submitted } = await convexWrite.client.query(api.changeProposals.count, {
      apiKey: convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey,
      actorEmail,
    });

    return NextResponse.json({ ok: true, submitted });
  },
});

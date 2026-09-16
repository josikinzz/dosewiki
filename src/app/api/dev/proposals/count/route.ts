/**
 * Open-queue size for the `/dev` rail badge.
 *
 * Its own endpoint because the shell fetches every badge on each `/dev`
 * visit; the queue list is only fetched when the Queue tab is open.
 *
 *   GET /api/dev/proposals/count -> { submitted }
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to count open change proposals via Next route:",
  unexpectedErrorMessage: "Unable to count open proposals right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const { submitted } = await dataWrite.client.query(api.changeProposals.count, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
    });

    return NextResponse.json({ ok: true, submitted });
  },
});

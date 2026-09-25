/**
 * Pending glossary feedback count for the `/dev` Glossary rail badge.
 *
 * Its own endpoint for the same reason as the other badge counts: the shell
 * asks on every `/dev` visit, while the per-locale queue is only read when the
 * Glossary tab is open. The count covers every locale the reviewer may open.
 *
 *   GET /api/glossary-feedback/pending-count -> { total }
 */
import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getServerDataWriteCapabilityOrThrow } from "@server/data/serverWriteCapability";
import { api } from "@server/postgres/runtime/api";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to count pending glossary feedback:",
  unexpectedErrorMessage: "Unable to count pending glossary feedback right now.",
  operation: async ({ actorEmail }) => {
    const capability = getServerDataWriteCapabilityOrThrow();
    const total = await capability.client.query(api.glossaryFeedback.pendingCount, {
      apiKey: capability.getAdminIntentToken("editorArticleWrite") ?? capability.adminKey,
      actorEmail,
    });
    return NextResponse.json({ ok: true, total }, { headers: { "Cache-Control": "no-store" } });
  },
});

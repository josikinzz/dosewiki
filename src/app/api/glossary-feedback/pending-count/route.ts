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

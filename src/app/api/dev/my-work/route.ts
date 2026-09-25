/**
 * The signed-in member's own work, for the `/dev` Home.
 *
 *   GET /api/dev/my-work → { drafts, proposals }
 *
 * Editor floor. `drafts` are the member's saved private article drafts and
 * `proposals` their proposals still awaiting review or returned for changes.
 * The member is the session's actor, never a query parameter; Postgres scopes
 * both lists to that actor, and each row is re-projected here so only the
 * listed fields can leave.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { projectProposalSummary } from "../../../../../lib/proposals/proposalPublic";

export const runtime = "nodejs";

type StoredDraft = { slug: string; title: string; updatedAt: string };

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load the member's drafts and proposals via Next route:",
  unexpectedErrorMessage: "Unable to load your drafts and proposals right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const mine = await dataWrite.client.query(api.articleLifecycle.mine, { apiKey, actorEmail });
    const drafts = (mine.drafts as StoredDraft[]).map(({ slug, title, updatedAt }) => ({ slug, title, updatedAt }));
    const proposals = mine.proposals.map((row) => projectProposalSummary(row, actorEmail));

    return NextResponse.json({ ok: true, drafts, proposals }, { headers: { "Cache-Control": "private, no-store" } });
  },
});

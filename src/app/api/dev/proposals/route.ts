/**
 * Editor proposal submission: the commit panel's staged save, held for an
 * admin instead of written. The body is the same `SaveToConvexPayload` the
 * save route takes, plus a summary and the diff the shell rendered; nothing
 * here touches production, only `changeProposals`.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { deriveProposalTargets } from "../../../../../convex/lib/changeProposalTargets";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  parseChangelogPayload,
  parseIndexLayoutPayloads,
  sanitizeArticleForConvexMutation,
} from "../../save-to-convex/saveToConvexUtils";

export const runtime = "nodejs";

const MAX_PROPOSAL_PAYLOAD_BYTES = 20 * 1024 * 1024;
const MAX_DIFF_LENGTH = 500_000;

type ProposalBody = {
  payload?: { articles?: unknown; indexLayouts?: unknown; changelog?: unknown };
  summary?: unknown;
  diff?: unknown;
};

export const POST = protectedRouteOperation<ProposalBody>({
  auth: "editor",
  rateLimit: "editorHeavyWrite",
  body: {
    maxBytes: MAX_PROPOSAL_PAYLOAD_BYTES,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to submit a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to submit the proposal right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const rawPayload = body.payload && typeof body.payload === "object" ? body.payload : {};
    const rawArticles = Array.isArray(rawPayload.articles) ? rawPayload.articles : [];
    const articles = rawArticles.map(sanitizeArticleForConvexMutation);
    const indexLayouts = parseIndexLayoutPayloads(rawPayload.indexLayouts);
    const changelog = parseChangelogPayload(rawPayload.changelog);

    if (articles.length === 0 && indexLayouts.length === 0) {
      return NextResponse.json({ error: "No Convex-compatible changes to propose." }, { status: 400 });
    }

    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    if (summary.length === 0) {
      return NextResponse.json({ error: "A proposal needs a summary." }, { status: 400 });
    }
    const diff = typeof body.diff === "string" ? body.diff : "";
    const truncatedDiff =
      diff.length > MAX_DIFF_LENGTH
        ? `${diff.slice(0, MAX_DIFF_LENGTH)}\n\n... [Diff truncated - too large to store]`
        : diff;

    const payload = {
      articles: articles as never[],
      indexLayouts,
      ...(changelog ? { changelog } : {}),
    };
    const targets = deriveProposalTargets({
      articles: articles as Array<{ title: string; slug?: string }>,
      indexLayouts,
    });

    const { proposalId } = await convexWrite.client.mutation(api.changeProposals.submit, {
      apiKey: convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey,
      actorEmail,
      payload,
      summary,
      diff: truncatedDiff,
      targets,
    });

    return NextResponse.json({ ok: true, proposalId });
  },
});

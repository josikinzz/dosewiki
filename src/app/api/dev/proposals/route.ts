/**
 * Editor change proposals.
 *
 *   GET  /api/dev/proposals?status=  the review queue, newest first, without payload or diff
 *   POST /api/dev/proposals          the commit panel's staged save, held for an admin instead of written
 *
 * The POST body is the same `SaveArticlePayload` the save route takes, plus
 * the tab-local documents editors cannot write directly (`copyBlocks[]`,
 * parsed as `/api/dev/copy-block` parses one block, and `about`, parsed as
 * `/api/dev/about` does), plus a summary and each document's loaded baseline;
 * nothing here touches production, only `changeProposals`.
 */
import { NextResponse } from "next/server";
import type { Infer } from "@server/postgres/runtime/values";
import { api } from "@server/postgres/runtime/api";
import type { Id } from "@server/postgres/runtime/dataModel";
import { substanceArticleLightValidator } from "../../../../../server/lib/validators";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { PROPOSAL_STATUSES, type ProposalStatus } from "../../../../../lib/proposals/proposalStatus";
import type { ProposalBaseline } from "../../../../../lib/proposals/proposalBaseline";
import { projectProposalSummary } from "../../../../../lib/proposals/proposalPublic";
import {
  parseChangelogPayload,
  parseIndexLayoutPayloads,
  sanitizeArticleForDataMutation,
} from "../../save-article/saveArticleUtils";
import { parseAboutPayload } from "../about/parseAboutBody";
import { parseCopyBlockPayloads } from "../copy-block/parseCopyBlockBody";

export const runtime = "nodejs";

const MAX_PROPOSAL_PAYLOAD_BYTES = 20 * 1024 * 1024;

type ProposalBody = {
  payload?: {
    articles?: unknown;
    indexLayouts?: unknown;
    copyBlocks?: unknown;
    about?: unknown;
    changelog?: unknown;
  };
  summary?: unknown;
  baselines?: unknown;
  /** The returned proposal this submission revises; Postgres supersedes it in the same mutation. */
  revisionOf?: unknown;
};

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to list change proposals via Next route:",
  unexpectedErrorMessage: "Unable to load the proposal queue right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const rawStatus = new URL(request.url).searchParams.get("status");
    let status: ProposalStatus | undefined;
    if (rawStatus !== null && rawStatus !== "") {
      if (!PROPOSAL_STATUSES.includes(rawStatus as ProposalStatus)) {
        return NextResponse.json({ error: `Unknown proposal status "${rawStatus}".` }, { status: 400 });
      }
      status = rawStatus as ProposalStatus;
    }

    const proposals = await dataWrite.client.query(api.changeProposals.list, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      ...(status ? { status } : {}),
    });

    return NextResponse.json({ ok: true, proposals: proposals.map((proposal) => projectProposalSummary(proposal, actorEmail)) });
  },
});

export const POST = protectedRouteOperation<ProposalBody>({
  auth: "editor",
  rateLimit: "editorHeavyWrite",
  body: {
    maxBytes: MAX_PROPOSAL_PAYLOAD_BYTES,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to submit a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to submit the proposal right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const rawPayload = body.payload && typeof body.payload === "object" ? body.payload : {};
    const rawArticles = Array.isArray(rawPayload.articles) ? rawPayload.articles : [];
    // The sanitizer strips draft-only fields but returns `unknown`; the
    // mutation's own validator is what checks the shape at the boundary.
    const articles = rawArticles.map(sanitizeArticleForDataMutation) as Infer<
      typeof substanceArticleLightValidator
    >[];
    const indexLayouts = parseIndexLayoutPayloads(rawPayload.indexLayouts);
    const copyBlocks = parseCopyBlockPayloads(rawPayload.copyBlocks);
    const about = parseAboutPayload(rawPayload.about);
    const changelog = parseChangelogPayload(rawPayload.changelog);

    if (articles.length === 0 && indexLayouts.length === 0 && copyBlocks.length === 0 && !about) {
      return NextResponse.json({ error: "No Postgres-compatible changes to propose." }, { status: 400 });
    }

    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    if (summary.length === 0) {
      return NextResponse.json({ error: "A proposal needs a summary." }, { status: 400 });
    }
    if (!Array.isArray(body.baselines) || body.baselines.some((entry) =>
      !entry || typeof entry !== "object" || !["article", "indexLayout", "copyBlock", "about"].includes(entry.kind) ||
      typeof entry.key !== "string" || !Object.prototype.hasOwnProperty.call(entry, "document"))) {
      return NextResponse.json({ error: "Every change needs its loaded baseline. Your draft is preserved; reload the source and reapply your edits." }, { status: 400 });
    }
    const baselines = body.baselines as ProposalBaseline[];
    const revisionOf = typeof body.revisionOf === "string" ? body.revisionOf.trim() : "";
    if (body.revisionOf !== undefined && body.revisionOf !== null && revisionOf.length === 0) {
      return NextResponse.json({ error: "revisionOf must name a proposal." }, { status: 400 });
    }

    const payload = {
      articles,
      indexLayouts,
      ...(copyBlocks.length > 0 ? { copyBlocks } : {}),
      ...(about ? { about } : {}),
      ...(changelog ? { changelog } : {}),
    };

    // Targets are derived in the mutation from the payload it stores.
    const { proposalId } = await dataWrite.client.mutation(api.changeProposals.submit, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      payload,
      summary,
      baselines,
      ...(revisionOf ? { revisionOf: revisionOf as Id<"changeProposals"> } : {}),
    });

    return NextResponse.json({ ok: true, proposalId });
  },
});

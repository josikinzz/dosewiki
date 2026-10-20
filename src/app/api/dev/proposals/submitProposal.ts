import { NextResponse } from "next/server";
import type { Infer } from "@server/postgres/runtime/values";
import { api } from "@server/postgres/runtime/api";
import type { Id } from "@server/postgres/runtime/dataModel";
import type { ServerDataWriteCapability } from "@server/data/serverWriteCapability";
import { substanceArticleLightValidator } from "../../../../../server/lib/validators";
import type { ProposalBaseline } from "../../../../../lib/proposals/proposalBaseline";
import {
  parseChangelogPayload,
  parseIndexLayoutPayloads,
  sanitizeArticleForDataMutation,
} from "../../save-article/saveArticleUtils";
import { parseAboutPayload } from "../about/parseAboutBody";
import { parseCopyBlockPayloads } from "../copy-block/parseCopyBlockBody";
import { parseWritingPayload } from "../writing-article/parseWritingArticleBody";

export const MAX_PROPOSAL_PAYLOAD_BYTES = 20 * 1024 * 1024;

export type ProposalBody = {
  payload?: {
    articles?: unknown;
    indexLayouts?: unknown;
    copyBlocks?: unknown;
    about?: unknown;
    writing?: unknown;
    changelog?: unknown;
  };
  summary?: unknown;
  baselines?: unknown;
  revisionOf?: unknown;
};

export async function submitProposal({
  actorEmail,
  body,
  dataWrite,
}: {
  actorEmail: string;
  body: ProposalBody;
  dataWrite?: ServerDataWriteCapability;
}): Promise<NextResponse> {
  if (!dataWrite) {
    throw new Error("Postgres write capability is required.");
  }

  const rawPayload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const rawArticles = Array.isArray(rawPayload.articles) ? rawPayload.articles : [];
  const articles = rawArticles.map(sanitizeArticleForDataMutation) as Infer<
    typeof substanceArticleLightValidator
  >[];
  const indexLayouts = parseIndexLayoutPayloads(rawPayload.indexLayouts);
  const copyBlocks = parseCopyBlockPayloads(rawPayload.copyBlocks);
  const about = parseAboutPayload(rawPayload.about);
  const writing = parseWritingPayload(rawPayload.writing);
  const changelog = parseChangelogPayload(rawPayload.changelog);

  if (articles.length === 0 && indexLayouts.length === 0 && copyBlocks.length === 0 && !about && !writing) {
    return NextResponse.json({ error: "No Postgres-compatible changes to propose." }, { status: 400 });
  }

  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (summary.length === 0) {
    return NextResponse.json({ error: "A proposal needs a summary." }, { status: 400 });
  }
  if (!Array.isArray(body.baselines) || body.baselines.some((entry) =>
    !entry || typeof entry !== "object" || !["article", "indexLayout", "copyBlock", "about", "writing"].includes(entry.kind) ||
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
    ...(writing ? { writing } : {}),
    ...(changelog ? { changelog } : {}),
  };

  const { proposalId } = await dataWrite.client.mutation(api.changeProposals.submit, {
    apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
    actorEmail,
    payload,
    summary,
    baselines,
    ...(revisionOf ? { revisionOf: revisionOf as Id<"changeProposals"> } : {}),
  });

  return NextResponse.json({ ok: true, proposalId });
}

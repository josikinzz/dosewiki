/**
 * Claims for Inbox items that have no Reviewing status of their own (citation
 * articles, change proposals, review recommendations).
 *
 *   GET  /api/dev/inbox/claims                                   → { ok, claims }
 *   POST /api/dev/inbox/claims { action, source, id }            → { ok, claim } | { ok, released }
 *
 * `action` is `claim`, `takeover` or `release`. A claim another admin holds
 * comes back as 409 `INBOX_CLAIM_HELD` naming the holder; `takeover` records
 * the caller as the new claimer after the Inbox has asked them to confirm. Trip reports and feedback claim by
 * moving to Reviewing through their own status routes, never through here.
 * Admin floor here and again in Postgres (AGENTS rule 8).
 */
import { NextResponse } from "next/server";
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  INBOX_CLAIM_ITEM_ID_MAX,
  isInboxClaimSource,
  type InboxClaimSource,
} from "../../../../../../server/lib/inboxClaimSources";

export const runtime = "nodejs";

const listClaimsQuery = makeFunctionReference<"query">("inboxClaims:list");
const claimMutation = makeFunctionReference<"mutation">("inboxClaims:claim");
const releaseMutation = makeFunctionReference<"mutation">("inboxClaims:release");
const takeOverMutation = makeFunctionReference<"mutation">("inboxClaims:takeOver");

const ID_RE = new RegExp(`^[A-Za-z0-9][A-Za-z0-9:_-]{0,${INBOX_CLAIM_ITEM_ID_MAX - 1}}$`);

type ClaimBody = { action?: unknown; source?: unknown; id?: unknown };
type ParsedClaim = { action: "claim" | "takeover" | "release"; source: InboxClaimSource; id: string };

function parseClaimBody(body: ClaimBody): ParsedClaim {
  const action = body.action;
  if (action !== "claim" && action !== "takeover" && action !== "release") {
    throw new JsonBodyError(400, "Choose claim, take over or release.");
  }
  const source = body.source;
  if (!isInboxClaimSource(source)) {
    throw new JsonBodyError(400, "Unknown Inbox source.");
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!ID_RE.test(id)) {
    throw new JsonBodyError(400, "An Inbox claim needs a valid item id.");
  }
  return { action, source, id };
}

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load Inbox claims via Next route:",
  unexpectedErrorMessage: "Unable to load who is working on what right now.",
  operation: async ({ dataWrite, actorEmail }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const claims = await dataWrite.client.query(listClaimsQuery, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
    });
    return NextResponse.json({ ok: true, claims }, { headers: { "Cache-Control": "no-store" } });
  },
});

export const POST = protectedRouteOperation<ClaimBody, ParsedClaim>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 2 * 1024, parse: parseClaimBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to update an Inbox claim via Next route:",
  unexpectedErrorMessage: "Unable to update that claim right now.",
  operation: async ({ dataWrite, actorEmail, body }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const args = {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      source: body.source,
      item_id: body.id,
    };
    if (body.action === "release") {
      const outcome = (await dataWrite.client.mutation(releaseMutation, args)) as { released: boolean };
      return NextResponse.json({ ok: true, released: outcome.released });
    }
    const claim = await dataWrite.client.mutation(body.action === "takeover" ? takeOverMutation : claimMutation, args);
    return NextResponse.json({ ok: true, claim });
  },
});

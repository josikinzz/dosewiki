/**
 * Resubmit a returned proposal as a new revision.
 *
 *   POST /api/dev/proposals/<id>/resubmit  same body as POST /api/dev/proposals
 *
 * The body is the commit panel's staged save; the `<id>` segment becomes its
 * `revisionOf`. Everything else (parsing, floor, the Postgres call) is the
 * proposals route's, so the two entry points can never accept different
 * payloads: this one only pins the revision link before handing over.
 */
import { NextResponse } from "next/server";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { proposalIdOf } from "../../proposalRouteId";
import { POST as submitProposal } from "../../route";

export const runtime = "nodejs";

const MAX_PROPOSAL_PAYLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  let revisionOf: string;
  let body: Record<string, unknown>;
  try {
    revisionOf = proposalIdOf(request);
    const parsed = await readJsonBody<unknown>(request, { maxBytes: MAX_PROPOSAL_PAYLOAD_BYTES });
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  // The forwarded request carries the caller's headers (rate limiting keys off
  // them) but a body of its own, so the original length no longer applies.
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");

  return submitProposal(
    new Request(new URL("/api/dev/proposals", request.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, revisionOf }),
    }),
  );
}

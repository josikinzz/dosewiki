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

import { NextResponse } from "next/server";
import { getPublicReplications } from "@server/data/publicData";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";
import {
  CANDIDATE_QUERY_MAX,
  CANDIDATE_SLUG_LIMIT,
  resolveCandidates,
  searchCandidates,
  type CandidateSourceRow,
} from "@/features/dev/tools/playlists/playlistCandidates";

export const runtime = "nodejs";

type CandidateRequest = { kind: "search"; query: string } | { kind: "slugs"; slugs: string[] };

function parseCandidateRequest(request: Request): CandidateRequest {
  const params = new URL(request.url).searchParams;
  const rawSlugs = params.get("slugs");
  if (rawSlugs !== null) {
    const slugs = [...new Set(rawSlugs.split(",").map((slug) => slug.trim()).filter(Boolean))];
    if (slugs.length > CANDIDATE_SLUG_LIMIT) {
      throw new JsonBodyError(400, `Ask for at most ${CANDIDATE_SLUG_LIMIT} slugs at once.`);
    }
    if (!slugs.every(isValidReplicationSlug)) {
      throw new JsonBodyError(400, "Every slug must be lowercase words joined by hyphens.");
    }
    return { kind: "slugs", slugs };
  }
  const query = params.get("q") ?? "";
  if (query.length > CANDIDATE_QUERY_MAX) {
    throw new JsonBodyError(400, `A search may run to ${CANDIDATE_QUERY_MAX} characters.`);
  }
  return { kind: "search", query };
}

export const GET = protectedRouteOperation({
  auth: "contributor",
  rateLimit: "editorPolledRead",
  unexpectedErrorLabel: "Failed to look up playlist candidates via Next route:",
  unexpectedErrorMessage: "Unable to look up works right now.",
  operation: async ({ request }) => {
    const ask = parseCandidateRequest(request);
    const rows = (await getPublicReplications()) as unknown as CandidateSourceRow[];
    const candidates = ask.kind === "slugs" ? resolveCandidates(rows, ask.slugs) : searchCandidates(rows, ask.query);
    return NextResponse.json({ ok: true, candidates });
  },
});

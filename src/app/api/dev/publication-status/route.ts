/**
 * Delivery state an in-page editor polls after it publishes.
 *
 *   GET /api/dev/publication-status?target={"kind":"article","slug":"lsd"}&target=...
 *   → { ok: true, publications: [{ key, state, translations }] }
 *
 * The write routes answer once a change is saved on the editor host; the
 * publication outbox delivers it to the public site later. This reads that
 * outbox row per named identity so the editor's receipt can say when the
 * public site has the change. It reads states only, never content.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { isPublicationTarget, type PublicationTarget } from "@server/next/publicationWire";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";

export const runtime = "nodejs";

/** Matches `PUBLICATION_STATUS_MAX_TARGETS` in the status query. */
const MAX_TARGETS = 8;

function parseTargets(url: URL): PublicationTarget[] {
  const raw = url.searchParams.getAll("target");
  if (raw.length === 0 || raw.length > MAX_TARGETS) throw new JsonBodyError(400, `Name between 1 and ${MAX_TARGETS} publication targets.`);
  return raw.map((entry) => {
    let target: unknown;
    try { target = JSON.parse(entry); } catch { throw new JsonBodyError(400, "Each publication target must be JSON."); }
    if (!isPublicationTarget(target)) throw new JsonBodyError(400, "Unknown publication target.");
    return target;
  });
}

export const GET = protectedRouteOperation({
  auth: "contributor", rateLimit: "diagnosticRead", capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to read publication status:", unexpectedErrorMessage: "Unable to read the publication status.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    const targets = parseTargets(new URL(request.url));
    const publications = await dataWrite!.client.query(api.publicationRecovery.status, {
      apiKey: dataWrite!.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite!.adminKey, actorEmail, targets,
    });
    return NextResponse.json({ ok: true, publications }, { headers: { "Cache-Control": "private, no-store" } });
  },
});

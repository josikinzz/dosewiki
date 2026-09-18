/**
 * Batched editor read for the Substance Galleries curation portal
 * (`/dev` → Replications → Substances).
 *
 *   GET /api/dev/replications/substances → { substances }
 *
 * One response feeds the whole picker: every substance with its publishable
 * match count and whether a curation row exists. The Postgres side reads the
 * corpus once (`getCurationMatchDigest`) and then pages the article table
 * (`listCurationCandidatesPage`) to stay under its 16 MB read limit; this
 * route drains the cursor so the browser makes exactly one request.
 *
 * A slug stored on two articles is ambiguous — the per-substance endpoint
 * treats it as not found — so both copies are dropped here rather than
 * offering a row that could never load.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

/** Articles are large; 32 per page stays under the Postgres read limit with room. */
const PAGE_LIMIT = 32;
/** Hard stop against a cursor that never reports done. */
const MAX_PAGES = 400;

type CandidateItem = {
  slug: string;
  title: string;
  match_count: number;
  curated: boolean;
  curated_count: number;
  removed_count: number;
};

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load the substance gallery candidates via Next route:",
  unexpectedErrorMessage: "Unable to load the substance list right now.",
  operation: async ({ dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey;

    const digest = await dataWrite.client.query(api.substanceGalleries.getCurationMatchDigest, {
      apiKey,
    });

    const items: CandidateItem[] = [];
    let cursor: string | undefined;
    for (let pages = 0; pages < MAX_PAGES; pages += 1) {
      const page = (await dataWrite.client.query(api.substanceGalleries.listCurationCandidatesPage, {
        apiKey,
        digest,
        cursor,
        limit: PAGE_LIMIT,
      })) as { items: CandidateItem[]; cursor: string; isDone: boolean };
      items.push(...page.items);
      if (page.isDone) {
        break;
      }
      cursor = page.cursor;
    }

    const slugCounts = new Map<string, number>();
    for (const item of items) {
      slugCounts.set(item.slug, (slugCounts.get(item.slug) ?? 0) + 1);
    }

    const substances = items
      .filter((item) => slugCounts.get(item.slug) === 1)
      .sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json({ ok: true, substances });
  },
});

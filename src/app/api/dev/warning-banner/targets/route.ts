/**
 * Batched editor read for the Banner Studio's substance search and Coverage
 * view (`/dev` → Banners).
 *
 *   GET /api/dev/warning-banner/targets → { ok, items }
 *
 * One response feeds both views: every substance slug with its title and its
 * classification strings, which `searchWarningBannerTargets` matches so one
 * input finds a single drug by name and a whole class by class string. Finding
 * is not enabling: `resolveEnabledBanners` reads only the preset's explicit
 * slug list or its deliberate sitewide scope. This endpoint remains search and
 * coverage input; classification never assigns a banner.
 *
 * The Postgres side pages the article table (`listSubstanceTargetsPage`) to stay
 * under its read limits; this route drains the cursor so the browser makes
 * exactly one request. No `revalidatePath` here: this reads, and the public
 * pages do not consume it.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { WarningBannerTarget } from "@/data/substanceWarningBanners";

export const runtime = "nodejs";

const PAGE_LIMIT = 200;
/** Hard stop against a cursor that never reports done. */
const MAX_PAGES = 100;

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  // Read-only, but the Postgres query is editor-gated like every corpus walk, and
  // the browser holds no token; the capability is what supplies one here.
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load the warning banner substance targets via Next route:",
  unexpectedErrorMessage: "Unable to load the substance list right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const items: WarningBannerTarget[] = [];
    let cursor: string | undefined;
    for (let pages = 0; pages < MAX_PAGES; pages += 1) {
      const page = (await dataWrite.client.query(api.warningBanners.listSubstanceTargetsPage, {
        apiKey,
        actorEmail,
        cursor,
        limit: PAGE_LIMIT,
      })) as { items: WarningBannerTarget[]; cursor: string; isDone: boolean };
      items.push(...page.items);
      if (page.isDone) {
        break;
      }
      cursor = page.cursor;
    }

    items.sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json({ ok: true, items });
  },
});

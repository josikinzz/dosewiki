import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { WarningBannerTarget } from "@/data/substanceWarningBanners";

export const runtime = "nodejs";

const PAGE_LIMIT = 200;
const MAX_PAGES = 100;

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
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

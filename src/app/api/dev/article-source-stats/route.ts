/**
 * Editor read endpoint for per-substance source richness (`/dev` → Review).
 *
 * The review queue's default order puts the most source-rich articles first,
 * and richness lives in `articleSources` — whose documents carry full scraped
 * texts. This route walks the existing paginated metadata listing server-side
 * (small pages, so no single Postgres execution reads too much) and returns only
 * the numbers the sort needs.
 *
 *   GET /api/dev/article-source-stats  →  { stats: [{ slug, sourceCount, totalTokens }] }
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const PAGE_LIMIT = 25;
const MAX_PAGES = 60;

type SourceMeta = { tokens?: number | null };
type SourceListItem = { slug: string; sources?: SourceMeta[] | null };

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load article source stats via Next route:",
  unexpectedErrorMessage: "Unable to load source statistics right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("articleSourceMigration") ??
      dataWrite.adminKey;

    const stats: Array<{ slug: string; sourceCount: number; totalTokens: number }> = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = (await dataWrite.client.query(
        api.articleSources.getSubstanceList,
        { apiKey, actorEmail, limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
      )) as { items: SourceListItem[]; cursor: string; isDone: boolean };

      for (const item of result.items) {
        const sources = Array.isArray(item.sources) ? item.sources : [];
        stats.push({
          slug: item.slug,
          sourceCount: sources.length,
          totalTokens: sources.reduce(
            (sum, source) => sum + (source?.tokens ?? 0),
            0,
          ),
        });
      }

      if (result.isDone) break;
      cursor = result.cursor;
    }

    return NextResponse.json({ ok: true, stats });
  },
});

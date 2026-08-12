/**
 * Editor read endpoint for the full editor library (`/dev` and `/review`).
 *
 * `substanceIndex.getEditorPage` returns editor-only state — `editorial_review`
 * notes and review flags — so it requires an editor actor on the Convex side.
 * The browser holds no admin intent token, so the drain happens here: the route
 * checks the editor session, then walks the bounded pages server-side with the
 * server's own token and returns the assembled projection.
 *
 *   GET /api/dev/editor-library  →  { ok: true, articles: [...] }
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

/**
 * The editor projection ships whole articles, so a page has to stay well inside
 * Convex's per-execution read limit; the server clamps to its own ceiling too.
 */
const PAGE_LIMIT = 100;
const MAX_PAGES = 200;

type EditorPage = {
  page: unknown[];
  continueCursor: string;
  isDone: boolean;
};

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load the editor library via Next route:",
  unexpectedErrorMessage: "Unable to load the editor library right now.",
  operation: async ({ convexWrite, actorEmail }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const articles: unknown[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result: EditorPage = (await convexWrite.client.query(
        api.substanceIndex.getEditorPage,
        {
          apiKey,
          actorEmail,
          paginationOpts: { numItems: PAGE_LIMIT, cursor },
        },
      )) as EditorPage;

      articles.push(...result.page);

      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    return NextResponse.json({ ok: true, articles });
  },
});

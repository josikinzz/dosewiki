/**
 * Editor read endpoint for the `/dev` and `/review` editor library.
 *
 * Every projection here returns editor-only state — `editorial_review` notes
 * and review flags — so all of them require an editor actor on the Convex side.
 * The browser holds no admin intent token, so the reads happen here: the route
 * checks the editor session, then queries with the server's own token.
 *
 * Three shapes, one endpoint:
 *
 *   GET /api/dev/editor-library               → { ok, scope: "list",  articles }
 *   GET /api/dev/editor-library?scope=full    → { ok, scope: "full",  articles }
 *   GET /api/dev/editor-library?slug=lsd      → { ok, scope: "article", article }
 *
 * The default `list` scope is the slim library projection — the whole corpus
 * without the prose and references that only the one article on screen ever
 * renders. `article` hydrates a single row on selection; `full` is the old
 * whole-corpus drain, kept for the two tools that genuinely sweep every
 * article's body (the tag editor and the review workbench).
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

/**
 * The full editor projection ships whole articles, so a page has to stay well
 * inside Convex's per-execution read limit; the server clamps to its own
 * ceiling too. The slim list projection is roughly forty times smaller per row,
 * so it drains in far fewer round trips at the same page size.
 */
const PAGE_LIMIT = 100;
// Whole articles average ~30 KB; 40 per response stays well under Vercel's
// ~4.5 MB serverless response cap even for reference-heavy pages.
const FULL_ARTICLE_PAGE_LIMIT = 40;
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
  operation: async ({ convexWrite, actorEmail, request }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const params = new URL(request.url).searchParams;
    const slug = params.get("slug")?.trim();

    if (slug) {
      const idParam = Number.parseInt(params.get("id") ?? "", 10);
      const article = await convexWrite.client.query(api.substanceIndex.getEditorBySlug, {
        slug,
        ...(Number.isFinite(idParam) ? { id: idParam } : {}),
        apiKey,
        actorEmail,
      });

      if (!article) {
        return NextResponse.json(
          { ok: false, error: `No article found for slug "${slug}".` },
          { status: 404 },
        );
      }

      return NextResponse.json({ ok: true, scope: "article", article });
    }

    const wantsFullArticles = params.get("scope") === "full";

    if (wantsFullArticles) {
      // One Convex page per HTTP response: the whole corpus in one body blows
      // straight past Vercel's serverless response-size cap, so the client
      // walks `cursor` until `isDone` instead.
      const cursorParam = params.get("cursor");
      const result: EditorPage = (await convexWrite.client.query(api.substanceIndex.getEditorPage, {
        apiKey,
        actorEmail,
        paginationOpts: { numItems: FULL_ARTICLE_PAGE_LIMIT, cursor: cursorParam || null },
      })) as EditorPage;

      return NextResponse.json({
        ok: true,
        scope: "full",
        articles: result.page,
        cursor: result.isDone ? null : result.continueCursor,
        isDone: result.isDone,
      });
    }

    const articles: unknown[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result: EditorPage = (await convexWrite.client.query(api.substanceIndex.getEditorLibraryPage, {
        apiKey,
        actorEmail,
        paginationOpts: { numItems: PAGE_LIMIT, cursor },
      })) as EditorPage;

      articles.push(...result.page);

      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    return NextResponse.json({
      ok: true,
      scope: "list",
      articles,
    });
  },
});

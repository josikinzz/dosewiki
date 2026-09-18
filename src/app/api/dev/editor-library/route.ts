/**
 * Editor read endpoint for the `/dev` and `/review` editor library.
 *
 * Every projection here returns editor-only state — `editorial_review` notes
 * and review flags — so all of them require an editor actor on the Postgres side.
 * The browser holds no admin intent token, so the reads happen here: the route
 * checks the editor session, then queries with the server's own token.
 *
 * Three shapes, one endpoint:
 *
 *   GET /api/dev/editor-library                     → { ok, scope: "list", articles }
 *   GET /api/dev/editor-library?scope=tag-registry  → { ok, scope: "tag-registry", entries }
 *   GET /api/dev/editor-library?slug=lsd            → { ok, scope: "article", article }
 *
 * Any other `scope` (including the retired `full`) is a 400 rather than a
 * silent fall-through to the list drain.
 *
 * The default `list` scope is the slim library projection: the whole corpus
 * without the prose and references that only the one article on screen ever
 * renders. `article` hydrates a single row on selection. `tag-registry` is
 * the tag editor's projection: identity plus the tag fields `buildTagRegistry`
 * reads, so the tag editor lists and plans mutations without draining a
 * single article body. Nothing here ships every whole article: that drain
 * was retired when the review workbench moved to per-slug hydration.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

/**
 * Rows in every drained projection are small (no prose, no references), so a
 * hundred per Postgres page stays far inside the per-execution read limit and
 * the whole list lands in a handful of round trips.
 */
const PAGE_LIMIT = 100;
const MAX_PAGES = 200;

const DRAIN_SCOPES = ["list", "tag-registry"] as const;
type DrainScope = (typeof DRAIN_SCOPES)[number];

function isDrainScope(value: string): value is DrainScope {
  return (DRAIN_SCOPES as readonly string[]).includes(value);
}

type EditorPage = {
  page: unknown[];
  continueCursor: string;
  isDone: boolean;
};

/**
 * Drain a paginated projection at the shared page limit. `done` is false when
 * the page cap ran out first; a caller must not present that partial list as
 * the whole corpus.
 */
async function drainPages(
  fetchPage: (cursor: string | null) => Promise<EditorPage>,
): Promise<{ rows: unknown[]; done: boolean }> {
  const rows: unknown[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchPage(cursor);
    rows.push(...result.page);
    if (result.isDone) {
      return { rows, done: true };
    }
    cursor = result.continueCursor;
  }

  return { rows, done: false };
}

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load the editor library via Next route:",
  unexpectedErrorMessage: "Unable to load the editor library right now.",
  operation: async ({ dataWrite, actorEmail, request }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const params = new URL(request.url).searchParams;
    const slug = params.get("slug")?.trim();

    if (slug) {
      const idParam = Number.parseInt(params.get("id") ?? "", 10);
      const article = await dataWrite.client.query(api.substanceIndex.getEditorBySlug, {
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

    const scope = params.get("scope") ?? "list";
    if (!isDrainScope(scope)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unknown scope "${scope}". Accepted scopes: ${DRAIN_SCOPES.join(", ")}; pass ?slug= for one article.`,
        },
        { status: 400 },
      );
    }

    const projection =
      scope === "tag-registry"
        ? api.substanceIndex.getTagRegistryPage
        : api.substanceIndex.getEditorLibraryPage;
    const { rows, done } = await drainPages(
      (cursor) =>
        dataWrite.client.query(projection, {
          apiKey,
          actorEmail,
          paginationOpts: { numItems: PAGE_LIMIT, cursor },
        }) as Promise<EditorPage>,
    );

    if (!done) {
      // A partial list presented as the whole corpus would silently hide
      // articles from the editor; fail loudly and name the cap instead.
      return NextResponse.json(
        {
          ok: false,
          error: `The ${scope} projection did not finish within ${MAX_PAGES} pages of ${PAGE_LIMIT} rows.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      scope === "tag-registry"
        ? { ok: true, scope, entries: rows }
        : { ok: true, scope, articles: rows },
    );
  },
});

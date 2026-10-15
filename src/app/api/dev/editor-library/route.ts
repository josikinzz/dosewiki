import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

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
      const loaded = await dataWrite.client.query(api.substanceIndex.getEditorBySlug, {
        slug,
        ...(Number.isFinite(idParam) ? { id: idParam } : {}),
        apiKey,
        actorEmail,
      });

      if (!loaded) {
        return NextResponse.json(
          { ok: false, error: `No article found for slug "${slug}".` },
          { status: 404 },
        );
      }

      return NextResponse.json({ ok: true, scope: "article", ...loaded });
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

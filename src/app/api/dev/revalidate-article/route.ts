/**
 * On-demand cache refresh for public article pages, callable by the citation
 * campaign's server-side scripts.
 *
 * Article Data Cache leaves can lower the route's declared one-hour interval
 * to 15 minutes. This route immediately expires the affected article,
 * showcase, history and shared listing projections after a script write.
 *
 * Auth is deliberately not a session: the caller is a headless data-ops script
 * that already holds the `citationEvidenceWrite` admin-intent token it uses
 * for the Postgres mutation itself. The same token authenticates here, validated
 * by the shared `validateAdminIntentToken` (timing-safe, scoped env var first,
 * then the legacy `DATA_ADMIN_KEY` this deployment already carries for its
 * server write capability). Like every `/api/dev` surface, the route is only
 * reachable on the editor hosts; public hosts never serve it.
 *
 *   POST /api/dev/revalidate-article
 *   Authorization: Bearer <citationEvidenceWrite token>
 *   { "slug": "2c-b" } or { "slugs": ["2c-b", "dxm"] }
 *   → { ok: true, revalidated: ["/2c-b", "/dxm"], publication: [...] }
 */
import { NextResponse } from "next/server";
import { validateAdminIntentToken } from "../../../../../server/lib/adminIntentTokens";
import { revalidateSavedPaths } from "../../save-article/revalidateSavedPaths";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { queryData } from "@server/data/serverClient";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SLUG_MAX_LENGTH = 128;
/** A campaign applies one slug at a time; a small batch covers reruns. */
const MAX_SLUGS_PER_REQUEST = 20;
const MAX_BODY_BYTES = 8_192;

type RevalidateArticleBody = {
  slug?: unknown;
  slugs?: unknown;
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) {
      return match[1].trim() || null;
    }
  }

  return request.headers.get("x-admin-token")?.trim() || null;
}

/** Validates and dedupes before any cache call; throws `JsonBodyError` 400. */
function parseSlugs(body: RevalidateArticleBody): string[] {
  const raw: unknown[] = [];
  if (body.slug !== undefined) {
    raw.push(body.slug);
  }
  if (body.slugs !== undefined) {
    if (!Array.isArray(body.slugs)) {
      throw new JsonBodyError(400, "slugs must be an array.");
    }
    raw.push(...body.slugs);
  }

  const slugs: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      throw new JsonBodyError(400, "Every slug must be a string.");
    }
    const slug = entry.trim();
    if (slug.length === 0 || slug.length > SLUG_MAX_LENGTH || !SLUG_RE.test(slug)) {
      throw new JsonBodyError(400, `Invalid slug: ${JSON.stringify(entry)}.`);
    }
    if (!slugs.includes(slug)) {
      slugs.push(slug);
    }
  }

  if (slugs.length === 0) {
    throw new JsonBodyError(400, "Provide slug or slugs.");
  }
  if (slugs.length > MAX_SLUGS_PER_REQUEST) {
    throw new JsonBodyError(400, `At most ${MAX_SLUGS_PER_REQUEST} slugs per request.`);
  }

  return slugs;
}

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, "editorSmallWrite");
  if (rateLimited) {
    return rateLimited;
  }

  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing admin token." }, { status: 401 });
  }
  const validation = validateAdminIntentToken(token, "citationEvidenceWrite");
  if (validation.ok === false) {
    return NextResponse.json({ error: "Invalid admin token." }, { status: 401 });
  }

  try {
    const body = await readJsonBody<RevalidateArticleBody>(request, { maxBytes: MAX_BODY_BYTES });
    const slugs = parseSlugs(body);

    const savedRevisions = await Promise.all(slugs.map(async (slug) => {
      const article = await queryData<{ publicRevision?: string } | null, { slug: string }>(
        "substanceIndex:getPublicBySlug", { slug },
      );
      if (article && !/^[a-f0-9]{64}$/.test(article.publicRevision ?? "")) {
        throw new Error("The public article revision is unavailable.");
      }
      return { slug, revision: article?.publicRevision ?? null };
    }));
    const revalidated = slugs.map((slug) => `/${slug}`);
    const publication = await revalidateSavedPaths(revalidated, "manual", savedRevisions);

    return NextResponse.json({ ok: true, revalidated, publication });
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to revalidate article paths via Next route:", error);
    return NextResponse.json({ error: "Unable to revalidate right now." }, { status: 500 });
  }
}

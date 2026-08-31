/**
 * On-demand cache refresh for public article pages, callable by the citation
 * campaign's server-side scripts.
 *
 * Article pages regenerate on a 1-hour ISR window (`src/app/[slug]/page.tsx`),
 * so a Convex write from `scripts/citations/verdict-apply.mjs --write` would
 * otherwise stay invisible on dose.wiki for up to an hour. Editor routes solve
 * this with `revalidatePath` + the shared substances tag after each write;
 * this route exposes that exact pair to trusted scripts.
 *
 * Auth is deliberately not a session: the caller is a headless data-ops script
 * that already holds the `citationEvidenceWrite` admin-intent token it uses
 * for the Convex mutation itself. The same token authenticates here, validated
 * by the shared `validateAdminIntentToken` (timing-safe, scoped env var first,
 * then the legacy `CONVEX_ADMIN_KEY` this deployment already carries for its
 * server write capability). Like every `/api/dev` surface, the route is only
 * reachable on the editor hosts; public hosts never serve it.
 *
 *   POST /api/dev/revalidate-article
 *   Authorization: Bearer <citationEvidenceWrite token>
 *   { "slug": "2c-b" } or { "slugs": ["2c-b", "dxm"] }
 *   → { ok: true, revalidated: ["/2c-b", "/dxm"] }
 */
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { validateAdminIntentToken } from "../../../../../convex/lib/adminIntentTokens";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";

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

    // Mirrors the editor write routes exactly: the page path plus the shared
    // substances tag, expired immediately so the next request re-renders.
    const revalidated = slugs.map((slug) => `/${slug}`);
    for (const path of revalidated) {
      revalidatePath(path);
    }
    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.substances, { expire: 0 });

    return NextResponse.json({ ok: true, revalidated });
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to revalidate article paths via Next route:", error);
    return NextResponse.json({ error: "Unable to revalidate right now." }, { status: 500 });
  }
}

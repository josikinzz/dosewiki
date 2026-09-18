/**
 * Publication receiver: the endpoint a public deployment exposes so an
 * editorial write on the editor deployment can refresh it immediately.
 *
 * Next cache invalidation is project-local, so without this route a saved
 * article stays stale on dose.wiki and effectindex.com until their own
 * interval elapses. This route closes that gap without giving the public
 * projects any editorial capability:
 *
 *   POST /api/public-cache/revalidate
 *   x-dosewiki-publication-signature: <hex hmac of the exact body>
 *   { "version": 2, "source": "save-article", "issuedAt": 1757260000000,
 *     "dispatchId": "abc12345", "targets": [{ "kind": "article", "slug": "2c-b" }] }
 *   -> { ok: true, dispatchId, applied: { paths: [...], tags: [...] } }
 *
 * It accepts content identities only. Tags and route paths are derived here
 * from the shared contract, so a caller cannot name a tag, a URL or a path of
 * its own. The only authority the shared secret grants is cache expiry, which
 * makes the next read fetch current Postgres data; it can never publish content
 * or restore an older revision, so a duplicate or out-of-order delivery is
 * harmless by construction.
 *
 * Reachable on the public hosts only. Middleware requires an editor session
 * for every non-bootstrap path on the editor hosts, and the editor deployment
 * invalidates its own caches inline, so it never needs to receive.
 */
import { after, NextResponse } from "next/server";
import {
  PUBLICATION_SIGNAL_MAX_BODY_BYTES,
  PUBLICATION_SIGNATURE_HEADER,
  parsePublicationSignal,
} from "@server/next/publicationWire";
import { resolvePublicationEffects } from "@server/next/publicCacheContract";
import { applyPublicCacheLocally } from "@server/next/publishPublicCache";
import {
  getPublicationSecret,
  verifyPublicationSignature,
} from "@server/next/publicationSignature";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getPublicSubstanceLookup } from "@server/data/publicData";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { getSubstanceRouteAlias } from "@server/next/substanceRouteAliases";
import { isPublicHost } from "@server/next/publicHostPolicy";
import {
  summarizeWarmResults,
  warmUrls,
} from "../../../../../scripts/deploy/warm-public-routes.lib.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const maxDuration = 120;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicProxyRead");
  if (rateLimited) return rateLimited;

  const secret = getPublicationSecret();
  if (!secret) {
    // Fail closed: an unconfigured deployment must not accept unsigned refreshes.
    return NextResponse.json(
      { ok: false, error: "publication_unconfigured" },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  const body = await request.text();
  if (body.length > PUBLICATION_SIGNAL_MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "body_too_large" },
      { status: 413, headers: PRIVATE_HEADERS },
    );
  }
  if (
    !verifyPublicationSignature(
      body,
      request.headers.get(PUBLICATION_SIGNATURE_HEADER),
      secret,
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }

  const parsed = parsePublicationSignal(parsedBody);
  if (parsed.status === "refused") {
    // A refusal is explicit so the editor's receipt shows an unrefreshed target
    // instead of reporting a delivery that expired nothing.
    return NextResponse.json(
      { ok: false, error: parsed.reason },
      {
        status: parsed.reason === "stale_signal" ? 409 : 400,
        headers: PRIVATE_HEADERS,
      },
    );
  }

  const { signal } = parsed;
  applyPublicCacheLocally({ targets: signal.targets, source: signal.source });
  const applied = resolvePublicationEffects(signal.targets);

  const requestUrl = new URL(request.url);
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    requestUrl.protocol === "http:" &&
    (requestUrl.hostname === "localhost" ||
      requestUrl.hostname === "127.0.0.1") &&
    requestUrl.username === "" &&
    requestUrl.password === "";
  const allowedPublicOrigin =
    requestUrl.protocol === "https:" &&
    (requestUrl.port === "" || requestUrl.port === "443") &&
    requestUrl.username === "" &&
    requestUrl.password === "" &&
    isPublicHost(requestUrl.hostname);
  const warmCandidates = signal.targets.filter(
    (target) =>
      target.kind === "article" || target.kind === "article-translation",
  );
  const warming =
    allowedPublicOrigin || localDevelopment
      ? { status: "scheduled" as const, candidates: warmCandidates.length }
      : {
          status: "skipped" as const,
          candidates: warmCandidates.length,
          reason: "receiver_origin_not_allowed",
        };

  if ((allowedPublicOrigin || localDevelopment) && warmCandidates.length > 0) {
    after(async () => {
      const warmingStartedAt = Date.now();
      try {
        const publicSlugs = new Set(
          (await getPublicSubstanceLookup()).map(({ slug }) => slug),
        );
        const warmTargets = [
          ...new Set(
            warmCandidates.flatMap((target) => {
              if (
                !publicSlugs.has(target.slug) ||
                getSubstanceRouteAlias(target.slug)
              )
                return [];
              if (target.kind === "article") {
                return [
                  new URL(`/${target.slug}`, requestUrl.origin).toString(),
                ];
              }
              const locale = Object.values(LIVE_LOCALES).find(
                ({ code }) => code === target.locale,
              );
              return locale
                ? [
                    new URL(
                      `${locale.pathPrefix}/${target.slug}`,
                      requestUrl.origin,
                    ).toString(),
                  ]
                : [];
            }),
          ),
        ];
        const warmed = await warmUrls(warmTargets, {
          concurrency: 4,
          timeoutMs: 3_000,
          retries: 0,
          deadlineAt: warmingStartedAt + 100_000,
          headers: { "user-agent": "dosewiki-publication-warm/1.0" },
        });
        console.info("[public-cache] publication:warming-complete", {
          dispatchId: signal.dispatchId,
          planned: warmTargets.length,
          ...summarizeWarmResults(warmed.results, {
            slowest: 4,
            totalMs: Date.now() - warmingStartedAt,
            remaining: warmed.remaining,
          }),
        });
      } catch (error) {
        console.error("[public-cache] publication:warming-failed", {
          dispatchId: signal.dispatchId,
          error: error instanceof Error ? error.message : "warming failed",
        });
      }
    });
  }

  console.info("[public-cache] publication:applied", {
    dispatchId: signal.dispatchId,
    source: signal.source,
    targets: signal.targets.length,
    tags: applied.tags.length,
  });

  return NextResponse.json(
    {
      ok: true,
      dispatchId: signal.dispatchId,
      applied: {
        paths: applied.paths.map((entry) => entry.path),
        tags: applied.tags,
      },
      warming,
    },
    { headers: PRIVATE_HEADERS },
  );
}

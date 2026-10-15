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

async function refuseUnverified(
  request: Request,
  error: string,
  status: number,
) {
  const rateLimited = await enforceRateLimit(request, "publicProxyRead");
  if (rateLimited) return rateLimited;
  return NextResponse.json(
    { ok: false, error },
    { status, headers: PRIVATE_HEADERS },
  );
}

export async function POST(request: Request) {
  const secret = getPublicationSecret();
  if (!secret) {
    return refuseUnverified(request, "publication_unconfigured", 503);
  }

  const signature = request.headers.get(PUBLICATION_SIGNATURE_HEADER);
  if (!signature) {
    return refuseUnverified(request, "invalid_signature", 401);
  }

  const body = await request.text();
  if (body.length > PUBLICATION_SIGNAL_MAX_BODY_BYTES) {
    return refuseUnverified(request, "body_too_large", 413);
  }
  if (!verifyPublicationSignature(body, signature, secret)) {
    return refuseUnverified(request, "invalid_signature", 401);
  }

  const rateLimited = await enforceRateLimit(
    request,
    "publicationSignalVerified",
    { keySuffix: `${new URL(request.url).pathname}:verified` },
  );
  if (rateLimited) return rateLimited;

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

/**
 * `POST /api/subscribe`: the Next replacement for the `POST /subscribe` Convex
 * HTTP action in `convex/http.ts` (ticket 16). Same body contract, same
 * allowed-origin policy, same two rate limits, same HMAC IP hashing, and the
 * same generic `{ ok: true }` for subscribed, duplicate, and spam so the
 * endpoint never enumerates addresses or reveals the honeypot.
 *
 * `mailingList:subscribe` is an internal mutation, which a Convex HTTP client
 * cannot invoke without a deploy key, so the route only runs it in-process on
 * the Postgres backend. On the Convex backend it forwards the validated request
 * to the deployment's HTTP action, which still owns the durable limiter there.
 * `next.config.ts` rewrites `/subscribe` here so the public sites only swap the
 * origin at cutover.
 */
import { isDataWriteFreezeActive } from "@server/runtime/dataWriteFreeze";
import { makeFunctionReference } from "convex/server";
import { getConvexDeploymentName, getPrivilegedWriteTarget } from "@server/convex/runtimeTargets";
import { getPublicIntakeWriteCapability } from "@server/convex/serverWriteCapability";
import { getClientIp } from "@server/http/nextRateLimit";
import { getDataBackend } from "@server/postgres/runtime/backend";
import {
  SUBSCRIBE_RATE_LIMITS,
  corsPreflightHeaders,
  corsResponseHeaders,
  createSubscribeRateLimiter,
  hashClientIp,
  isAllowedOrigin,
  parseSubscribeBody,
  type MailingList,
} from "./subscribePolicy";

/** The internal intake mutation the Convex HTTP action ran, referenced by name as `convex/publicationDelivery.ts` does. */
const subscribeMutation = makeFunctionReference<"mutation", {
  email: string; list: MailingList; honeypotTriggered: boolean; ipHash?: string; userAgent?: string;
}, "subscribed" | "duplicate" | "spam" | "invalid">("mailingList:subscribe");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

const rateLimiter = createSubscribeRateLimiter(SUBSCRIBE_RATE_LIMITS);

function respond(origin: string, ok: boolean, status: number): Response {
  return new Response(JSON.stringify({ ok }), { status, headers: { ...JSON_HEADERS, ...corsResponseHeaders(origin) } });
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsPreflightHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(origin, false, 400);
  }
  const parsed = parseSubscribeBody(body);
  if (!parsed) return respond(origin, false, 400);

  const clientIp = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;

  // The Convex forward bypasses `serverWriteCapability`, so the freeze must be
  // honoured here or a frozen window still writes into Convex (manifest, s7).
  if (isDataWriteFreezeActive()) return respond(origin, false, 503);

  if (getDataBackend() !== "postgres") {
    return forwardToConvexAction(origin, parsed, clientIp, userAgent);
  }

  if (!rateLimiter.limit("subscribePerIp", clientIp).ok) return respond(origin, false, 429);
  if (!rateLimiter.limit("subscribeGlobal").ok) return respond(origin, false, 429);

  const capability = getPublicIntakeWriteCapability();
  if (!capability) return respond(origin, false, 503);

  const outcome = await capability.client.mutationAsService(subscribeMutation, {
    email: parsed.email,
    list: parsed.list,
    honeypotTriggered: typeof parsed.website === "string" && parsed.website.trim().length > 0,
    ipHash: hashClientIp(clientIp, process.env.MAILING_LIST_IP_HASH_SECRET),
    userAgent,
  });

  return respond(origin, outcome !== "invalid", outcome === "invalid" ? 400 : 200);
}

/** The deployment's HTTP-actions origin (`.convex.site`), never the client origin. */
function getConvexSiteUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const deployment = getConvexDeploymentName(getPrivilegedWriteTarget().selectedUrl);
  return deployment ? `https://${deployment}.convex.site` : null;
}

async function forwardToConvexAction(
  origin: string,
  parsed: { email: string; list: string; website: unknown },
  clientIp: string,
  userAgent: string | undefined,
): Promise<Response> {
  const siteUrl = getConvexSiteUrl();
  if (!siteUrl) return respond(origin, false, 503);
  let upstream: Response;
  try {
    upstream = await fetch(`${siteUrl}/subscribe`, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        Origin: origin,
        "X-Forwarded-For": clientIp,
        ...(userAgent ? { "User-Agent": userAgent } : {}),
      },
      body: JSON.stringify({ email: parsed.email, list: parsed.list, website: parsed.website }),
      cache: "no-store",
    });
  } catch {
    return respond(origin, false, 502);
  }
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...JSON_HEADERS, ...corsResponseHeaders(origin) },
  });
}

/**
 * `POST /api/subscribe`: the Next replacement for the `POST /subscribe` Postgres
 * HTTP action in `server/http.ts`. Same body contract, same
 * allowed-origin policy, same two rate limits, same HMAC IP hashing, and the
 * same generic `{ ok: true }` for subscribed, duplicate, and spam so the
 * endpoint never enumerates addresses or reveals the honeypot.
 *
 * The intake mutation runs only on Postgres. A credential-free deployment
 * (Effect Index) forwards to `MAILING_LIST_FORWARD_URL`, the route owning the
 * list. The receiver limits the relay's platform-observed IP, not an unsigned
 * end-user IP header. `next.config.ts` rewrites `/subscribe` here.
 */
import { isIP } from "node:net";
import { isDataWriteFreezeActive } from "@server/runtime/dataWriteFreeze";
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { getPublicIntakeWriteCapability } from "@server/data/serverWriteCapability";
import { getDataBackend, getPostgresClient } from "@server/postgres/runtime/backend";
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

/** The internal intake mutation the Postgres HTTP action ran, referenced by name as `server/publicationDelivery.ts` does. */
const subscribeMutation = makeFunctionReference<"mutation", {
  email: string; list: MailingList; honeypotTriggered: boolean; ipHash?: string; userAgent?: string;
}, "subscribed" | "duplicate" | "spam" | "invalid">("mailingList:subscribe");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;


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

  // Vercel overwrites this header at ingress. Outside that platform, unsigned
  // forwarding headers are not proof of identity: use one conservative bucket.
  // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
  const platformIp = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  const clientIp = platformIp && isIP(platformIp) ? platformIp : "unknown";
  const userAgent = request.headers.get("user-agent") ?? undefined;

  if (isDataWriteFreezeActive()) return respond(origin, false, 503);
  try {
    getDataBackend();
  } catch {
    return respond(origin, false, 503);
  }

  // A credential-free deployment (Effect Index, by invariant) cannot run the
  // mutation in-process; it relays to the deployment that owns the list.
  const forwardUrl = process.env.MAILING_LIST_FORWARD_URL?.trim();
  if (forwardUrl && /^https:\/\/\S+$/.test(forwardUrl)) {
    return forwardSignup(forwardUrl, origin, parsed, userAgent);
  }

  try {
    const capability = getPublicIntakeWriteCapability();
    if (!capability) return respond(origin, false, 503);
    const rateLimiter = createSubscribeRateLimiter(
      SUBSCRIBE_RATE_LIMITS,
      getPostgresClient(),
      process.env.MAILING_LIST_IP_HASH_SECRET ?? "",
    );
    if (!(await rateLimiter.limit("subscribePerIp", clientIp)).ok) return respond(origin, false, 429);
    if (!(await rateLimiter.limit("subscribeGlobal")).ok) return respond(origin, false, 429);

    const outcome = await capability.client.mutationAsService(subscribeMutation, {
      email: parsed.email,
      list: parsed.list,
      honeypotTriggered: typeof parsed.website === "string" && parsed.website.trim().length > 0,
      ipHash: hashClientIp(clientIp, process.env.MAILING_LIST_IP_HASH_SECRET),
      userAgent,
    });

    return respond(origin, outcome !== "invalid", outcome === "invalid" ? 400 : 200);
  } catch {
    // Fail closed without exposing database, credential, or subscription state.
    return respond(origin, false, 503);
  }
}


async function forwardSignup(
  url: string,
  origin: string,
  parsed: { email: string; list: string; website: unknown },
  userAgent: string | undefined,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        Origin: origin,
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

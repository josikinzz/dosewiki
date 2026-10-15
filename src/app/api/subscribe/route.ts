import { isIP } from "node:net";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { isDataWriteFreezeActive } from "@server/runtime/dataWriteFreeze";
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { getPublicIntakeWriteCapability } from "@server/data/serverWriteCapability";
import { getDataBackend, getPostgresClient } from "@server/postgres/runtime/backend";
import {
  SUBSCRIBE_RATE_LIMITS,
  corsPreflightHeaders,
  corsResponseHeaders,
  createSubscribeRateLimiter,
  getRelaySecret,
  hashClientIp,
  isAllowedOrigin,
  parseSubscribeBody,
  readRelayedClientIp,
  signRelayedClientIp,
  type MailingList,
} from "./subscribePolicy";

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

  const platformIp = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  const clientIp = platformIp && isIP(platformIp) ? platformIp : "unknown";
  const userAgent = request.headers.get("user-agent") ?? undefined;

  if (isDataWriteFreezeActive()) return respond(origin, false, 503);
  try {
    getDataBackend();
  } catch {
    return respond(origin, false, 503);
  }

  const forwardUrl = process.env.MAILING_LIST_FORWARD_URL?.trim();
  if (forwardUrl && /^https:\/\/\S+$/.test(forwardUrl)) {
    if (await enforceRateLimit(request, "publicSubscribeRelay", { clientIp })) {
      return respond(origin, false, 429);
    }
    const relaySecret = getRelaySecret();
    const relayHeaders = relaySecret && clientIp !== "unknown" ? signRelayedClientIp(clientIp, relaySecret) : {};
    return forwardSignup(forwardUrl, origin, parsed, userAgent, relayHeaders);
  }

  const relayedIp = readRelayedClientIp(request.headers, getRelaySecret());
  const limitedIp = relayedIp && isIP(relayedIp) ? relayedIp : clientIp;

  try {
    const capability = getPublicIntakeWriteCapability();
    if (!capability) return respond(origin, false, 503);
    const rateLimiter = createSubscribeRateLimiter(
      SUBSCRIBE_RATE_LIMITS,
      getPostgresClient(),
      process.env.MAILING_LIST_IP_HASH_SECRET ?? "",
    );
    if (!(await rateLimiter.limit("subscribePerIp", limitedIp)).ok) return respond(origin, false, 429);
    if (!(await rateLimiter.limit("subscribeGlobal")).ok) return respond(origin, false, 429);

    const outcome = await capability.client.mutationAsService(subscribeMutation, {
      email: parsed.email,
      list: parsed.list,
      honeypotTriggered: typeof parsed.website === "string" && parsed.website.trim().length > 0,
      ipHash: hashClientIp(limitedIp, process.env.MAILING_LIST_IP_HASH_SECRET),
      userAgent,
    });

    return respond(origin, outcome !== "invalid", outcome === "invalid" ? 400 : 200);
  } catch {
    return respond(origin, false, 503);
  }
}


async function forwardSignup(
  url: string,
  origin: string,
  parsed: { email: string; list: string; website: unknown },
  userAgent: string | undefined,
  relayHeaders: Record<string, string>,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        Origin: origin,
        ...(userAgent ? { "User-Agent": userAgent } : {}),
        ...relayHeaders,
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

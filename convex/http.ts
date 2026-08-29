import { httpRouter } from "convex/server";
import { corsRouter } from "convex-helpers/server/cors";
import { RateLimiter, HOUR, MINUTE } from "@convex-dev/rate-limiter";
import { httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";

const MAILING_LISTS = ["josiekins", "dosewiki", "effectindex", "mindstate"] as const;

type MailingList = (typeof MAILING_LISTS)[number];

/**
 * One shared public signup endpoint for the four sites. List separation is
 * data-level: each frontend hardcodes its own `list` value.
 */
const ALLOWED_ORIGINS = [
  "https://josiekins.xyz",
  "https://www.josiekins.xyz",
  "https://dose.wiki",
  "https://www.dose.wiki",
  "https://dev.dose.wiki",
  "https://effectindex.com",
  "https://www.effectindex.com",
  "https://mindstate.design",
  "https://www.mindstate.design",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
];

const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Per-IP: ~5 signups per 10 minutes, small burst allowance.
  subscribePerIp: { kind: "token bucket", rate: 5, period: 10 * MINUTE, capacity: 3 },
  // Global backstop across all four sites.
  subscribeGlobal: { kind: "fixed window", rate: 200, period: HOUR },
});

const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const OK_RESPONSE = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
const FAIL_RESPONSE = (status: number) =>
  new Response(JSON.stringify({ ok: false }), { status, headers: JSON_HEADERS });

const subscribeHandler = httpAction(async (ctx, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return FAIL_RESPONSE(400);
  }
  if (typeof body !== "object" || body === null) {
    return FAIL_RESPONSE(400);
  }

  const { email, list, website } = body as Record<string, unknown>;
  if (typeof email !== "string" || !(MAILING_LISTS as readonly unknown[]).includes(list)) {
    return FAIL_RESPONSE(400);
  }

  // Convex fronts every request with a proxy, so the first x-forwarded-for
  // entry is the client, mirroring getClientIp in src/server/http.
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const perIp = await rateLimiter.limit(ctx, "subscribePerIp", { key: clientIp });
  if (!perIp.ok) {
    return FAIL_RESPONSE(429);
  }
  const global = await rateLimiter.limit(ctx, "subscribeGlobal");
  if (!global.ok) {
    return FAIL_RESPONSE(429);
  }

  const outcome = await ctx.runMutation(internal.mailingList.subscribe, {
    email,
    list: list as MailingList,
    honeypotTriggered: typeof website === "string" && website.trim().length > 0,
    ipHash: await hashClientIp(clientIp),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  // "subscribed", "duplicate", and "spam" all answer the same generic 200 so
  // the endpoint never enumerates existing addresses or reveals the honeypot.
  return outcome === "invalid" ? FAIL_RESPONSE(400) : OK_RESPONSE();
});

/**
 * Keyed sha256 in the repo's `sha256:<hex>` format (see hashIpAddress in
 * src/features/reports/submissions/tripReportSubmissions.ts). Without the
 * MAILING_LIST_IP_HASH_SECRET Convex env var no hash is stored, matching the
 * optional ip_hash convention of the other intake tables.
 */
async function hashClientIp(clientIp: string): Promise<string | undefined> {
  const secret = process.env.MAILING_LIST_IP_HASH_SECRET;
  if (!secret || clientIp === "unknown") {
    return undefined;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(clientIp));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

const http = httpRouter();

const cors = corsRouter(http, {
  allowedOrigins: ALLOWED_ORIGINS,
  allowedHeaders: ["Content-Type"],
  enforceAllowOrigins: true,
});

cors.route({
  path: "/subscribe",
  method: "POST",
  handler: subscribeHandler,
});

export default http;

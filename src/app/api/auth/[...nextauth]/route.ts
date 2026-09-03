import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@auth";
import { enforceRateLimit } from "@server/http/nextRateLimit";

const handler = NextAuth(authOptions);

/**
 * Password-guessing brake for the credentials provider.
 *
 * Scoped deliberately narrow so nothing else about auth changes:
 * only POSTs to the credentials callback are counted, and only above the
 * `authCredentialAttempt` policy (10 per 10 minutes per IP). Session polling
 * (GET) and sign-out are untouched. The limiter itself fails open to an
 * in-memory counter when Upstash is unavailable, so a rate-limit storage
 * outage can never lock a colleague out.
 *
 * The 429 body is NextAuth-shaped on purpose: `next-auth/react` signIn with
 * `redirect: false` reads `new URL(data.url).searchParams.get("error")`, so a
 * generic `{ error }` body would throw inside the client and strand the form
 * mid-submit. Pointing `url` at `/sign-in?error=RateLimited` flows through the
 * client's existing error handling instead.
 */
const CREDENTIALS_CALLBACK_PATHNAME = "/api/auth/callback/credentials";

type NextAuthRouteContext = {
  params: Promise<{ nextauth: string[] }>;
};

export async function POST(request: Request, context: NextAuthRouteContext) {
  if (new URL(request.url).pathname === CREDENTIALS_CALLBACK_PATHNAME) {
    const limited = await enforceRateLimit(request, "authCredentialAttempt");
    if (limited) {
      return NextResponse.json(
        { url: new URL("/sign-in?error=RateLimited", request.url).toString() },
        {
          status: 429,
          headers: {
            "Retry-After": limited.headers.get("Retry-After") ?? "60",
          },
        },
      );
    }
  }

  // `context` must be forwarded verbatim: NextAuth's returned handler
  // dispatches on `res.params` to pick the app-router branch.
  return handler(request, context);
}

export { handler as GET };

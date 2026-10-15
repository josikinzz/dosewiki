import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@auth";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { safeAuthRedirect } from "@/lib/auth/returnPath";

const CREDENTIALS_CALLBACK_PATHNAME = "/api/auth/callback/credentials";

type NextAuthRouteContext = {
  params: Promise<{ nextauth: string[] }>;
};

function handleAuthRequest(request: Request, context: NextAuthRouteContext) {
  const origin = new URL(request.url).origin;
  const handler = NextAuth({
    ...authOptions,
    callbacks: {
      ...authOptions.callbacks,
      async redirect({ url }) {
        return safeAuthRedirect(url, origin);
      },
    },
  });
  return handler(request, context);
}

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

  return handleAuthRequest(request, context);
}

export async function GET(request: Request, context: NextAuthRouteContext) {
  return handleAuthRequest(request, context);
}

import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { authSecret } from "@server/auth/runtimePolicy";

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/dev")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: authSecret,
  });

  const decision = getDevRouteDecision({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    email: token?.email,
    role: token?.role,
  });

  if (decision.type === "sign-in") {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", decision.callbackUrl);
    return NextResponse.redirect(signInUrl);
  }

  if (decision.type === "unauthorized") {
    const unauthorizedUrl = new URL("/unauthorized", request.url);
    unauthorizedUrl.searchParams.set("from", decision.from);
    return NextResponse.redirect(unauthorizedUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

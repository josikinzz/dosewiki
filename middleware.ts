import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const authSecret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "development" ? "dosewiki-next-auth-development-secret" : undefined);

function isAppRole(value: unknown): value is "admin" | "editor" | "viewer" {
  return value === "admin" || value === "editor" || value === "viewer";
}

function canAccessDev(role: "admin" | "editor" | "viewer" | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/dev")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: authSecret,
  });

  const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (!token?.email) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(signInUrl);
  }

  const role = isAppRole(token.role) ? token.role : null;

  if (!canAccessDev(role)) {
    const unauthorizedUrl = new URL("/unauthorized", request.url);
    unauthorizedUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(unauthorizedUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dev/:path*"],
};

import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { authSecret } from "@server/auth/runtimePolicy";

const PUBLIC_CONSTRUCTION_HOSTS = new Set(["dose.wiki", "www.dose.wiki"]);
const PUBLIC_CONSTRUCTION_ALLOWED_PATHS = new Set([
  "/",
  "/apple-touch-icon.png",
  "/dosewiki-logo.png",
  "/embed-logo.webp",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
]);

function isPublicConstructionHost(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  return PUBLIC_CONSTRUCTION_HOSTS.has(host);
}

function isPublicConstructionAllowedPath(pathname: string) {
  return (
    PUBLIC_CONSTRUCTION_ALLOWED_PATHS.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/assets/")
  );
}

export async function middleware(request: NextRequest) {
  if (
    isPublicConstructionHost(request) &&
    !isPublicConstructionAllowedPath(request.nextUrl.pathname)
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

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

import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { authSecret } from "@server/auth/runtimePolicy";

const publicUnderConstructionHosts = new Set(["dose.wiki", "www.dose.wiki"]);

const publicAssetPathPattern = /\.(?:avif|gif|ico|jpg|jpeg|png|svg|webp|woff|woff2)$/i;

function getRequestHostname(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host;
  const firstHost = host.split(",")[0]?.trim() ?? "";

  return firstHost.replace(/:\d+$/, "").toLowerCase();
}

function isPublicUnderConstructionHost(request: NextRequest) {
  return publicUnderConstructionHosts.has(getRequestHostname(request));
}

function isRequiredPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.svg" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/manifest.webmanifest" ||
    publicAssetPathPattern.test(pathname)
  );
}

function getPublicUnderConstructionResponse(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/" || isRequiredPublicAsset(pathname)) {
    return null;
  }

  if (pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method)) {
    return new NextResponse(null, { status: 404 });
  }

  const homeUrl = request.nextUrl.clone();
  homeUrl.pathname = "/";
  homeUrl.search = "";
  return NextResponse.redirect(homeUrl);
}

export async function middleware(request: NextRequest) {
  if (isPublicUnderConstructionHost(request)) {
    const publicResponse = getPublicUnderConstructionResponse(request);

    if (publicResponse) {
      return publicResponse;
    }
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

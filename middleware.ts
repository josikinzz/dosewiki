import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { authSecret } from "@server/auth/runtimePolicy";
import {
  isPublicConstructionAllowedPath,
  isPublicConstructionHost,
} from "@server/next/publicConstructionPolicy";
import { getSubstanceRouteAlias } from "@server/next/substanceRouteAliases";

function getSubstanceAliasRedirectUrl(request: NextRequest): URL | null {
  const slug = request.nextUrl.pathname.replace(/^\/|\/$/g, "");

  if (!slug || slug.includes("/")) {
    return null;
  }

  const aliasTarget = getSubstanceRouteAlias(slug);

  if (!aliasTarget) {
    return null;
  }

  const targetUrl = request.nextUrl.clone();
  targetUrl.pathname = `/${aliasTarget}`;
  return targetUrl;
}

function getLegacySearchRedirectUrl(request: NextRequest): URL | null {
  const match = request.nextUrl.pathname.match(/^\/search\/([^/]+)\/?$/);

  if (!match) {
    return null;
  }

  let query = match[1];

  try {
    query = decodeURIComponent(query);
  } catch {
    // Keep the raw segment if it is malformed; URLSearchParams will escape it.
  }

  const targetUrl = request.nextUrl.clone();
  targetUrl.pathname = "/search";
  targetUrl.search = "";

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    targetUrl.searchParams.set("q", trimmedQuery);
  }

  return targetUrl;
}

export async function middleware(request: NextRequest) {
  if (isPublicConstructionHost(request.headers.get("host"))) {
    if (request.nextUrl.pathname === "/") {
      return NextResponse.rewrite(new URL("/under-construction", request.url));
    }

    if (!isPublicConstructionAllowedPath(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  const legacySearchRedirectUrl = getLegacySearchRedirectUrl(request);

  if (legacySearchRedirectUrl) {
    return NextResponse.redirect(legacySearchRedirectUrl, 308);
  }

  const substanceAliasRedirectUrl = getSubstanceAliasRedirectUrl(request);

  if (substanceAliasRedirectUrl) {
    return NextResponse.redirect(substanceAliasRedirectUrl, 308);
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

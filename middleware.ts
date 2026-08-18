import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDevRouteDecision, isPublicDevRoutePath } from "@/lib/auth/roles";
import { authSecret } from "@server/auth/runtimePolicy";
import {
  isPublicConstructionAllowedPath,
  isPublicConstructionHost,
} from "@server/next/publicConstructionPolicy";
import {
  CSP_ENFORCEMENT_HEADER,
  CSP_NONCE_REQUEST_HEADER,
  getBrowserSecurityHeaders,
  shouldApplyDocumentCsp,
} from "@server/next/cspObservationPolicy";
import {
  FLAVOR_GATED_NOT_FOUND_PATH,
  isFlavorGatedRequestPath,
} from "@server/next/flavorGatedRoutes";
import { getReplicationRouteAlias } from "@server/next/publicRouteAliases";
import { getSubstanceRouteAlias } from "@server/next/substanceRouteAliases";

function getBrowserPolicyContext(request: NextRequest) {
  const isDevRoute = request.nextUrl.pathname.startsWith("/dev");
  const nonce = isDevRoute ? crypto.randomUUID() : undefined;
  const responseHeaders = getBrowserSecurityHeaders({
    host: request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    nonce,
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.VITE_CONVEX_URL,
    isDevelopment: process.env.NODE_ENV !== "production",
  });
  const requestHeaders = new Headers(request.headers);
  const csp = responseHeaders.find((header) => header.key === CSP_ENFORCEMENT_HEADER)?.value;
  const appliesDocumentCsp = shouldApplyDocumentCsp(request.nextUrl.pathname);

  requestHeaders.delete(CSP_NONCE_REQUEST_HEADER);

  if (!csp) {
    throw new Error("Browser security policy did not produce an enforced CSP header.");
  }

  if (appliesDocumentCsp) {
    if (nonce) {
      requestHeaders.set(CSP_NONCE_REQUEST_HEADER, nonce);
    }
    requestHeaders.set(CSP_ENFORCEMENT_HEADER, csp);
  }

  return {
    requestHeaders,
    secure(response: NextResponse): NextResponse {
      for (const { key, value } of responseHeaders) {
        if (key === CSP_ENFORCEMENT_HEADER && !appliesDocumentCsp) {
          continue;
        }
        response.headers.set(key, value);
      }
      return response;
    },
  };
}

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

/**
 * Renamed replication slugs, redirected here rather than in the route.
 *
 * `/replications/[slug]` is prerendered with `dynamicParams = false`, and a
 * `permanentRedirect()` from inside a prerendered page renders the not-found
 * body at HTTP 200 instead of emitting a redirect — a soft 404 on exactly the
 * links we renamed. Middleware answers before routing, the same way substance
 * aliases already do.
 */
function getReplicationAliasRedirectUrl(request: NextRequest): URL | null {
  const match = request.nextUrl.pathname.match(/^\/replications\/([^/]+)\/?$/);

  if (!match) {
    return null;
  }

  const aliasTarget = getReplicationRouteAlias(decodeURIComponent(match[1]));

  if (!aliasTarget) {
    return null;
  }

  const targetUrl = request.nextUrl.clone();
  targetUrl.pathname = `/replications/${aliasTarget}`;
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
  const browserPolicy = getBrowserPolicyContext(request);

  // Flavor gate first: a route this publication does not own must answer a real 404, and
  // a prerendered page's own `notFound()` cannot set the status on a static response.
  if (isFlavorGatedRequestPath(request.nextUrl.pathname)) {
    return browserPolicy.secure(
      NextResponse.rewrite(new URL(FLAVOR_GATED_NOT_FOUND_PATH, request.url), {
        request: { headers: browserPolicy.requestHeaders },
      }),
    );
  }

  if (isPublicConstructionHost(request.headers.get("host"))) {
    if (request.nextUrl.pathname === "/") {
      return browserPolicy.secure(
        NextResponse.rewrite(new URL("/under-construction", request.url), {
          request: { headers: browserPolicy.requestHeaders },
        }),
      );
    }

    if (!isPublicConstructionAllowedPath(request.nextUrl.pathname)) {
      return browserPolicy.secure(NextResponse.redirect(new URL("/", request.url)));
    }
  }

  const legacySearchRedirectUrl = getLegacySearchRedirectUrl(request);

  if (legacySearchRedirectUrl) {
    return browserPolicy.secure(NextResponse.redirect(legacySearchRedirectUrl, 308));
  }

  const substanceAliasRedirectUrl = getSubstanceAliasRedirectUrl(request);

  if (substanceAliasRedirectUrl) {
    return browserPolicy.secure(NextResponse.redirect(substanceAliasRedirectUrl, 308));
  }

  const replicationAliasRedirectUrl = getReplicationAliasRedirectUrl(request);

  if (replicationAliasRedirectUrl) {
    return browserPolicy.secure(NextResponse.redirect(replicationAliasRedirectUrl, 308));
  }

  if (!request.nextUrl.pathname.startsWith("/dev")) {
    return browserPolicy.secure(
      NextResponse.next({ request: { headers: browserPolicy.requestHeaders } }),
    );
  }

  if (isPublicDevRoutePath(request.nextUrl.pathname)) {
    return browserPolicy.secure(
      NextResponse.next({ request: { headers: browserPolicy.requestHeaders } }),
    );
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
    return browserPolicy.secure(NextResponse.redirect(signInUrl));
  }

  if (decision.type === "unauthorized") {
    const unauthorizedUrl = new URL("/unauthorized", request.url);
    unauthorizedUrl.searchParams.set("from", decision.from);
    return browserPolicy.secure(NextResponse.redirect(unauthorizedUrl));
  }

  return browserPolicy.secure(
    NextResponse.next({ request: { headers: browserPolicy.requestHeaders } }),
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { authSecret } from "@server/auth/runtimePolicy";
import {
  isConstructionPreviewBlockedPath,
  isPublicConstructionAllowedPath,
  isPublicConstructionHost,
  normalizeHost,
} from "@server/next/publicConstructionPolicy";
import {
  PREVIEW_HOME_PATH,
  stripPreviewPrefix,
  toPreviewPath,
} from "@/utils/previewPath";
import { isEffectIndex } from "@/config/siteFlavor";
import {
  CSP_ENFORCEMENT_HEADER,
  CSP_NONCE_REQUEST_HEADER,
  getBrowserSecurityHeaders,
  shouldApplyDocumentCsp,
  type ResponseHeader,
} from "@server/next/cspObservationPolicy";
import {
  FLAVOR_GATED_NOT_FOUND_PATH,
  isFlavorGatedRequestPath,
} from "@server/next/flavorGatedRoutes";
import { getReplicationRouteAlias } from "@server/next/publicRouteAliases";
import { getSubstanceRouteAlias } from "@server/next/substanceRouteAliases";

// Both are build-time constants (Next inlines `process.env` reads in Edge middleware), so
// they are resolved once here instead of per request.
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.VITE_CONVEX_URL;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

type BrowserSecurityHeaderSet = {
  responseHeaders: ResponseHeader[];
  csp: string;
};

/**
 * Public (non-/dev) security headers depend on the request only through the normalized
 * host — the nonce is /dev-only and `pathname` feeds nothing but that /dev branch — so the
 * built header set is cached per host instead of being reassembled on every request.
 *
 * The Host header is attacker-controlled, so the cache is bounded: past the cap, unknown
 * hosts still get correct headers, they just pay the rebuild. The legitimate host set
 * (dose.wiki, www, the admin Vercel host, localhost) is far below the cap.
 */
const publicHeadersByHost = new Map<string, BrowserSecurityHeaderSet>();
const PUBLIC_HEADER_CACHE_LIMIT = 16;

function getPublicSecurityHeaderSet(host: string | null): BrowserSecurityHeaderSet {
  const cacheKey = normalizeHost(host);
  const cached = publicHeadersByHost.get(cacheKey);

  if (cached) {
    return cached;
  }

  const responseHeaders = getBrowserSecurityHeaders({
    host,
    // Any non-/dev pathname produces the same policy; "/" stands in for all of them.
    pathname: "/",
    nonce: undefined,
    convexUrl: CONVEX_URL,
    isDevelopment: IS_DEVELOPMENT,
  });
  const csp = responseHeaders.find((header) => header.key === CSP_ENFORCEMENT_HEADER)?.value;

  if (!csp) {
    throw new Error("Browser security policy did not produce an enforced CSP header.");
  }

  const headerSet: BrowserSecurityHeaderSet = { responseHeaders, csp };

  if (publicHeadersByHost.size < PUBLIC_HEADER_CACHE_LIMIT) {
    publicHeadersByHost.set(cacheKey, headerSet);
  }

  return headerSet;
}

/**
 * `appPath` is the route the request addresses, which is not `request.nextUrl.pathname`
 * under the `/preview` prefix. The policy split is by route kind — /dev gets the strict
 * nonce policy, `/api/*` gets no document CSP at all — so it has to read the resolved
 * path or `/preview/api/...` would be handed a document policy it is not a document for.
 */
function getBrowserPolicyContext(request: NextRequest, appPath: string) {
  const pathname = appPath;
  const isDevRoute = pathname.startsWith("/dev");
  let nonce: string | undefined;
  let headerSet: BrowserSecurityHeaderSet;

  if (isDevRoute) {
    // The /dev CSP embeds a fresh nonce, so this variant stays per-request by design.
    nonce = crypto.randomUUID();
    const responseHeaders = getBrowserSecurityHeaders({
      host: request.headers.get("host"),
      pathname,
      nonce,
      convexUrl: CONVEX_URL,
      isDevelopment: IS_DEVELOPMENT,
    });
    const csp = responseHeaders.find(
      (header) => header.key === CSP_ENFORCEMENT_HEADER,
    )?.value;

    if (!csp) {
      throw new Error("Browser security policy did not produce an enforced CSP header.");
    }

    headerSet = { responseHeaders, csp };
  } else {
    headerSet = getPublicSecurityHeaderSet(request.headers.get("host"));
  }

  const requestHeaders = new Headers(request.headers);
  const appliesDocumentCsp = shouldApplyDocumentCsp(pathname);

  requestHeaders.delete(CSP_NONCE_REQUEST_HEADER);

  if (appliesDocumentCsp) {
    if (nonce) {
      requestHeaders.set(CSP_NONCE_REQUEST_HEADER, nonce);
    }
    requestHeaders.set(CSP_ENFORCEMENT_HEADER, headerSet.csp);
  }

  return {
    requestHeaders,
    secure(response: NextResponse): NextResponse {
      for (const { key, value } of headerSet.responseHeaders) {
        if (key === CSP_ENFORCEMENT_HEADER && !appliesDocumentCsp) {
          continue;
        }
        response.headers.set(key, value);
      }
      return response;
    },
  };
}

function getSubstanceAliasRedirectUrl(request: NextRequest, appPath: string): URL | null {
  const slug = appPath.replace(/^\/|\/$/g, "");

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
function getReplicationAliasRedirectUrl(request: NextRequest, appPath: string): URL | null {
  const match = appPath.match(/^\/replications\/([^/]+)\/?$/);

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

function getLegacySearchRedirectUrl(request: NextRequest, appPath: string): URL | null {
  const match = appPath.match(/^\/search\/([^/]+)\/?$/);

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
  const requestPath = request.nextUrl.pathname;
  // `null` for an ordinary address; otherwise the route `/preview/...` mirrors. The
  // prefix belongs to the dose.wiki construction gate: Effect Index is a launched site
  // with nothing to hold back, so on that build `/preview/...` is just an unknown path.
  const previewAppPath = isEffectIndex() ? null : stripPreviewPrefix(requestPath);
  const isPreviewRequest = previewAppPath !== null;
  const appPath = previewAppPath ?? requestPath;
  const browserPolicy = getBrowserPolicyContext(request, appPath);
  const inPreviewSpace = (targetUrl: URL): URL => {
    if (isPreviewRequest) {
      targetUrl.pathname = toPreviewPath(targetUrl.pathname);
    }
    return targetUrl;
  };

  // Flavor gate first: a route this publication does not own must answer a real 404, and
  // a prerendered page's own `notFound()` cannot set the status on a static response.
  if (isFlavorGatedRequestPath(appPath)) {
    return browserPolicy.secure(
      NextResponse.rewrite(new URL(FLAVOR_GATED_NOT_FOUND_PATH, request.url), {
        request: { headers: browserPolicy.requestHeaders },
      }),
    );
  }

  // The editor, the workbench and sign-in have no preview address on any host.
  if (isPreviewRequest && isConstructionPreviewBlockedPath(appPath)) {
    return browserPolicy.secure(
      NextResponse.redirect(new URL(PREVIEW_HOME_PATH, request.url)),
    );
  }

  if (isPublicConstructionHost(request.headers.get("host")) && !isPreviewRequest) {
    if (requestPath === "/") {
      return browserPolicy.secure(
        NextResponse.rewrite(new URL("/under-construction", request.url), {
          request: { headers: browserPolicy.requestHeaders },
        }),
      );
    }

    if (!isPublicConstructionAllowedPath(requestPath)) {
      // Everything the finished site serves lives under `/preview` on these hosts, so a
      // bare address is bounced into the prefix rather than back to the landing page.
      // That is what lets an unprefixed in-page `<Link>` keep working inside preview.
      // The gated surfaces still land on the holding page, as they always did.
      const gateTarget = isConstructionPreviewBlockedPath(requestPath)
        ? new URL("/", request.url)
        : new URL(`${toPreviewPath(requestPath)}${request.nextUrl.search}`, request.url);

      return browserPolicy.secure(NextResponse.redirect(gateTarget));
    }
  }

  const legacySearchRedirectUrl = getLegacySearchRedirectUrl(request, appPath);

  if (legacySearchRedirectUrl) {
    return browserPolicy.secure(
      NextResponse.redirect(inPreviewSpace(legacySearchRedirectUrl), 308),
    );
  }

  const substanceAliasRedirectUrl = getSubstanceAliasRedirectUrl(request, appPath);

  if (substanceAliasRedirectUrl) {
    return browserPolicy.secure(
      NextResponse.redirect(inPreviewSpace(substanceAliasRedirectUrl), 308),
    );
  }

  const replicationAliasRedirectUrl = getReplicationAliasRedirectUrl(request, appPath);

  if (replicationAliasRedirectUrl) {
    return browserPolicy.secure(
      NextResponse.redirect(inPreviewSpace(replicationAliasRedirectUrl), 308),
    );
  }

  // The prefix is an address, not a route tree: the request is rewritten onto the page it
  // mirrors, so the browser keeps `/preview/...` while Next renders the ordinary route.
  if (isPreviewRequest) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = appPath;

    return browserPolicy.secure(
      NextResponse.rewrite(rewriteUrl, { request: { headers: browserPolicy.requestHeaders } }),
    );
  }

  if (!request.nextUrl.pathname.startsWith("/dev")) {
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
  // Everything middleware does is for documents and API routes: the CSP + security headers
  // are a document concern, the alias/legacy-search redirects target page paths, and the
  // metadata routes (manifest/sitemap, plus favicon files) need no CSP on their non-HTML
  // bodies and are already construction-allowlisted. So presentation assets are excluded
  // by extension — every image/font/style/media extension that appears under `public/`.
  // `json` and `txt` are deliberately NOT excluded: the construction gate on dose.wiki/www
  // must keep fronting the open-data dumps (/SubstanceIndex.json, /open-data/*, /llms.txt)
  // until launch, and their exclusion would let those hosts serve them. Matchers must be
  // static literals, hence the spelled-out alternation.
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|xml|webmanifest|woff2?|zip|md|mp3|ogg|afdesign)$).*)",
  ],
};

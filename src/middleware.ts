import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { authSecret } from "@server/auth/runtimePolicy";
import {
  getEditorHandoffUrl,
  isPublicHost,
  isPublicRestrictedPath,
  normalizeHost,
} from "@server/next/publicHostPolicy";
import { stripPreviewPrefix } from "@/utils/previewPath";
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
import { isUnavailablePublicDynamicPath, publicSubstanceSlugForPath } from "@server/next/publicRouteAvailability";
import { localeForHost, localeForPathPrefix, localizedArticleRoutePath, localizedIndexRoutePath, localizedNotFoundRoutePath, localizedRecordRoutePath, localizedReplicationViewerRoutePath } from "@server/next/localeHostPolicy";
import {
  getReplicationArtistRouteAlias,
  getReplicationRouteAlias,
} from "@server/next/publicRouteAliases";
import { getSubstanceRouteAlias } from "@server/next/substanceRouteAliases";
import {
  getEditorDeliveryDecision,
  isEditorAuthBootstrapPath,
  isEditorBootstrapAsset,
  isPresentationAsset,
  PRIVATE_CACHE_HEADERS,
} from "@server/next/editorDeliveryPolicy";
import { isReplicationEmbedPath } from "@server/next/replicationEmbedPolicy";

// Next resolves these environment reads for the deployment's Edge middleware.
const R2_UPLOAD_ORIGIN = process.env.NEXT_PUBLIC_EDITOR_BUILD === "true"
  ? process.env.CLOUDFLARE_R2_S3_ENDPOINT
  : undefined;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

type BrowserSecurityHeaderSet = {
  responseHeaders: ResponseHeader[];
  csp: string;
};

/**
 * Public security headers vary by normalized host and the exact replication embed
 * document policy. Cache those variants separately so a frameable embed response can
 * never weaken the ordinary document policy.
 *
 * The Host header is attacker-controlled, so the cache is bounded: past the cap, unknown
 * hosts still get correct headers, they just pay the rebuild. The legitimate host set
 * (dose.wiki, www, the admin Vercel host, localhost) is far below the cap.
 */
const publicHeadersByHostAndPolicy = new Map<string, BrowserSecurityHeaderSet>();
const PUBLIC_HEADER_CACHE_LIMIT = 16;

function getPublicSecurityHeaderSet(
  host: string | null,
  pathname: string,
): BrowserSecurityHeaderSet {
  const isReplicationEmbed = isReplicationEmbedPath(pathname);
  const cacheKey = `${normalizeHost(host)}|${isReplicationEmbed ? "replication-embed" : "public"}`;
  const cached = publicHeadersByHostAndPolicy.get(cacheKey);

  if (cached) {
    return cached;
  }

  const responseHeaders = getBrowserSecurityHeaders({
    host,
    pathname: isReplicationEmbed ? pathname : "/",
    nonce: undefined,
    isDevelopment: isReplicationEmbed ? process.env.NODE_ENV === "development" : IS_DEVELOPMENT,
  });
  const csp = responseHeaders.find(
    (header) => header.key === CSP_ENFORCEMENT_HEADER,
  )?.value;

  if (!csp) {
    throw new Error(
      "Browser security policy did not produce an enforced CSP header.",
    );
  }

  const headerSet: BrowserSecurityHeaderSet = { responseHeaders, csp };

  if (publicHeadersByHostAndPolicy.size < PUBLIC_HEADER_CACHE_LIMIT) {
    publicHeadersByHostAndPolicy.set(cacheKey, headerSet);
  }

  return headerSet;
}

/**
 * `appPath` is the route the request addresses, which is not `request.nextUrl.pathname`
 * under the `/preview` prefix. The policy split is by route kind — /dev gets the strict
 * nonce policy, `/api/*` gets no document CSP at all — so it has to read the resolved
 * path or `/preview/api/...` would be handed a document policy it is not a document for.
 */
function getBrowserPolicyContext(request: NextRequest, appPath: string, privateResponse = false) {
  const pathname = appPath;
  const isDevRoute = pathname.startsWith("/dev");
  const isPublicReplicationEmbed = !privateResponse
    && request.nextUrl.pathname === pathname
    && isReplicationEmbedPath(pathname);
  let nonce: string | undefined;
  let headerSet: BrowserSecurityHeaderSet;

  if (isDevRoute) {
    // The /dev CSP embeds a fresh nonce, so this variant stays per-request by design.
    nonce = crypto.randomUUID();
    const responseHeaders = getBrowserSecurityHeaders({
      host: request.headers.get("host"),
      pathname,
      nonce,
      r2UploadOrigin: R2_UPLOAD_ORIGIN,
      isDevelopment: IS_DEVELOPMENT,
    });
    const csp = responseHeaders.find(
      (header) => header.key === CSP_ENFORCEMENT_HEADER,
    )?.value;

    if (!csp) {
      throw new Error(
        "Browser security policy did not produce an enforced CSP header.",
      );
    }

    headerSet = { responseHeaders, csp };
  } else {
    headerSet = getPublicSecurityHeaderSet(
      request.headers.get("host"),
      isPublicReplicationEmbed ? pathname : "/",
    );
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
      if (isPublicReplicationEmbed) response.headers.delete("X-Frame-Options");
      for (const { key, value } of headerSet.responseHeaders) {
        if (key === CSP_ENFORCEMENT_HEADER && !appliesDocumentCsp) {
          continue;
        }
        response.headers.set(key, value);
      }
      if (privateResponse) {
        for (const [key, value] of PRIVATE_CACHE_HEADERS) response.headers.set(key, value);
        response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        const vary = new Set((response.headers.get("Vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
        vary.add("Cookie");
        response.headers.set("Vary", [...vary].join(", "));
      }
      return response;
    },
  };
}

function getSubstanceAliasRedirectUrl(
  request: NextRequest,
  appPath: string,
): URL | null {
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
function getReplicationAliasRedirectUrl(
  request: NextRequest,
  appPath: string,
): URL | null {
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

const REPLICATION_VIEWER_ROUTE_PREFIX = "/replications/viewer/";

/**
 * `/replications` is statically prerendered, so its HTML cannot vary on the
 * query string — yet a shared `/replications?viewer=<slug>` link must unfurl
 * with that work's social card. Document requests carrying the param are
 * rewritten to the per-slug ISR route that renders the same page with the
 * right metadata. Client-side navigations (`RSC` header) are left alone so the
 * mounted explorer keeps its route segment while the reader browses. A mirror
 * host lands on its own viewer route so the page renders in its language.
 *
 * The grammar mirrors the viewer param's client parser; the route re-parses
 * the slug and 404s anything the rewrite let through.
 */
function getReplicationViewerRewriteUrl(
  request: NextRequest,
  appPath: string,
): URL | null {
  if (appPath !== "/replications" || request.headers.has("rsc")) {
    return null;
  }

  const viewerSlug = request.nextUrl.searchParams.get("viewer");

  if (!viewerSlug || !/^[a-z0-9][a-z0-9_-]*$/.test(viewerSlug)) {
    return null;
  }

  const mirrorHost = localeForHost(request.headers.get("host"));
  const targetUrl = request.nextUrl.clone();
  targetUrl.pathname = mirrorHost
    ? localizedReplicationViewerRoutePath(mirrorHost, viewerSlug)
    : `${REPLICATION_VIEWER_ROUTE_PREFIX}${viewerSlug}`;
  return targetUrl;
}

function getReplicationArtistAliasRedirectUrl(
  request: NextRequest,
  appPath: string,
): URL | null {
  const match = appPath.match(/^\/replications\/artist\/([^/]+)\/?$/);

  if (!match) {
    return null;
  }

  const aliasTarget = getReplicationArtistRouteAlias(
    decodeURIComponent(match[1]),
  );

  if (!aliasTarget) {
    return null;
  }

  const targetUrl = request.nextUrl.clone();
  targetUrl.pathname = `/replications/artist/${aliasTarget}`;
  return targetUrl;
}

function getLegacySearchRedirectUrl(
  request: NextRequest,
  appPath: string,
): URL | null {
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
  // `/preview/...` was the pre-launch address space. Keep parsing it so old links can
  // redirect to their permanent app paths instead of becoming duplicate content.
  const previewAppPath = isEffectIndex() ? null : stripPreviewPrefix(requestPath);
  const isPreviewRequest = previewAppPath !== null;
  const appPath = previewAppPath ?? requestPath;
  const delivery = getEditorDeliveryDecision({
    host: request.headers.get("host"),
    editorBuild: process.env.NEXT_PUBLIC_EDITOR_BUILD === "true",
    allowedHosts: process.env.DOSEWIKI_EDITOR_ALLOWED_HOSTS,
    development: IS_DEVELOPMENT,
  });
  const browserPolicy = getBrowserPolicyContext(request, appPath, delivery !== "public");

  // Vercel invokes crons on the deployment URL, never a listed host. Those two
  // GETs carry CRON_SECRET and are checked in their handlers, so they pass the
  // host gate; every other request on an unlisted alias or public origin is
  // refused before an editor build serves it.
  const isServiceCron = request.method === "GET"
    && (requestPath === "/api/cron/publication-delivery" || requestPath === "/api/cron/translation-refresh");
  if (delivery === "closed" && !(isServiceCron && process.env.NEXT_PUBLIC_EDITOR_BUILD === "true")) {
    return browserPolicy.secure(new NextResponse("Editor deployment is unavailable.", { status: 503 }));
  }
  // Browser assets contain no credentials or private records. Keep sign-in resources
  // reachable without a session; documents, RSC, and APIs remain authenticated below.
  if (delivery === "public" ? isPresentationAsset(requestPath) : isEditorBootstrapAsset(requestPath)) {
    return browserPolicy.secure(NextResponse.next());
  }
  // These exact requests authenticate their own token in the route handler
  // (a scoped admin token for the revalidation POST, CRON_SECRET for the
  // Vercel crons). All other editor APIs stay behind session auth.
  const isArticleRevalidation = request.method === "POST"
    && requestPath === "/api/dev/revalidate-article";
  if (delivery === "editor" && !isEditorAuthBootstrapPath(appPath) && !isArticleRevalidation && !isServiceCron) {
    const token = await getToken({ req: request, secret: authSecret });
    const decision = getDevRouteDecision({
      pathname: appPath,
      search: request.nextUrl.search,
      email: token?.email,
      role: token?.role,
    });
    if (decision.type !== "allow") {
      if (appPath.startsWith("/api/") || request.headers.get("rsc") === "1" || requestPath.startsWith("/_next/data/")) {
        return browserPolicy.secure(NextResponse.json(
          { error: decision.type === "sign-in" ? "Authentication required" : "Forbidden" },
          { status: decision.type === "sign-in" ? 401 : 403 },
        ));
      }
      const destination = new URL(decision.type === "sign-in" ? "/sign-in" : "/unauthorized", request.url);
      destination.searchParams.set(decision.type === "sign-in" ? "callbackUrl" : "from",
        decision.type === "sign-in" ? decision.callbackUrl : decision.from);
      return browserPolicy.secure(NextResponse.redirect(destination));
    }
  }

  // Flavor gate first: a route this publication does not own must answer a real 404, and
  // a prerendered page's own `notFound()` cannot set the status on a static response.
  if (isFlavorGatedRequestPath(appPath)) {
    return browserPolicy.secure(
      NextResponse.rewrite(new URL(FLAVOR_GATED_NOT_FOUND_PATH, request.url), {
        request: { headers: browserPolicy.requestHeaders },
      }),
    );
  }

  const publicHost = isPublicHost(request.headers.get("host"))
    || process.env.NEXT_PUBLIC_EDITOR_BUILD === "false";
  const editorHandoffUrl = getEditorHandoffUrl(
    appPath,
    request.nextUrl.search,
    publicHost,
  );

  if (editorHandoffUrl) {
    return browserPolicy.secure(NextResponse.redirect(editorHandoffUrl));
  }

  // Authenticated APIs belong to the editor origin. A cross-origin redirect would drop
  // cookies and misreport the caller as signed out, so the public host rejects the path.
  if (publicHost && isPublicRestrictedPath(appPath)) {
    return browserPolicy.secure(NextResponse.redirect(new URL("/", request.url)));
  }

  const legacySearchRedirectUrl = getLegacySearchRedirectUrl(request, appPath);

  if (legacySearchRedirectUrl) {
    return browserPolicy.secure(NextResponse.redirect(legacySearchRedirectUrl, 308));
  }

  const substanceAliasRedirectUrl = getSubstanceAliasRedirectUrl(
    request,
    appPath,
  );

  if (substanceAliasRedirectUrl) {
    return browserPolicy.secure(NextResponse.redirect(substanceAliasRedirectUrl, 308));
  }

  const replicationAliasRedirectUrl = getReplicationAliasRedirectUrl(
    request,
    appPath,
  );

  if (replicationAliasRedirectUrl) {
    return browserPolicy.secure(NextResponse.redirect(replicationAliasRedirectUrl, 308));
  }

  const replicationArtistAliasRedirectUrl =
    getReplicationArtistAliasRedirectUrl(request, appPath);

  if (replicationArtistAliasRedirectUrl) {
    return browserPolicy.secure(
      NextResponse.redirect(replicationArtistAliasRedirectUrl, 301),
    );
  }

  const replicationViewerRewriteUrl = getReplicationViewerRewriteUrl(
    request,
    appPath,
  );

  if (replicationViewerRewriteUrl) {
    return browserPolicy.secure(
      NextResponse.rewrite(replicationViewerRewriteUrl, {
        request: { headers: browserPolicy.requestHeaders },
      }),
    );
  }

  // The viewer route exists only as the rewrite target above; addressed
  // directly it would be a second URL for the gallery index.
  if (appPath.startsWith(REPLICATION_VIEWER_ROUTE_PREFIX)) {
    return browserPolicy.secure(
      NextResponse.rewrite(new URL(FLAVOR_GATED_NOT_FOUND_PATH, request.url), {
        request: { headers: browserPolicy.requestHeaders },
      }),
    );
  }

  // Dynamic replication and substance pages are generated on first request so
  // clean deployments stay bounded. Next streams an in-page `notFound()` at
  // HTTP 200, so reject slugs absent from the build's public corpus here and
  // let the deliberately unroutable target produce a real 404. A mirror host
  // rewrites to its own 404 page instead, carrying the status here, so the
  // 404 renders in the mirror's language as ordinary server output.
  if (isUnavailablePublicDynamicPath(appPath)) {
    const mirrorHost = localeForHost(request.headers.get("host"));
    const target = mirrorHost
      ? localizedNotFoundRoutePath(mirrorHost)
      : FLAVOR_GATED_NOT_FOUND_PATH;
    return browserPolicy.secure(
      NextResponse.rewrite(new URL(target, request.url), {
        status: mirrorHost ? 404 : undefined,
        request: { headers: browserPolicy.requestHeaders },
      }),
    );
  }

  // The pre-launch prefix is now compatibility-only. One permanent redirect collapses old
  // preview links onto the launched address while preserving query parameters.
  if (isPreviewRequest) {
    const launchedUrl = request.nextUrl.clone();
    launchedUrl.pathname = appPath;
    return browserPolicy.secure(NextResponse.redirect(launchedUrl, 308));
  }

  // Locale mirrors: `zh.dose.wiki/<slug>` renders the localized article route;
  // category and chemical-class details, other record paths
  // (`/effects/<slug>`, `/reports/<slug>`, ..., psychoactive summaries), and
  // supported Substance Index class views render their localized detail or
  // index routes. The homepage, indexes, tab views, and `/search` likewise
  // render localized routes with the query string intact. Every other path on
  // the mirror host serves the English page so navigation never leaves it. A
  // route addressed directly on any other host would be a second URL for the
  // page, so it is unroutable there.
  const localeHost = localeForHost(request.headers.get("host"));
  const localizedSlug = localeHost ? publicSubstanceSlugForPath(appPath) : null;
  if (localeHost && localizedSlug) {
    const mirrorUrl = request.nextUrl.clone();
    mirrorUrl.pathname = localizedArticleRoutePath(localeHost, localizedSlug);
    return browserPolicy.secure(
      NextResponse.rewrite(mirrorUrl, { request: { headers: browserPolicy.requestHeaders } }),
    );
  }
  const localizedRecord = localeHost ? localizedRecordRoutePath(localeHost, appPath) : null;
  if (localeHost && localizedRecord) {
    const mirrorUrl = request.nextUrl.clone();
    mirrorUrl.pathname = localizedRecord.path;
    return browserPolicy.secure(
      NextResponse.rewrite(mirrorUrl, { request: { headers: browserPolicy.requestHeaders } }),
    );
  }
  const localizedIndexPath = localeHost ? localizedIndexRoutePath(localeHost, appPath) : null;
  if (localeHost && localizedIndexPath) {
    const mirrorUrl = request.nextUrl.clone();
    mirrorUrl.pathname = localizedIndexPath;
    return browserPolicy.secure(
      NextResponse.rewrite(mirrorUrl, { request: { headers: browserPolicy.requestHeaders } }),
    );
  }
  if (!localeHost && localeForPathPrefix(appPath)) {
    return browserPolicy.secure(
      NextResponse.rewrite(new URL(FLAVOR_GATED_NOT_FOUND_PATH, request.url), {
        request: { headers: browserPolicy.requestHeaders },
      }),
    );
  }

  if (delivery === "editor" || !request.nextUrl.pathname.startsWith("/dev")) {
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
  // Static assets MUST traverse the fail-closed editor deployment gate too.
  matcher: ["/:path*"],
};

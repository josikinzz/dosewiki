"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { RouteAnnouncer } from "@/components/common/RouteAnnouncer";
import { viewToPath } from "@/utils/routing";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { isEffectIndex } from "@/config/siteFlavor";
import { toAppPath, toPreviewPath, isPreviewPath } from "@/utils/previewPath";
import { isPublicConstructionHost } from "@server/next/publicConstructionPolicy";

/**
 * The pathname as the app models routes, with any `/preview` prefix removed.
 *
 * On the construction hosts the whole site is addressed under `/preview` (see
 * `src/utils/previewPath.ts`), and the browser keeps that prefix because the middleware
 * rewrites rather than redirects. Every chrome decision below — the homepage's collapsed
 * header, the suppressed home footer, the announced page title — is a pathname
 * comparison, and each one would fall through on `/preview/home`.
 */
function useAppPathname(): string {
  return toAppPath(usePathname());
}

function getWindowSearchQuery() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function useRouteChromeModel() {
  const pathname = useAppPathname();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const syncSearchQuery = () => setSearchQuery(getWindowSearchQuery());

    syncSearchQuery();
    window.addEventListener("popstate", syncSearchQuery);

    return () => {
      window.removeEventListener("popstate", syncSearchQuery);
    };
  }, [pathname]);

  return {
    model: useMemo(() => getRouteChromeModel(pathname, searchQuery), [pathname, searchQuery]),
    setSearchQuery,
  };
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function resetDocumentScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

/** First sign the reader has taken the scroll position over themselves. */
const READER_TAKEOVER_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * One reset at the route change plus two short corrective passes, because the
 * new page keeps laying out after its first paint — fonts, images and
 * client-fetched sections all move the top of the document out from under the
 * initial reset.
 *
 * The corrections stand down the instant the reader scrolls, the same bargain
 * `AnchorScrollRestore` makes. Without that guard a reader who starts reading
 * while the route is still settling gets thrown back to the top mid-sentence,
 * and the old unguarded cascade kept doing it for a full second after the
 * pathname committed.
 */
function schedulePostNavigationScrollReset() {
  resetDocumentScroll();

  const timeoutIds = [0, 50, 150].map((delay) => window.setTimeout(resetDocumentScroll, delay));
  const frameId = window.requestAnimationFrame?.(() => {
    resetDocumentScroll();
  });

  const stopResetting = () => {
    timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));

    if (frameId !== undefined) {
      window.cancelAnimationFrame?.(frameId);
    }

    for (const event of READER_TAKEOVER_EVENTS) {
      window.removeEventListener(event, stopResetting);
    }
  };

  for (const event of READER_TAKEOVER_EVENTS) {
    window.addEventListener(event, stopResetting, { passive: true, once: true });
  }

  return stopResetting;
}

function useManualScrollRestoration() {
  useEffect(() => {
    if (!("scrollRestoration" in window.history)) {
      return;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);
}

/**
 * `disabled` still tracks the pathname — it only withholds the scroll reset —
 * so a surface can opt out without the hook losing its place. The review
 * workbench does: it changes the address once per article with the History API
 * and scrolls to the top of the next article itself, so this hook's corrective
 * passes would be firing over a reviewer who has already started reading.
 *
 * This is the only scroll reset a route change gets. Scheduling one at click
 * time as well used to scroll the *outgoing* page while the reader was still
 * looking at it, and left two overlapping correction windows on slow routes.
 */
export function useResetScrollOnPathnameChange(
  pathname: string,
  options?: { disabled?: boolean },
) {
  const previousPathnameRef = useRef(pathname);
  const disabled = options?.disabled ?? false;

  useIsomorphicLayoutEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    if (disabled || previousPathname === pathname || window.location.hash) {
      return;
    }

    return schedulePostNavigationScrollReset();
  }, [disabled, pathname]);
}

/** Surfaces that own their own scroll behaviour across address changes. */
export function isSelfScrollingRoute(pathname: string): boolean {
  return pathname === "/review" || pathname.startsWith("/review/");
}

/**
 * Whether the site header must stand down for this address.
 *
 * Two of the three cases are ordinary route facts. The third is not: the construction
 * hosts serve the landing at the bare `/` by rewrite, so the document the server rendered
 * is `/under-construction` and already carries no chrome - but the browser's address
 * stays `/`, and deciding on the pathname alone would hydrate a second header above the
 * landing's own. The host is what distinguishes it, and it is only knowable in the
 * browser; that is sound because the server never sees a host here, so the hydrated tree
 * still matches the HTML it is hydrating.
 *
 * The *request* path is what that case keys on. `/preview/home` models `/` too, and that
 * address is the real homepage - chrome and all.
 */
export function isChromelessAddress(
  requestPathname: string,
  appPathname: string,
  options: { homeConstructionMode?: boolean; host?: string | null } = {},
): boolean {
  if (appPathname === "/under-construction") {
    return true;
  }

  if (appPathname === "/" && options.homeConstructionMode) {
    return true;
  }

  if (requestPathname === "/" && isPublicConstructionHost(options.host)) {
    return true;
  }

  // The review workbench is a full-bleed editor surface with its own sticky command bar;
  // the public site header would just push the article down.
  return (
    appPathname === "/mantras" ||
    appPathname === "/review" ||
    appPathname.startsWith("/review/")
  );
}

interface RouteChromeProps {
  homeConstructionMode?: boolean;
}

export function RouteChrome({ homeConstructionMode = false }: RouteChromeProps) {
  const router = useRouter();
  const requestPathname = usePathname();
  const pathname = toAppPath(requestPathname);
  const { model, setSearchQuery } = useRouteChromeModel();
  const liveSearchOriginViewRef = useRef<Parameters<typeof viewToPath>[0] | null>(null);
  useManualScrollRestoration();
  useResetScrollOnPathnameChange(pathname, {
    disabled: isSelfScrollingRoute(pathname),
  });

  // Header navigation pushes app paths. Inside the preview address space they have to be
  // re-prefixed: the middleware would bounce a bare push back under `/preview` anyway, and
  // routing straight there spares every header click a redirect round trip.
  const navigationHref = (view: Parameters<typeof viewToPath>[0]) => {
    const href = viewToPath(view);
    return isPreviewPath(requestPathname) ? toPreviewPath(href) : href;
  };

  const pushView = (nextView: Parameters<typeof viewToPath>[0]) => {
    if (nextView.type === "search") {
      if (model.currentView.type !== "search") {
        liveSearchOriginViewRef.current = model.currentView;
      }
      setSearchQuery(nextView.query);
    } else {
      liveSearchOriginViewRef.current = null;
    }
    router.push(navigationHref(nextView));
  };

  const replaceView = (nextView: Parameters<typeof viewToPath>[0]) => {
    if (nextView.type === "search") {
      setSearchQuery(nextView.query);
    } else {
      liveSearchOriginViewRef.current = null;
    }
    router.replace(navigationHref(nextView), { scroll: false });
  };

  const pushLiveSearchView = (nextView: Parameters<typeof viewToPath>[0]) => {
    if (nextView.type !== "search") {
      pushView(nextView);
      return;
    }

    if (model.currentView.type !== "search") {
      liveSearchOriginViewRef.current = model.currentView;
    }
    setSearchQuery(nextView.query);
    router.push(navigationHref(nextView), { scroll: false });
  };

  if (
    isChromelessAddress(requestPathname, pathname, {
      homeConstructionMode,
      host: typeof window === "undefined" ? null : window.location.host,
    })
  ) {
    return <RouteAnnouncer message={model.pageTitle} />;
  }

  return (
    <>
      <RouteAnnouncer message={model.pageTitle} />
      <Header
        model={model}
        onNavigate={pushView}
        onReplaceNavigate={replaceView}
        onLiveNavigate={pushLiveSearchView}
        liveSearchClearView={liveSearchOriginViewRef.current}
        // dose.wiki's "/" is a full-viewport splash whose own tile grid IS the
        // navigation, so the header collapses to a hamburger there. Effect
        // Index's "/" is an ordinary content page (two columns of panels), and
        // the original site showed its full nav on the homepage, so it keeps
        // the desktop nav and its dropdowns.
        forceMobileNav={pathname === "/" && !isEffectIndex()}
      />
    </>
  );
}

export function RouteFooter() {
  const pathname = useAppPathname();
  const { model } = useRouteChromeModel();

  // "/" is suppressed on dose.wiki because its homepage is a full-viewport
  // splash that a footer would push into a scroll. Effect Index's homepage is
  // an ordinary content page and the original site footered it, so it keeps
  // the footer.
  const suppressHomeFooter = pathname === "/" && !isEffectIndex();

  if (
    suppressHomeFooter ||
    pathname === "/mantras" ||
    pathname === "/under-construction" ||
    pathname === "/review" ||
    pathname.startsWith("/review/")
  ) {
    return null;
  }

  return <Footer model={model} />;
}

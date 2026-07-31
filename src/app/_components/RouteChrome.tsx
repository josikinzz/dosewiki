"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { RouteAnnouncer } from "@/components/common/RouteAnnouncer";
import { viewToPath } from "@/utils/routing";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { isEffectIndex } from "@/config/siteFlavor";

function getWindowSearchQuery() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function useRouteChromeModel() {
  const pathname = usePathname();
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

function schedulePostNavigationScrollReset() {
  resetDocumentScroll();

  const timeoutIds = [0, 50, 150, 300, 600, 1000].map((delay) => window.setTimeout(resetDocumentScroll, delay));
  const frameId = window.requestAnimationFrame?.(() => {
    resetDocumentScroll();
  });

  return () => {
    timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));

    if (frameId !== undefined) {
      window.cancelAnimationFrame?.(frameId);
    }
  };
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
 * and scrolls to the top of the next article itself, so this hook's six forced
 * `scrollTo(0, 0)` calls over the following second would be firing over a
 * reviewer who has already started reading.
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

export function shouldResetScrollForRouteChromeNavigation(
  currentView: Parameters<typeof viewToPath>[0],
  nextView: Parameters<typeof viewToPath>[0],
) {
  return currentView.type !== "search" || nextView.type !== "search";
}

interface RouteChromeProps {
  homeConstructionMode?: boolean;
}

export function RouteChrome({ homeConstructionMode = false }: RouteChromeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { model, setSearchQuery } = useRouteChromeModel();
  const liveSearchOriginViewRef = useRef<Parameters<typeof viewToPath>[0] | null>(null);
  useManualScrollRestoration();
  useResetScrollOnPathnameChange(pathname, {
    disabled: isSelfScrollingRoute(pathname),
  });

  const pushView = (nextView: Parameters<typeof viewToPath>[0]) => {
    schedulePostNavigationScrollReset();
    if (nextView.type === "search") {
      if (model.currentView.type !== "search") {
        liveSearchOriginViewRef.current = model.currentView;
      }
      setSearchQuery(nextView.query);
    } else {
      liveSearchOriginViewRef.current = null;
    }
    router.push(viewToPath(nextView));
  };

  const replaceView = (nextView: Parameters<typeof viewToPath>[0]) => {
    if (shouldResetScrollForRouteChromeNavigation(model.currentView, nextView)) {
      schedulePostNavigationScrollReset();
    }
    if (nextView.type === "search") {
      setSearchQuery(nextView.query);
    } else {
      liveSearchOriginViewRef.current = null;
    }
    router.replace(viewToPath(nextView), { scroll: false });
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
    router.push(viewToPath(nextView), { scroll: false });
  };

  if ((pathname === "/" && homeConstructionMode) || pathname === "/under-construction") {
    return <RouteAnnouncer message={model.pageTitle} />;
  }

  // The review workbench is a full-bleed editor surface with its own sticky
  // command bar; the public site header would just push the article down.
  if (pathname === "/mantras" || pathname === "/review" || pathname.startsWith("/review/")) {
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
  const pathname = usePathname();
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

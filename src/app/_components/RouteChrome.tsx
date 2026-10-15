"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { RouteAnnouncer } from "@/components/common/RouteAnnouncer";
import { NavigationProgress } from "./NavigationProgress";
import {
  beginPendingNavigation,
  finishPendingNavigation,
  type NavigationTransitionId,
} from "@/components/common/SmartLink";
import { isHomePathname, viewToPath } from "@/utils/routing";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { isEffectIndex, SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useT } from "@/i18n/client";

function getWindowSearchQuery() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function useRouteChromeModel() {
  const pathname = usePathname();
  const t = useT();
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
    model: useMemo(
      () => getRouteChromeModel(pathname, searchQuery, SITE_FLAVOR_CONFIG, t),
      [pathname, searchQuery, t],
    ),
    setSearchQuery,
  };
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function resetDocumentScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

const READER_TAKEOVER_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

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

export function isSelfScrollingRoute(pathname: string): boolean {
  return pathname === "/review" || pathname.startsWith("/review/");
}

export function isChromelessAddress(pathname: string): boolean {
  if (pathname === "/under-construction") {
    return true;
  }

  return (
    pathname === "/mantras" ||
    pathname === "/review" ||
    pathname.startsWith("/review/")
  );
}

export function RouteChrome() {
  const router = useRouter();
  const pathname = usePathname();
  const { model, setSearchQuery } = useRouteChromeModel();
  const liveSearchOriginViewRef = useRef<Parameters<typeof viewToPath>[0] | null>(null);
  const [isProgrammaticNavigationPending, startProgrammaticNavigation] = useTransition();
  const programmaticTransitionRef = useRef<NavigationTransitionId | null>(null);
  const runProgrammaticNavigation = (navigate: () => void) => {
    if (programmaticTransitionRef.current) {
      finishPendingNavigation(programmaticTransitionRef.current);
    }
    programmaticTransitionRef.current = beginPendingNavigation();
    startProgrammaticNavigation(navigate);
  };

  useEffect(() => {
    if (isProgrammaticNavigationPending || !programmaticTransitionRef.current) {
      return;
    }
    finishPendingNavigation(programmaticTransitionRef.current);
    programmaticTransitionRef.current = null;
  }, [isProgrammaticNavigationPending]);

  useEffect(() => () => {
    if (programmaticTransitionRef.current) {
      finishPendingNavigation(programmaticTransitionRef.current);
      programmaticTransitionRef.current = null;
    }
  }, []);
  useManualScrollRestoration();
  useResetScrollOnPathnameChange(pathname, {
    disabled: isSelfScrollingRoute(pathname),
  });

  const navigationHref = (view: Parameters<typeof viewToPath>[0]) => viewToPath(view);

  const pushView = (nextView: Parameters<typeof viewToPath>[0]) => {
    if (nextView.type === "search") {
      if (model.currentView.type !== "search") {
        liveSearchOriginViewRef.current = model.currentView;
      }
      setSearchQuery(nextView.query);
    } else {
      liveSearchOriginViewRef.current = null;
    }
    runProgrammaticNavigation(() => router.push(navigationHref(nextView)));
  };

  const replaceView = (nextView: Parameters<typeof viewToPath>[0]) => {
    if (nextView.type === "search") {
      setSearchQuery(nextView.query);
    } else {
      liveSearchOriginViewRef.current = null;
    }
    runProgrammaticNavigation(() => router.replace(navigationHref(nextView), { scroll: false }));
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
    runProgrammaticNavigation(() => router.push(navigationHref(nextView), { scroll: false }));
  };

  if (isChromelessAddress(pathname)) {
    return (
      <>
        <RouteAnnouncer message={model.pageTitle} />
        <NavigationProgress />
      </>
    );
  }

  return (
    <>
      <RouteAnnouncer message={model.pageTitle} />
      <NavigationProgress />
      <Header
        model={model}
        onNavigate={pushView}
        onReplaceNavigate={replaceView}
        onLiveNavigate={pushLiveSearchView}
        liveSearchClearView={liveSearchOriginViewRef.current}
        forceMobileNav={isHomePathname(pathname) && !isEffectIndex()}
      />
    </>
  );
}

export function RouteFooter() {
  const pathname = usePathname();
  const { model } = useRouteChromeModel();

  const suppressHomeFooter = isHomePathname(pathname) && !isEffectIndex();

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
